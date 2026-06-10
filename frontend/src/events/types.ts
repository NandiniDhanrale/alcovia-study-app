// ============================================================
// Event Types — Frontend (mirrors backend types)
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
 * The core event interface.
 * Every state mutation creates one of these — immutable once written.
 */
export interface StudyEvent {
  eventId: string;
  deviceId: string;
  counter: number;
  type: EventType;
  entityId: string;
  payload: Record<string, unknown>;
  vectorClock: Record<string, number>;
  createdAt: string;
}

// Derived state models (built by replaying events)
export interface FocusSession {
  sessionId: string;
  status: SessionStatus;
  targetDuration: number;
  actualDuration?: number;
  failureReason?: FailureReason;
  startedAt: string;
  completedAt?: string;
}

export interface Subject {
  subjectId: string;
  name: string;
  deleted: boolean;
  vectorClock: Record<string, number>;
}

export interface Chapter {
  chapterId: string;
  subjectId: string;
  name: string;
  deleted: boolean;
  vectorClock: Record<string, number>;
}

export interface Task {
  taskId: string;
  chapterId: string;
  name: string;
  status: TaskStatus;
  deleted: boolean;
  vectorClock: Record<string, number>;
}

export interface UserStats {
  coins: number;
  streak: number;
  focusMinutes: number;
}

export interface Notification {
  id: number;
  eventId: string;
  sessionId: string;
  streak: number;
  coins: number;
  message: string;
  createdAt: string;
}
