// ============================================================
// Notification Idempotency Tests
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../src/db/database';
import Database from 'better-sqlite3';

function checkNotificationLog(db: Database.Database, eventId: string): boolean {
  const row = db.prepare('SELECT 1 FROM notification_log WHERE eventId = ?').get(eventId);
  return !!row;
}

function claimNotification(db: Database.Database, eventId: string, streak: number, coins: number): boolean {
  try {
    db.prepare('INSERT INTO notification_log (eventId, streak, coins) VALUES (?, ?, ?)').run(eventId, streak, coins);
    return true;
  } catch {
    return false;
  }
}

function markSent(db: Database.Database, eventId: string, streak: number, coins: number): boolean {
  const result = db.prepare(`
    UPDATE notification_log
    SET sentAt = datetime('now'), streak = ?, coins = ?
    WHERE eventId = ?
  `).run(streak, coins, eventId);

  return result.changes === 1;
}

describe('Notification Idempotency', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('notification_log does not contain event before first notification', () => {
    expect(checkNotificationLog(db, 'evt-1')).toBe(false);
  });

  it('claims notification successfully on first attempt', () => {
    const recorded = claimNotification(db, 'evt-1', 3, 150);
    expect(recorded).toBe(true);
    expect(checkNotificationLog(db, 'evt-1')).toBe(true);
  });

  it('rejects duplicate claims for the same eventId', () => {
    claimNotification(db, 'evt-1', 3, 150);
    const secondAttempt = claimNotification(db, 'evt-1', 3, 150);
    expect(secondAttempt).toBe(false);
  });

  it('allows claims for different eventIds', () => {
    const first = claimNotification(db, 'evt-1', 1, 50);
    const second = claimNotification(db, 'evt-2', 2, 100);
    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('simulates n8n workflow: claim before send, mark sent after send', () => {
    const eventId = 'session-success-evt';
    const notificationsSent: string[] = [];

    function simulateN8nRun(id: string): void {
      const claimed = claimNotification(db, id, 1, 50);
      if (!claimed) {
        return;
      }

      notificationsSent.push(id);
      markSent(db, id, 1, 50);
    }

    simulateN8nRun(eventId);
    simulateN8nRun(eventId);
    simulateN8nRun(eventId);

    expect(notificationsSent).toHaveLength(1);
  });

  it('sentAt stays null until the send step completes', () => {
    claimNotification(db, 'evt-1', 3, 150);

    const beforeSend = db.prepare(
      'SELECT sentAt FROM notification_log WHERE eventId = ?'
    ).get('evt-1') as { sentAt: string | null };
    expect(beforeSend.sentAt).toBeNull();

    const marked = markSent(db, 'evt-1', 3, 150);
    expect(marked).toBe(true);

    const afterSend = db.prepare(
      'SELECT sentAt FROM notification_log WHERE eventId = ?'
    ).get('evt-1') as { sentAt: string | null };
    expect(afterSend.sentAt).not.toBeNull();
  });

  it('notification_log uses eventId as PRIMARY KEY (uniqueness enforced)', () => {
    db.prepare('INSERT INTO notification_log (eventId, streak, coins) VALUES (?, ?, ?)').run('evt-x', 1, 50);

    expect(() => {
      db.prepare('INSERT INTO notification_log (eventId, streak, coins) VALUES (?, ?, ?)').run('evt-x', 2, 100);
    }).toThrow();
  });
});
