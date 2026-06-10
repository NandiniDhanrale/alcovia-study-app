// ============================================================
// Frontend Event Processor
//
// Applies events to local SQLite state tables.
// Called after receiving events from the server during sync.
// Mirrors the server-side processor but without webhook calls.
// ============================================================

import { getDb } from '../db/database';
import { StudyEvent, TaskStatus } from './types';
import { compare, merge, VectorClock } from '../utils/vectorClock';

const STATUS_PRIORITY: Record<TaskStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  DONE: 2,
};

/**
 * Apply a batch of incoming events to local state.
 * Idempotent — safe to replay.
 */
export function applyEventsToLocalState(events: StudyEvent[]): void {
  // Sort by counter to ensure causal order within a device
  const sorted = [...events].sort((a, b) => {
    if (a.deviceId === b.deviceId) return a.counter - b.counter;
    return a.createdAt.localeCompare(b.createdAt);
  });

  for (const event of sorted) {
    applyEvent(event);
  }
}

function applyEvent(event: StudyEvent): void {
  const db = getDb();

  // Check if already processed
  const alreadyProcessed = db.getFirstSync<{ eventId: string }>(
    'SELECT eventId FROM processed_events WHERE eventId = ?',
    [event.eventId]
  );
  if (alreadyProcessed) return;

  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    case 'SESSION_STARTED':
      db.runSync(
        `INSERT OR IGNORE INTO sessions (sessionId, status, targetDuration, startedAt)
         VALUES (?, 'RUNNING', ?, ?)`,
        [payload.sessionId as string, payload.targetDuration as number, event.createdAt]
      );
      break;

    case 'SESSION_COMPLETED':
      db.runSync(
        `UPDATE sessions SET status = 'SUCCESS', actualDuration = ?, completedAt = ?
         WHERE sessionId = ? AND status = 'RUNNING'`,
        [payload.actualDuration as number, event.createdAt, payload.sessionId as string]
      );
      break;

    case 'SESSION_FAILED':
      db.runSync(
        `UPDATE sessions SET status = 'FAILED', failureReason = ?, completedAt = ?
         WHERE sessionId = ?`,
        [payload.failureReason as string, event.createdAt, payload.sessionId as string]
      );
      break;

    case 'SUBJECT_CREATED':
      db.runSync(
        `INSERT OR IGNORE INTO subjects (subjectId, name, vectorClock)
         VALUES (?, ?, ?)`,
        [payload.subjectId as string, payload.name as string, JSON.stringify(event.vectorClock)]
      );
      break;

    case 'CHAPTER_CREATED':
      db.runSync(
        `INSERT OR IGNORE INTO chapters (chapterId, subjectId, name, vectorClock)
         VALUES (?, ?, ?, ?)`,
        [payload.chapterId as string, payload.subjectId as string, payload.name as string, JSON.stringify(event.vectorClock)]
      );
      break;

    case 'TASK_CREATED':
      db.runSync(
        `INSERT OR IGNORE INTO tasks (taskId, chapterId, name, status, vectorClock)
         VALUES (?, ?, ?, 'NOT_STARTED', ?)`,
        [payload.taskId as string, payload.chapterId as string, payload.name as string, JSON.stringify(event.vectorClock)]
      );
      break;

    case 'TASK_STATUS_CHANGED':
      applyTaskStatusChange(event, payload);
      break;

    case 'TASK_DELETED':
      db.runSync(
        `UPDATE tasks SET deleted = 1, vectorClock = ? WHERE taskId = ?`,
        [JSON.stringify(event.vectorClock), payload.taskId as string]
      );
      break;
  }

  // Mark as processed
  db.runSync(
    'INSERT OR IGNORE INTO processed_events (eventId) VALUES (?)',
    [event.eventId]
  );
}

function applyTaskStatusChange(event: StudyEvent, payload: Record<string, unknown>): void {
  const db = getDb();
  const taskId = payload.taskId as string;
  const newStatus = payload.newStatus as TaskStatus;

  const existing = db.getFirstSync<{ status: string; deleted: number; vectorClock: string }>(
    'SELECT status, deleted, vectorClock FROM tasks WHERE taskId = ?',
    [taskId]
  );

  if (!existing) return;
  if (existing.deleted) return; // Deletion wins

  const existingClock: VectorClock = JSON.parse(existing.vectorClock || '{}');
  const incomingClock: VectorClock = event.vectorClock;
  const relation = compare(incomingClock, existingClock);

  if (relation === 'BEFORE') return; // Stale

  if (relation === 'CONCURRENT') {
    const incomingPriority = STATUS_PRIORITY[newStatus];
    const existingPriority = STATUS_PRIORITY[existing.status as TaskStatus];
    if (incomingPriority <= existingPriority) {
      // Keep existing (higher priority wins), but merge clock
      db.runSync(
        'UPDATE tasks SET vectorClock = ? WHERE taskId = ?',
        [JSON.stringify(merge(existingClock, incomingClock)), taskId]
      );
      return;
    }
  }

  const mergedClock = merge(existingClock, incomingClock);
  db.runSync(
    'UPDATE tasks SET status = ?, vectorClock = ? WHERE taskId = ?',
    [newStatus, JSON.stringify(mergedClock), taskId]
  );
}
