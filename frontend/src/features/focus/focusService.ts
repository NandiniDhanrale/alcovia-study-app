// ============================================================
// Focus Session Service
//
// All focus session mutations go through createEvent().
// Sessions work fully offline — events are queued for later sync.
// ============================================================

import { createEvent } from '../events/eventStore';
import { getDb } from '../db/database';
import { generateUUID } from '../utils/idGenerator';
import { useAppStore } from '../store/appStore';
import { FocusSession } from '../events/types';

const STUDENT_ID = 'student-1';

/**
 * Start a new focus session.
 */
export function startSession(targetDurationMinutes: number): FocusSession {
  const sessionId = generateUUID();

  const event = createEvent('SESSION_STARTED', sessionId, {
    sessionId,
    targetDuration: targetDurationMinutes,
    studentId: STUDENT_ID,
  });

  // Apply locally immediately (optimistic)
  const db = getDb();
  db.runSync(
    `INSERT OR IGNORE INTO sessions (sessionId, status, targetDuration, startedAt)
     VALUES (?, 'RUNNING', ?, ?)`,
    [sessionId, targetDurationMinutes, event.createdAt]
  );

  const session: FocusSession = {
    sessionId,
    status: 'RUNNING',
    targetDuration: targetDurationMinutes,
    startedAt: event.createdAt,
  };

  useAppStore.getState().setCurrentSession(session);
  return session;
}

/**
 * Mark a session as successfully completed.
 * Awards will be applied by server on next sync (idempotently).
 */
export function completeSession(sessionId: string, actualDurationMinutes: number): void {
  const event = createEvent('SESSION_COMPLETED', sessionId, {
    sessionId,
    actualDuration: actualDurationMinutes,
    studentId: STUDENT_ID,
  });

  const db = getDb();
  db.runSync(
    `UPDATE sessions SET status = 'SUCCESS', actualDuration = ?, completedAt = ?
     WHERE sessionId = ? AND status = 'RUNNING'`,
    [actualDurationMinutes, event.createdAt, sessionId]
  );

  // Optimistic local reward (shown until server confirms)
  const store = useAppStore.getState();
  const currentStats = store.userStats;
  store.setUserStats({
    coins: currentStats.coins + 50,
    streak: currentStats.streak + 1,
    focusMinutes: currentStats.focusMinutes + actualDurationMinutes,
  });

  store.setCurrentSession(null);
  store.addSyncLog(`Session ${sessionId.slice(0, 8)} completed — reward pending sync`, 'success');
}

/**
 * Mark a session as failed (user gave up).
 */
export function giveUpSession(sessionId: string): void {
  failSession(sessionId, 'give_up');
}

/**
 * Mark a session as failed (app went to background).
 */
export function appSwitchFail(sessionId: string): void {
  failSession(sessionId, 'app_switch');
}

function failSession(sessionId: string, reason: 'give_up' | 'app_switch'): void {
  const event = createEvent('SESSION_FAILED', sessionId, {
    sessionId,
    failureReason: reason,
    studentId: STUDENT_ID,
  });

  const db = getDb();
  db.runSync(
    `UPDATE sessions SET status = 'FAILED', failureReason = ?, completedAt = ?
     WHERE sessionId = ?`,
    [reason, event.createdAt, sessionId]
  );

  useAppStore.getState().setCurrentSession(null);
}

/**
 * Get local session stats.
 */
export function getLocalStats(): { completedToday: number; totalFocusMinutes: number } {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const completedToday = db.getFirstSync<{ count: number }>(
    `SELECT COUNT(*) as count FROM sessions WHERE status = 'SUCCESS' AND startedAt LIKE ?`,
    [`${today}%`]
  );

  const totalMinutes = db.getFirstSync<{ total: number }>(
    `SELECT COALESCE(SUM(actualDuration), 0) as total FROM sessions WHERE status = 'SUCCESS'`
  );

  return {
    completedToday: completedToday?.count ?? 0,
    totalFocusMinutes: totalMinutes?.total ?? 0,
  };
}
