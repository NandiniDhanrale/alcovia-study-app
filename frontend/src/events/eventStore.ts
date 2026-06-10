// ============================================================
// Event Store — Frontend
//
// All state mutations go through here. Creates events, stores
// them locally, and marks them for sync.
// ============================================================

import { getDb } from '../db/database';
import { getDeviceId } from '../utils/deviceId';
import { increment } from '../utils/vectorClock';
import { generateUUID } from '../utils/idGenerator';
import { StudyEvent, EventType } from './types';
import { useAppStore } from '../store/appStore';

/**
 * Create and persist a new event locally.
 * This is the ONLY way to mutate state — everything goes through events.
 */
export function createEvent(
  type: EventType,
  entityId: string,
  payload: Record<string, unknown>
): StudyEvent {
  const db = getDb();
  const deviceId = getDeviceId();

  // Get current vector clock for this entity (or global device clock)
  const store = useAppStore.getState();
  const currentClock = store.vectorClocks[entityId] ?? store.vectorClocks['__global__'] ?? {};

  // Increment our counter in the clock
  const newClock = increment(currentClock, deviceId);
  const counter = newClock[deviceId] ?? 1;

  const event: StudyEvent = {
    eventId: generateUUID(),
    deviceId,
    counter,
    type,
    entityId,
    payload,
    vectorClock: newClock,
    createdAt: new Date().toISOString(),
  };

  // Persist locally (synced=0 = pending sync)
  db.runSync(
    `INSERT INTO events (eventId, deviceId, counter, type, entityId, payload, vectorClock, createdAt, synced)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      event.eventId,
      event.deviceId,
      event.counter,
      event.type,
      event.entityId,
      JSON.stringify(event.payload),
      JSON.stringify(event.vectorClock),
      event.createdAt,
    ]
  );

  // Update the store's vector clock for this entity
  store.updateVectorClock(entityId, newClock);
  store.updateVectorClock('__global__', newClock);

  console.log(`[EventStore] Created event ${event.type} (${event.eventId.slice(0, 8)}...)`);
  return event;
}

/**
 * Get all events not yet synced to server.
 */
export function getUnsyncedEvents(): StudyEvent[] {
  const db = getDb();
  const rows = db.getAllSync<{
    eventId: string; deviceId: string; counter: number; type: string;
    entityId: string; payload: string; vectorClock: string; createdAt: string;
  }>('SELECT * FROM events WHERE synced = 0 ORDER BY counter ASC');

  return rows.map(deserializeEvent);
}

/**
 * Mark events as synced after successful upload to server.
 */
export function markEventsSynced(eventIds: string[]): void {
  if (eventIds.length === 0) return;
  const db = getDb();
  const placeholders = eventIds.map(() => '?').join(',');
  db.runSync(
    `UPDATE events SET synced = 1 WHERE eventId IN (${placeholders})`,
    eventIds
  );
}

/**
 * Apply incoming events from server.
 * Uses processed_events table to prevent double-application.
 */
export function applyIncomingEvents(events: StudyEvent[]): void {
  const db = getDb();

  for (const event of events) {
    // Store the event if we don't have it
    const existing = db.getFirstSync<{ eventId: string }>(
      'SELECT eventId FROM events WHERE eventId = ?',
      [event.eventId]
    );

    if (!existing) {
      db.runSync(
        `INSERT OR IGNORE INTO events
           (eventId, deviceId, counter, type, entityId, payload, vectorClock, createdAt, synced)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          event.eventId,
          event.deviceId,
          event.counter,
          event.type,
          event.entityId,
          JSON.stringify(event.payload),
          JSON.stringify(event.vectorClock),
          event.createdAt,
        ]
      );
    }
  }
}

/**
 * Get all events (for Dev Panel display).
 */
export function getAllEvents(): (StudyEvent & { synced: number })[] {
  const db = getDb();
  const rows = db.getAllSync<{
    eventId: string; deviceId: string; counter: number; type: string;
    entityId: string; payload: string; vectorClock: string; createdAt: string; synced: number;
  }>('SELECT * FROM events ORDER BY counter DESC LIMIT 50');

  return rows.map(r => ({ ...deserializeEvent(r), synced: r.synced }));
}

function deserializeEvent(row: {
  eventId: string; deviceId: string; counter: number; type: string;
  entityId: string; payload: string; vectorClock: string; createdAt: string;
}): StudyEvent {
  return {
    eventId: row.eventId,
    deviceId: row.deviceId,
    counter: row.counter,
    type: row.type as EventType,
    entityId: row.entityId,
    payload: JSON.parse(row.payload),
    vectorClock: JSON.parse(row.vectorClock),
    createdAt: row.createdAt,
  };
}
