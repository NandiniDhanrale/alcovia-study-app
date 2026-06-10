// ============================================================
// Conflict Resolution Tests
// Tests vector clock comparison, DONE > IN_PROGRESS > NOT_STARTED,
// and soft-delete wins over concurrent edits
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../src/db/database';
import { processEvent } from '../src/events/eventProcessor';
import { StudyEvent } from '../src/events/types';
import { compare, merge } from '../src/utils/vectorClock';
import Database from 'better-sqlite3';

function makeEvent(overrides: Partial<StudyEvent> = {}): StudyEvent {
  return {
    eventId: `evt-${Math.random().toString(36).slice(2)}`,
    deviceId: 'client-a',
    counter: 1,
    type: 'TASK_CREATED',
    entityId: 'task-1',
    payload: {},
    vectorClock: { 'client-a': 1 },
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function seedTask(db: Database.Database, taskId: string, status: string, vectorClock: object = {}) {
  // Seed chapter and subject first
  db.prepare('INSERT OR IGNORE INTO subjects (subjectId, studentId, name) VALUES (?,?,?)').run('sub-1', 'student-1', 'Math');
  db.prepare('INSERT OR IGNORE INTO chapters (chapterId, subjectId, name) VALUES (?,?,?)').run('ch-1', 'sub-1', 'Algebra');
  db.prepare('INSERT OR IGNORE INTO tasks (taskId, chapterId, name, status, vectorClock) VALUES (?,?,?,?,?)').run(
    taskId, 'ch-1', 'Test Task', status, JSON.stringify(vectorClock)
  );
}

describe('Vector Clock Operations', () => {
  it('correctly identifies BEFORE relationship', () => {
    const a = { 'client-a': 1 };
    const b = { 'client-a': 2 };
    expect(compare(a, b)).toBe('BEFORE');
  });

  it('correctly identifies AFTER relationship', () => {
    const a = { 'client-a': 3, 'client-b': 1 };
    const b = { 'client-a': 2, 'client-b': 1 };
    expect(compare(a, b)).toBe('AFTER');
  });

  it('correctly identifies CONCURRENT relationship', () => {
    const a = { 'client-a': 2, 'client-b': 1 };
    const b = { 'client-a': 1, 'client-b': 2 };
    expect(compare(a, b)).toBe('CONCURRENT');
  });

  it('correctly identifies EQUAL clocks', () => {
    const clock = { 'client-a': 3, 'client-b': 2 };
    expect(compare(clock, clock)).toBe('EQUAL');
  });

  it('merges clocks by taking max of each component', () => {
    const a = { 'client-a': 5, 'client-b': 2 };
    const b = { 'client-a': 3, 'client-b': 7 };
    const merged = merge(a, b);
    expect(merged['client-a']).toBe(5);
    expect(merged['client-b']).toBe(7);
  });

  it('handles merging with missing keys', () => {
    const a = { 'client-a': 3 };
    const b = { 'client-b': 5 };
    const merged = merge(a, b);
    expect(merged['client-a']).toBe(3);
    expect(merged['client-b']).toBe(5);
  });
});

describe('Task Status Conflict Resolution', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  it('DONE wins over IN_PROGRESS in concurrent edit', () => {
    seedTask(db, 'task-1', 'IN_PROGRESS', { 'client-b': 2, 'client-a': 1 });

    // Client A concurrently marks it DONE
    const doneEvent = makeEvent({
      type: 'TASK_STATUS_CHANGED',
      entityId: 'task-1',
      payload: {
        taskId: 'task-1',
        newStatus: 'DONE',
        previousStatus: 'NOT_STARTED',
        studentId: 'student-1',
      },
      vectorClock: { 'client-a': 2, 'client-b': 1 }, // concurrent with stored clock
      deviceId: 'client-a',
    });

    processEvent(db, doneEvent);

    const task = db.prepare('SELECT status FROM tasks WHERE taskId = ?').get('task-1') as { status: string };
    expect(task.status).toBe('DONE');
  });

  it('IN_PROGRESS does not override DONE in concurrent edit', () => {
    seedTask(db, 'task-1', 'DONE', { 'client-a': 2, 'client-b': 1 });

    // Client B concurrently tries to set IN_PROGRESS
    const inProgressEvent = makeEvent({
      type: 'TASK_STATUS_CHANGED',
      entityId: 'task-1',
      payload: {
        taskId: 'task-1',
        newStatus: 'IN_PROGRESS',
        previousStatus: 'NOT_STARTED',
        studentId: 'student-1',
      },
      vectorClock: { 'client-a': 1, 'client-b': 2 }, // concurrent
      deviceId: 'client-b',
    });

    processEvent(db, inProgressEvent);

    const task = db.prepare('SELECT status FROM tasks WHERE taskId = ?').get('task-1') as { status: string };
    expect(task.status).toBe('DONE'); // DONE must survive
  });

  it('NOT_STARTED does not override IN_PROGRESS concurrently', () => {
    seedTask(db, 'task-1', 'IN_PROGRESS', { 'client-a': 2, 'client-b': 1 });

    const resetEvent = makeEvent({
      type: 'TASK_STATUS_CHANGED',
      entityId: 'task-1',
      payload: {
        taskId: 'task-1',
        newStatus: 'NOT_STARTED',
        previousStatus: 'NOT_STARTED',
        studentId: 'student-1',
      },
      vectorClock: { 'client-a': 1, 'client-b': 2 }, // concurrent
      deviceId: 'client-b',
    });

    processEvent(db, resetEvent);

    const task = db.prepare('SELECT status FROM tasks WHERE taskId = ?').get('task-1') as { status: string };
    expect(task.status).toBe('IN_PROGRESS');
  });

  it('later sequential update is always applied', () => {
    seedTask(db, 'task-1', 'NOT_STARTED', { 'client-a': 1 });

    // Sequential update (AFTER)
    const event = makeEvent({
      type: 'TASK_STATUS_CHANGED',
      entityId: 'task-1',
      payload: {
        taskId: 'task-1',
        newStatus: 'DONE',
        previousStatus: 'NOT_STARTED',
        studentId: 'student-1',
      },
      vectorClock: { 'client-a': 2 }, // strictly after stored { 'client-a': 1 }
      deviceId: 'client-a',
    });

    processEvent(db, event);

    const task = db.prepare('SELECT status FROM tasks WHERE taskId = ?').get('task-1') as { status: string };
    expect(task.status).toBe('DONE');
  });

  it('soft delete wins over concurrent edit', () => {
    seedTask(db, 'task-1', 'IN_PROGRESS', { 'client-a': 2, 'client-b': 1 });

    // First: delete from client A
    processEvent(db, makeEvent({
      type: 'TASK_DELETED',
      entityId: 'task-1',
      payload: { taskId: 'task-1', studentId: 'student-1' },
      vectorClock: { 'client-a': 3 },
      deviceId: 'client-a',
    }));

    // Then: concurrent edit from client B (should be ignored)
    processEvent(db, makeEvent({
      type: 'TASK_STATUS_CHANGED',
      entityId: 'task-1',
      payload: { taskId: 'task-1', newStatus: 'DONE', previousStatus: 'IN_PROGRESS', studentId: 'student-1' },
      vectorClock: { 'client-a': 2, 'client-b': 2 },
      deviceId: 'client-b',
    }));

    const task = db.prepare('SELECT status, deleted FROM tasks WHERE taskId = ?').get('task-1') as { status: string; deleted: number };
    expect(task.deleted).toBe(1); // still deleted
    expect(task.status).toBe('IN_PROGRESS'); // status unchanged
  });
});
