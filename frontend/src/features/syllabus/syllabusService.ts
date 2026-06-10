// ============================================================
// Syllabus Service
// ============================================================

import { createEvent } from '../../events/eventStore';
import { getDb } from '../../db/database';
import { TaskStatus } from '../../events/types';
import { useAppStore } from '../../store/appStore';

const STUDENT_ID = 'student-1';

const STATUS_CYCLE: Record<TaskStatus, TaskStatus> = {
  NOT_STARTED: 'IN_PROGRESS',
  IN_PROGRESS: 'DONE',
  DONE: 'NOT_STARTED',
};

/**
 * Cycle task status: NOT_STARTED → IN_PROGRESS → DONE → NOT_STARTED
 */
export function cycleTaskStatus(taskId: string): void {
  const db = getDb();
  const task = db.getFirstSync<{ status: string; deleted: number }>(
    'SELECT status, deleted FROM tasks WHERE taskId = ?',
    [taskId]
  );

  if (!task || task.deleted) return;

  const currentStatus = task.status as TaskStatus;
  const newStatus = STATUS_CYCLE[currentStatus];

  // Create the event (vector clock incremented inside createEvent)
  createEvent('TASK_STATUS_CHANGED', taskId, {
    taskId,
    newStatus,
    previousStatus: currentStatus,
    studentId: STUDENT_ID,
  });

  // Optimistic local update
  db.runSync('UPDATE tasks SET status = ? WHERE taskId = ?', [newStatus, taskId]);

  // Refresh store
  refreshSyllabusState();
}

/**
 * Soft-delete a task.
 */
export function deleteTask(taskId: string): void {
  createEvent('TASK_DELETED', taskId, {
    taskId,
    studentId: STUDENT_ID,
  });

  const db = getDb();
  db.runSync('UPDATE tasks SET deleted = 1 WHERE taskId = ?', [taskId]);

  refreshSyllabusState();
}

/**
 * Compute chapter progress (0-100).
 */
export function getChapterProgress(chapterId: string): number {
  const db = getDb();

  const total = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM tasks WHERE chapterId = ? AND deleted = 0',
    [chapterId]
  );

  const done = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM tasks WHERE chapterId = ? AND status = 'DONE' AND deleted = 0`,
    [chapterId]
  );

  if (!total?.count) return 0;
  return Math.round(((done?.count ?? 0) / total.count) * 100);
}

/**
 * Compute subject progress (average of chapter progress).
 */
export function getSubjectProgress(subjectId: string): number {
  const db = getDb();
  const chapters = db.getAllSync<{ chapterId: string }>(
    'SELECT chapterId FROM chapters WHERE subjectId = ? AND deleted = 0',
    [subjectId]
  );

  if (!chapters.length) return 0;

  const total = chapters.reduce((sum: number, ch: { chapterId: string }) => sum + getChapterProgress(ch.chapterId), 0);
  return Math.round(total / chapters.length);
}

/**
 * Reload syllabus state into Zustand from SQLite.
 */
export function refreshSyllabusState(): void {
  const db = getDb();
  const store = useAppStore.getState();

  const subjects = db.getAllSync<{
    subjectId: string; name: string; deleted: number; vectorClock: string;
  }>('SELECT * FROM subjects WHERE deleted = 0');

  const chapters = db.getAllSync<{
    chapterId: string; subjectId: string; name: string; deleted: number; vectorClock: string;
  }>('SELECT * FROM chapters WHERE deleted = 0');

  const tasks = db.getAllSync<{
    taskId: string; chapterId: string; name: string; status: string; deleted: number; vectorClock: string;
  }>('SELECT * FROM tasks WHERE deleted = 0');

  store.setSubjects(subjects.map((s) => ({
    subjectId: s.subjectId, name: s.name,
    deleted: false, vectorClock: JSON.parse(s.vectorClock || '{}'),
  })));

  store.setChapters(chapters.map((c) => ({
    chapterId: c.chapterId, subjectId: c.subjectId, name: c.name,
    deleted: false, vectorClock: JSON.parse(c.vectorClock || '{}'),
  })));

  store.setTasks(tasks.map((t) => ({
    taskId: t.taskId, chapterId: t.chapterId, name: t.name,
    status: t.status as TaskStatus, deleted: false,
    vectorClock: JSON.parse(t.vectorClock || '{}'),
  })));
}
