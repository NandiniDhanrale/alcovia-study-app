// ============================================================
// POST /sync — Core Sync Endpoint
//
// This is the heart of the offline-first sync system.
//
// Algorithm:
//   1. Receive events from client (may include duplicates)
//   2. Filter out events already seen (idempotency)
//   3. Store new events with server sequence numbers
//   4. Process new events against state tables
//   5. Return events the client hasn't seen yet
//
// The client sends its lastSyncedSequence; we return all events
// with sequenceNumber > lastSyncedSequence that didn't originate
// from this device (already known to sender).
// ============================================================

import { Router, Request, Response } from 'express';
import { getDb, nextSequenceNumber } from '../db/database';
import { processEvent } from '../events/eventProcessor';
import { StudyEvent } from '../events/types';

const router = Router();

interface SyncRequest {
  deviceId: string;
  lastSyncedSequence: number; // Client's watermark — return events after this
  events: StudyEvent[];
}

interface SyncResponse {
  missingEvents: StudyEvent[];
  serverSequence: number; // Latest sequence number client should store
}

router.post('/', (req: Request, res: Response) => {
  const db = getDb();

  const { deviceId, events = [], lastSyncedSequence = 0 }: SyncRequest = req.body;

  if (!deviceId) {
    res.status(400).json({ error: 'deviceId is required' });
    return;
  }

  console.log(`[Sync] Device ${deviceId} syncing ${events.length} events, lastSeq=${lastSyncedSequence}`);

  // Use a transaction for atomicity — either everything succeeds or nothing does
  const syncTransaction = db.transaction(() => {
    const newEventIds: string[] = [];

    for (const event of events) {
      // ---- Step 1: Check if we already have this event (idempotency) ----
      const existing = db.prepare(
        'SELECT eventId FROM events WHERE eventId = ?'
      ).get(event.eventId);

      if (existing) {
        console.log(`[Sync] Event ${event.eventId} already exists — skipping`);
        continue;
      }

      // ---- Step 2: Assign a server sequence number ----
      const seqNum = nextSequenceNumber(db);

      // ---- Step 3: Store the event ----
      db.prepare(`
        INSERT INTO events
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

      newEventIds.push(event.eventId);

      // ---- Step 4: Apply event to state projections ----
      try {
        processEvent(db, event);
      } catch (err) {
        console.error(`[Sync] Error processing event ${event.eventId}:`, err);
        // Don't fail the whole sync — log and continue
        // The event is stored; it can be reprocessed
      }
    }

    // ---- Step 5: Fetch events this client is missing ----
    // Return events with sequenceNumber > lastSyncedSequence
    // No need to filter by deviceId — clients can handle their own events (idempotent)
    const missingRows = db.prepare(`
      SELECT eventId, deviceId, type, entityId, payload, vectorClock, counter, createdAt, sequenceNumber
      FROM events
      WHERE sequenceNumber > ?
      ORDER BY sequenceNumber ASC
    `).all(lastSyncedSequence) as Array<{
      eventId: string;
      deviceId: string;
      type: string;
      entityId: string;
      payload: string;
      vectorClock: string;
      counter: number;
      createdAt: string;
      sequenceNumber: number;
    }>;

    const missingEvents: StudyEvent[] = missingRows.map((row) => ({
      eventId: row.eventId,
      deviceId: row.deviceId,
      type: row.type as StudyEvent['type'],
      entityId: row.entityId,
      payload: JSON.parse(row.payload),
      vectorClock: JSON.parse(row.vectorClock),
      counter: row.counter,
      createdAt: row.createdAt,
    }));

    // The latest sequence number to return to the client
    const latestSeq = missingRows.length > 0
      ? missingRows[missingRows.length - 1].sequenceNumber
      : lastSyncedSequence;

    console.log(
      `[Sync] Device ${deviceId}: stored ${newEventIds.length} new events, returning ${missingEvents.length} missing events`
    );

    return { missingEvents, serverSequence: latestSeq };
  });

  try {
    const result = syncTransaction() as SyncResponse;
    res.json(result);
  } catch (err) {
    console.error('[Sync] Transaction failed:', err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;
