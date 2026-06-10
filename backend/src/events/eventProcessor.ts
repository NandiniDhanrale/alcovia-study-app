// ============================================================
// Server-Side Event Processor
//
// This module applies incoming events to the server's state tables.
// It is responsible for:
//   1. Conflict resolution using vector clocks
//   2. Idempotent reward processing
//   3. Triggering webhook notifications for successful sessions
//
// Design principle: events are the source of truth.
// State tables (focus_sessions, tasks, etc.) are derived projections.
// ============================================================

import Database from 'better-sqlite3';
import axios from 'axios';
import {
  StudyEvent,
  TaskStatus,
  SessionStartedPayload,
  SessionCompletedPayload,
  SessionFailedPayload,
  TaskStatusChangedPayload,
  TaskDeletedPayload,
  SubjectCreatedPayload,
  ChapterCreatedPayload,
  TaskCreatedPayload,
} from './types';
import { compare, merge, VectorClock } from '../utils/vectorClock';

const STUDENT_ID = 'student-1';

// Priority order for task status conflict resolution
// Higher index = higher priority. DONE always wins.
const STATUS_PRIORITY: Record<TaskStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 1,
  DONE: 2,
};

/**
 * Process a single event against the database state.
 * This function is idempotent — replaying the same event is safe.
 */
export function processEvent(db: Database.Database, event: StudyEvent): void {
  const payload = event.payload as Record<string, unknown>;

  switch (event.type) {
    case 'SESSION_STARTED':
      handleSessionStarted(db, event, payload as unknown as SessionStartedPayload);
      break;
    case 'SESSION_COMPLETED':
      handleSessionCompleted(db, event, payload as unknown as SessionCompletedPayload);
      break;
    case 'SESSION_FAILED':
      handleSessionFailed(db, event, payload as unknown as SessionFailedPayload);
      break;
    case 'TASK_STATUS_CHANGED':
      handleTaskStatusChanged(db, event, payload as unknown as TaskStatusChangedPayload);
      break;
    case 'TASK_DELETED':
      handleTaskDeleted(db, event, payload as unknown as TaskDeletedPayload);
      break;
    case 'SUBJECT_CREATED':
      handleSubjectCreated(db, payload as unknown as SubjectCreatedPayload, event.vectorClock);
      break;
    case 'CHAPTER_CREATED':
      handleChapterCreated(db, payload as unknown as ChapterCreatedPayload, event.vectorClock);
      break;
    case 'TASK_CREATED':
      handleTaskCreated(db, payload as unknown as TaskCreatedPayload, event.vectorClock);
      break;
    default:
      console.warn(`[EventProcessor] Unknown event type: ${event.type}`);
  }
}

// ---- Handlers ----

function handleSessionStarted(
  db: Database.Database,
  event: StudyEvent,
  payload: SessionStartedPayload
): void {
  db.prepare(`
    INSERT OR IGNORE INTO focus_sessions
      (sessionId, studentId, status, targetDuration, startedAt)
    VALUES (?, ?, 'RUNNING', ?, ?)
  `).run(payload.sessionId, STUDENT_ID, payload.targetDuration, event.createdAt);
}

function handleSessionCompleted(
  db: Database.Database,
  event: StudyEvent,
  payload: SessionCompletedPayload
): void {
  // Update session record
  db.prepare(`
    UPDATE focus_sessions
    SET status = 'SUCCESS', actualDuration = ?, completedAt = ?
    WHERE sessionId = ? AND status = 'RUNNING'
  `).run(payload.actualDuration, event.createdAt, payload.sessionId);

  // ---- Idempotent reward processing ----
  // Check if this event was already processed for rewards
  const alreadyProcessed = db.prepare(
    'SELECT 1 FROM processed_events WHERE eventId = ?'
  ).get(event.eventId);

  if (alreadyProcessed) {
    console.log(`[Rewards] Event ${event.eventId} already processed — skipping`);
    return;
  }

  // Award coins and update streak/focus time
  db.prepare(`
    UPDATE users
    SET coins = coins + 50,
        streak = streak + 1,
        focusMinutes = focusMinutes + ?,
        updatedAt = datetime('now')
    WHERE studentId = ?
  `).run(payload.actualDuration, STUDENT_ID);

  // Mark event as processed (idempotency guard)
  db.prepare(
    'INSERT INTO processed_events (eventId) VALUES (?)'
  ).run(event.eventId);

  // Fetch updated stats for webhook
  const user = db.prepare('SELECT * FROM users WHERE studentId = ?').get(STUDENT_ID) as {
    coins: number;
    streak: number;
    focusMinutes: number;
  };

  console.log(`[Rewards] Awarded 50 coins for session ${payload.sessionId}. Total: ${user.coins} coins, streak: ${user.streak}`);

  // Trigger n8n webhook asynchronously (non-blocking)
  triggerFocusSuccessWebhook({
    eventId: event.eventId,
    sessionId: payload.sessionId,
    streak: user.streak,
    coins: user.coins,
  }).catch((err) => {
    console.error('[Webhook] Failed to trigger focus-success webhook:', err.message);
  });
}

function handleSessionFailed(
  db: Database.Database,
  event: StudyEvent,
  payload: SessionFailedPayload
): void {
  db.prepare(`
    UPDATE focus_sessions
    SET status = 'FAILED', failureReason = ?, completedAt = ?
    WHERE sessionId = ?
  `).run(payload.failureReason, event.createdAt, payload.sessionId);
}

function handleTaskStatusChanged(
  db: Database.Database,
  event: StudyEvent,
  payload: TaskStatusChangedPayload
): void {
  const existing = db.prepare(
    'SELECT status, deleted, vectorClock FROM tasks WHERE taskId = ?'
  ).get(payload.taskId) as { status: TaskStatus; deleted: number; vectorClock: string } | undefined;

  if (!existing) {
    console.warn(`[EventProcessor] Task ${payload.taskId} not found for status change`);
    return;
  }

  // Deleted tasks cannot be edited — deletion wins
  if (existing.deleted) {
    console.log(`[Conflict] Task ${payload.taskId} is deleted — ignoring status change`);
    return;
  }

  const existingClock: VectorClock = JSON.parse(existing.vectorClock || '{}');
  const incomingClock: VectorClock = event.vectorClock;
  const relation = compare(incomingClock, existingClock);

  if (relation === 'BEFORE') {
    // Incoming event is older than what we have — ignore
    console.log(`[Conflict] Incoming status change for task ${payload.taskId} is stale — ignoring`);
    return;
  }

  if (relation === 'CONCURRENT') {
    // ---- Conflict resolution: DONE > IN_PROGRESS > NOT_STARTED ----
    // Completed work should never disappear.
    const incomingPriority = STATUS_PRIORITY[payload.newStatus];
    const existingPriority = STATUS_PRIORITY[existing.status];

    if (incomingPriority <= existingPriority) {
      console.log(
        `[Conflict] Concurrent edit for task ${payload.taskId}: ` +
        `keeping ${existing.status} over ${payload.newStatus}`
      );
      // Still merge the vector clock
      const mergedClock = merge(existingClock, incomingClock);
      db.prepare('UPDATE tasks SET vectorClock = ? WHERE taskId = ?')
        .run(JSON.stringify(mergedClock), payload.taskId);
      return;
    }

    console.log(
      `[Conflict] Concurrent edit for task ${payload.taskId}: ` +
      `${payload.newStatus} wins over ${existing.status}`
    );
  }

  // Apply the update (AFTER or winning CONCURRENT case)
  const mergedClock = merge(existingClock, incomingClock);
  db.prepare(`
    UPDATE tasks
    SET status = ?, vectorClock = ?
    WHERE taskId = ?
  `).run(payload.newStatus, JSON.stringify(mergedClock), payload.taskId);
}

function handleTaskDeleted(
  db: Database.Database,
  event: StudyEvent,
  payload: TaskDeletedPayload
): void {
  // Soft delete — deletion always wins regardless of concurrent edits
  db.prepare(`
    UPDATE tasks
    SET deleted = 1, vectorClock = ?
    WHERE taskId = ?
  `).run(JSON.stringify(event.vectorClock), payload.taskId);

  console.log(`[EventProcessor] Task ${payload.taskId} soft-deleted`);
}

function handleSubjectCreated(
  db: Database.Database,
  payload: SubjectCreatedPayload,
  vectorClock: VectorClock
): void {
  db.prepare(`
    INSERT OR IGNORE INTO subjects (subjectId, studentId, name, vectorClock)
    VALUES (?, ?, ?, ?)
  `).run(payload.subjectId, STUDENT_ID, payload.name, JSON.stringify(vectorClock));
}

function handleChapterCreated(
  db: Database.Database,
  payload: ChapterCreatedPayload,
  vectorClock: VectorClock
): void {
  db.prepare(`
    INSERT OR IGNORE INTO chapters (chapterId, subjectId, name, vectorClock)
    VALUES (?, ?, ?, ?)
  `).run(payload.chapterId, payload.subjectId, payload.name, JSON.stringify(vectorClock));
}

function handleTaskCreated(
  db: Database.Database,
  payload: TaskCreatedPayload,
  vectorClock: VectorClock
): void {
  db.prepare(`
    INSERT OR IGNORE INTO tasks (taskId, chapterId, name, status, vectorClock)
    VALUES (?, ?, ?, 'NOT_STARTED', ?)
  `).run(payload.taskId, payload.chapterId, payload.name, JSON.stringify(vectorClock));
}

// ---- Webhook Trigger ----

async function triggerFocusSuccessWebhook(data: {
  eventId: string;
  sessionId: string;
  streak: number;
  coins: number;
}): Promise<void> {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/focus-success';

  console.log(`[Webhook] Triggering focus-success for event ${data.eventId}`);
  await axios.post(webhookUrl, data, { timeout: 5000 });
  console.log(`[Webhook] Successfully triggered for event ${data.eventId}`);
}
