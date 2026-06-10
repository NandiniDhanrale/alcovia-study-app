// ============================================================
// Shared Event Types — used by both server-side logic and tests
// ============================================================

export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'DONE';

export type SessionStatus = 'RUNNING' | 'SUCCESS' | 'FAILED';

export type FailureReason = 'give_up' | 'app_switch';

export type EventType =
  | 'SESSION_STARTED'
  | 'SESSION_COMPLETED'
  | 'SESSION_FAILED'
  | 'TASK_STATUS_CHANGED'
  | 'TASK_DELETED'
  | 'SUBJECT_CREATED'
  | 'CHAPTER_CREATED'
  | 'TASK_CREATED';

/**
 * Core event interface — the fundamental unit of state change.
 * Events are immutable once created. State is derived by replaying events.
 */
export interface StudyEvent {
  eventId: string;           // UUIDv4 — globally unique, used for idempotency
  deviceId: string;          // Which device created this event
  counter: number;           // Lamport-style local counter for ordering
  type: EventType;           // What happened
  entityId: string;          // ID of the affected entity (sessionId, taskId, etc.)
  payload: Record<string, unknown>; // Event-specific data
  vectorClock: Record<string, number>; // Causal ordering per device
  createdAt: string;         // ISO 8601 timestamp (informational only — never used for ordering)
}

// ---- Payload shapes per event type ----

export interface SessionStartedPayload {
  sessionId: string;
  targetDuration: number; // minutes
  studentId: string;
}

export interface SessionCompletedPayload {
  sessionId: string;
  actualDuration: number; // minutes
  studentId: string;
}

export interface SessionFailedPayload {
  sessionId: string;
  failureReason: FailureReason;
  studentId: string;
}

export interface TaskStatusChangedPayload {
  taskId: string;
  newStatus: TaskStatus;
  previousStatus: TaskStatus;
  studentId: string;
}

export interface TaskDeletedPayload {
  taskId: string;
  studentId: string;
}

export interface SubjectCreatedPayload {
  subjectId: string;
  name: string;
  studentId: string;
}

export interface ChapterCreatedPayload {
  chapterId: string;
  subjectId: string;
  name: string;
  studentId: string;
}

export interface TaskCreatedPayload {
  taskId: string;
  chapterId: string;
  name: string;
  studentId: string;
}
