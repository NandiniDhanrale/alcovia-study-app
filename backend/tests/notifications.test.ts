// ============================================================
// Notification Idempotency Tests
// Tests that the notification_log prevents duplicate notifications
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../src/db/database';
import Database from 'better-sqlite3';

function checkNotificationLog(db: Database.Database, eventId: string): boolean {
  const row = db.prepare('SELECT 1 FROM notification_log WHERE eventId = ?').get(eventId);
  return !!row;
}

function recordNotification(db: Database.Database, eventId: string, streak: number, coins: number): boolean {
  try {
    db.prepare('INSERT INTO notification_log (eventId, streak, coins) VALUES (?, ?, ?)').run(eventId, streak, coins);
    return true; // Successfully recorded — notification should be sent
  } catch {
    return false; // Already exists — notification already sent
  }
}

describe('Notification Idempotency', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('notification_log does not contain event before first notification', () => {
    expect(checkNotificationLog(db, 'evt-1')).toBe(false);
  });

  it('records notification successfully on first attempt', () => {
    const recorded = recordNotification(db, 'evt-1', 3, 150);
    expect(recorded).toBe(true);
    expect(checkNotificationLog(db, 'evt-1')).toBe(true);
  });

  it('rejects duplicate notification for same eventId', () => {
    recordNotification(db, 'evt-1', 3, 150); // First: succeeds
    const secondAttempt = recordNotification(db, 'evt-1', 3, 150); // Second: rejected
    expect(secondAttempt).toBe(false);
  });

  it('allows notifications for different eventIds', () => {
    const first = recordNotification(db, 'evt-1', 1, 50);
    const second = recordNotification(db, 'evt-2', 2, 100);
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('simulates n8n workflow: check before send, record after send', () => {
    const eventId = 'session-success-evt';
    const notificationsSent: string[] = [];

    // Simulate n8n workflow being triggered 3 times with same event
    function simulateN8nRun(id: string): void {
      const alreadySent = checkNotificationLog(db, id);
      if (alreadySent) {
        console.log(`[n8n] Event ${id} already processed — stopping workflow`);
        return;
      }

      // "Send" the notification
      notificationsSent.push(id);

      // Record in log (idempotency write)
      recordNotification(db, id, 1, 50);
    }

    simulateN8nRun(eventId);
    simulateN8nRun(eventId); // Replay
    simulateN8nRun(eventId); // Another replay

    expect(notificationsSent).toHaveLength(1); // Only sent once
  });

  it('notification_log uses eventId as PRIMARY KEY (uniqueness enforced)', () => {
    db.prepare('INSERT INTO notification_log (eventId, streak, coins) VALUES (?, ?, ?)').run('evt-x', 1, 50);

    expect(() => {
      db.prepare('INSERT INTO notification_log (eventId, streak, coins) VALUES (?, ?, ?)').run('evt-x', 2, 100);
    }).toThrow();
  });
});
