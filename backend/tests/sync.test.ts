// ============================================================
// Sync Engine Tests
// Tests incremental sync, event deduplication, and out-of-order events
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../src/db/database';
import { StudyEvent } from '../src/events/types';
import Database from 'better-sqlite3';

// Helper to insert events directly into a test DB (simulates the sync route)
function insertEvent(db: Database.Database, event: StudyEvent): number {
  // Get next sequence
  const seq = db.prepare('INSERT INTO event_sequence (dummy) VALUES (1)').run();
  const seqNum = Number(seq.lastInsertRowid);

  db.prepare(`
    INSERT OR IGNORE INTO events
      (eventId, deviceId, type, entityId, payload, vectorClock, counter, createdAt, sequenceNumber)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    event.eventId,
    event.deviceId,
    event.type,
    event.entityId,
    JSON.stringify(event.payload),
    JSON.stringify(event.vectorClock),
    event.counter,
    event.createdAt,
    seqNum
  );

  return seqNum;
}

function getMissingEvents(db: Database.Database, lastSyncedSequence: number): StudyEvent[] {
  const rows = db.prepare(`
    SELECT * FROM events WHERE sequenceNumber > ? ORDER BY sequenceNumber ASC
  `).all(lastSyncedSequence) as Array<{
    eventId: string; deviceId: string; type: string; entityId: string;
    payload: string; vectorClock: string; counter: number; createdAt: string;
  }>;

  return rows.map(r => ({
    eventId: r.eventId,
    deviceId: r.deviceId,
    type: r.type as StudyEvent['type'],
    entityId: r.entityId,
    payload: JSON.parse(r.payload),
    vectorClock: JSON.parse(r.vectorClock),
    counter: r.counter,
    createdAt: r.createdAt,
  }));
}

function makeEvent(overrides: Partial<StudyEvent> = {}): StudyEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    deviceId: 'client-a',
    counter: 1,
    type: 'TASK_CREATED',
    entityId: 'task-1',
    payload: { taskId: 'task-1', chapterId: 'ch-1', name: 'Test Task', studentId: 'student-1' },
    vectorClock: { 'client-a': 1 },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Sync Engine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('stores new events and returns them to other devices', () => {
    const event = makeEvent({ deviceId: 'client-a' });
    insertEvent(db, event);

    const missing = getMissingEvents(db, 0);
    expect(missing).toHaveLength(1);
    expect(missing[0].eventId).toBe(event.eventId);
  });

  it('does not store duplicate events (idempotency)', () => {
    const event = makeEvent();

    // Insert same event twice
    insertEvent(db, event);
    // Second insert should be ignored (INSERT OR IGNORE)
    insertEvent(db, event);

    const allEvents = db.prepare('SELECT * FROM events').all();
    expect(allEvents).toHaveLength(1);
  });

  it('returns only events after lastSyncedSequence (incremental sync)', () => {
    const evt1 = makeEvent({ eventId: 'evt-1' });
    const evt2 = makeEvent({ eventId: 'evt-2' });
    const evt3 = makeEvent({ eventId: 'evt-3' });

    const seq1 = insertEvent(db, evt1);
    insertEvent(db, evt2);
    insertEvent(db, evt3);

    const missing = getMissingEvents(db, seq1);
    expect(missing).toHaveLength(2);
    expect(missing.map(e => e.eventId)).toEqual(['evt-2', 'evt-3']);
  });

  it('handles out-of-order event insertion correctly', () => {
    // Simulate Device B receiving events from A out of order
    const evt3 = makeEvent({ eventId: 'evt-3', counter: 3, vectorClock: { 'client-a': 3 } });
    const evt1 = makeEvent({ eventId: 'evt-1', counter: 1, vectorClock: { 'client-a': 1 } });
    const evt2 = makeEvent({ eventId: 'evt-2', counter: 2, vectorClock: { 'client-a': 2 } });

    // Insert out of order
    insertEvent(db, evt3);
    insertEvent(db, evt1);
    insertEvent(db, evt2);

    // All 3 should be stored
    const allEvents = db.prepare('SELECT eventId FROM events ORDER BY sequenceNumber').all() as { eventId: string }[];
    expect(allEvents).toHaveLength(3);
    // All event IDs present
    expect(allEvents.map(e => e.eventId)).toContain('evt-1');
    expect(allEvents.map(e => e.eventId)).toContain('evt-2');
    expect(allEvents.map(e => e.eventId)).toContain('evt-3');
  });

  it('returns all events to a new device (lastSyncedSequence = 0)', () => {
    insertEvent(db, makeEvent({ eventId: 'e1' }));
    insertEvent(db, makeEvent({ eventId: 'e2' }));

    const missing = getMissingEvents(db, 0);
    expect(missing).toHaveLength(2);
  });

  it('returns empty array when client is already up to date', () => {
    const e = makeEvent();
    const seq = insertEvent(db, e);

    const missing = getMissingEvents(db, seq);
    expect(missing).toHaveLength(0);
  });
});
