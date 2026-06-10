// ============================================================
// Reward Idempotency Tests
// Ensures SESSION_COMPLETED events only award coins/streak once,
// even when replayed multiple times.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../src/db/database';
import { processEvent } from '../src/events/eventProcessor';
import { StudyEvent } from '../src/events/types';
import Database from 'better-sqlite3';

function makeSessionCompletedEvent(sessionId: string, eventId: string): StudyEvent {
  return {
    eventId,
    deviceId: 'client-a',
    counter: 1,
    type: 'SESSION_COMPLETED',
    entityId: sessionId,
    payload: {
      sessionId,
      actualDuration: 25,
      studentId: 'student-1',
    },
    vectorClock: { 'client-a': 1 },
    createdAt: new Date().toISOString(),
  };
}

function seedSession(db: Database.Database, sessionId: string) {
  db.prepare(`
    INSERT INTO focus_sessions (sessionId, studentId, status, targetDuration, startedAt)
    VALUES (?, 'student-1', 'RUNNING', 25, datetime('now'))
  `).run(sessionId);
}

function getUserCoins(db: Database.Database): number {
  const user = db.prepare('SELECT coins FROM users WHERE studentId = ?').get('student-1') as { coins: number };
  return user.coins;
}

function getUserStreak(db: Database.Database): number {
  const user = db.prepare('SELECT streak FROM users WHERE studentId = ?').get('student-1') as { streak: number };
  return user.streak;
}

describe('Reward Idempotency', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('awards exactly 50 coins for a single successful session', () => {
    seedSession(db, 'session-1');
    const event = makeSessionCompletedEvent('session-1', 'evt-1');

    processEvent(db, event);

    expect(getUserCoins(db)).toBe(50);
  });

  it('does NOT award coins twice when the same event is replayed', () => {
    seedSession(db, 'session-1');
    const event = makeSessionCompletedEvent('session-1', 'evt-1');

    // Replay the same event 5 times
    processEvent(db, event);
    processEvent(db, event);
    processEvent(db, event);
    processEvent(db, event);
    processEvent(db, event);

    expect(getUserCoins(db)).toBe(50); // Still only 50, not 250
  });

  it('awards coins for different sessions with different eventIds', () => {
    seedSession(db, 'session-1');
    seedSession(db, 'session-2');

    processEvent(db, makeSessionCompletedEvent('session-1', 'evt-1'));
    processEvent(db, makeSessionCompletedEvent('session-2', 'evt-2'));

    expect(getUserCoins(db)).toBe(100); // 50 + 50
  });

  it('records eventId in processed_events table after rewarding', () => {
    seedSession(db, 'session-1');
    const event = makeSessionCompletedEvent('session-1', 'evt-1');

    processEvent(db, event);

    const processed = db.prepare('SELECT 1 FROM processed_events WHERE eventId = ?').get('evt-1');
    expect(processed).toBeTruthy();
  });

  it('increments streak by 1 per session (not per replay)', () => {
    seedSession(db, 'session-1');
    const event = makeSessionCompletedEvent('session-1', 'evt-1');

    // Replay 3 times
    processEvent(db, event);
    processEvent(db, event);
    processEvent(db, event);

    expect(getUserStreak(db)).toBe(1);
  });

  it('FAILED sessions do not award coins', () => {
    seedSession(db, 'session-fail');

    const failEvent: StudyEvent = {
      eventId: 'evt-fail',
      deviceId: 'client-a',
      counter: 1,
      type: 'SESSION_FAILED',
      entityId: 'session-fail',
      payload: {
        sessionId: 'session-fail',
        failureReason: 'give_up',
        studentId: 'student-1',
      },
      vectorClock: { 'client-a': 1 },
      createdAt: new Date().toISOString(),
    };

    processEvent(db, failEvent);

    expect(getUserCoins(db)).toBe(0);
    expect(getUserStreak(db)).toBe(0);
  });

  it('focuses minutes are tracked correctly', () => {
    seedSession(db, 'session-1');
    const event = makeSessionCompletedEvent('session-1', 'evt-1');

    processEvent(db, event);

    const user = db.prepare('SELECT focusMinutes FROM users WHERE studentId = ?').get('student-1') as { focusMinutes: number };
    expect(user.focusMinutes).toBe(25);
  });
});
