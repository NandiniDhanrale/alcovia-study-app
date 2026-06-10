// ============================================================
// Sync Engine — Frontend
//
// Handles bidirectional sync with the server:
//   1. Push unsynced local events to server
//   2. Receive missing events from server
//   3. Apply received events to local state
//   4. Update watermark (lastSyncedSequence)
//
// Designed to be called:
//   - When app comes online
//   - Periodically (every 30s) when online
//   - Manually from Dev Panel
// ============================================================

import { getDb, getSyncMetadata, setSyncMetadata } from '../db/database';
import { getUnsyncedEvents, markEventsSynced, applyIncomingEvents } from '../events/eventStore';
import { applyEventsToLocalState } from '../events/eventProcessor';
import { useAppStore } from '../store/appStore';
import { StudyEvent } from '../events/types';
import { getDeviceId } from '../utils/deviceId';

// Backend URL — change this if running backend on a different port
export const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001';

/**
 * Perform a full sync cycle.
 * Returns true if sync was successful.
 */
export async function sync(): Promise<boolean> {
  const store = useAppStore.getState();

  if (!store.isOnline) {
    store.addSyncLog('Offline — skipping sync', 'info');
    return false;
  }

  if (store.isSyncing) {
    store.addSyncLog('Sync already in progress — skipping', 'info');
    return false;
  }

  store.setIsSyncing(true);
  store.addSyncLog('Starting sync...', 'info');

  try {
    const db = getDb();
    const deviceId = getDeviceId();

    // ---- Step 1: Get unsynced local events ----
    const unsyncedEvents = getUnsyncedEvents();
    store.addSyncLog(`Pushing ${unsyncedEvents.length} unsynced events`, 'info');

    // ---- Step 2: Get our watermark ----
    const lastSyncedSeq = parseInt(
      getSyncMetadata(db, 'lastSyncedSequence') ?? '0',
      10
    );

    // ---- Step 3: Push to server & receive missing events ----
    const response = await fetch(`${BACKEND_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        lastSyncedSequence: lastSyncedSeq,
        events: unsyncedEvents,
      }),
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const { missingEvents, serverSequence } = await response.json() as {
      missingEvents: StudyEvent[];
      serverSequence: number;
    };

    // ---- Step 4: Mark our events as synced ----
    if (unsyncedEvents.length > 0) {
      markEventsSynced(unsyncedEvents.map(e => e.eventId));
    }

    // ---- Step 5: Apply incoming events from other devices ----
    if (missingEvents.length > 0) {
      store.addSyncLog(`Received ${missingEvents.length} events from server`, 'info');
      applyIncomingEvents(missingEvents);
      applyEventsToLocalState(missingEvents);
    }

    // ---- Step 6: Update watermark ----
    if (serverSequence > lastSyncedSeq) {
      setSyncMetadata(db, 'lastSyncedSequence', String(serverSequence));
    }

    // ---- Step 7: Refresh in-memory state from DB ----
    await refreshStateFromDb();

    // ---- Step 8: Fetch notifications ----
    await fetchNotifications();

    const logMsg = `Sync complete. Pushed ${unsyncedEvents.length}, received ${missingEvents.length}`;
    store.addSyncLog(logMsg, 'success');

    updateEventCounts();
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    store.addSyncLog(`Sync failed: ${msg}`, 'error');
    console.error('[Sync] Error:', err);
    return false;
  } finally {
    store.setIsSyncing(false);
  }
}

/**
 * Refresh in-memory state from SQLite after sync.
 */
export async function refreshStateFromDb(): Promise<void> {
  const db = getDb();
  const store = useAppStore.getState();

  // Load syllabus
  const subjects = db.getAllSync<{
    subjectId: string; name: string; deleted: number; vectorClock: string;
  }>('SELECT * FROM subjects WHERE deleted = 0');

  const chapters = db.getAllSync<{
    chapterId: string; subjectId: string; name: string; deleted: number; vectorClock: string;
  }>('SELECT * FROM chapters WHERE deleted = 0');

  const tasks = db.getAllSync<{
    taskId: string; chapterId: string; name: string; status: string; deleted: number; vectorClock: string;
  }>('SELECT * FROM tasks WHERE deleted = 0');

  store.setSubjects(subjects.map(s => ({
    subjectId: s.subjectId,
    name: s.name,
    deleted: s.deleted === 1,
    vectorClock: JSON.parse(s.vectorClock || '{}'),
  })));

  store.setChapters(chapters.map(c => ({
    chapterId: c.chapterId,
    subjectId: c.subjectId,
    name: c.name,
    deleted: c.deleted === 1,
    vectorClock: JSON.parse(c.vectorClock || '{}'),
  })));

  store.setTasks(tasks.map(t => ({
    taskId: t.taskId,
    chapterId: t.chapterId,
    name: t.name,
    status: t.status as import('../events/types').TaskStatus,
    deleted: t.deleted === 1,
    vectorClock: JSON.parse(t.vectorClock || '{}'),
  })));

  // Load local sessions
  const sessions = db.getAllSync<{
    sessionId: string; status: string; targetDuration: number;
    actualDuration?: number; failureReason?: string; startedAt: string; completedAt?: string;
  }>('SELECT * FROM sessions ORDER BY startedAt DESC LIMIT 20');

  store.setActiveSessions(sessions.map(s => ({
    sessionId: s.sessionId,
    status: s.status as import('../events/types').SessionStatus,
    targetDuration: s.targetDuration,
    actualDuration: s.actualDuration,
    failureReason: s.failureReason as import('../events/types').FailureReason | undefined,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
  })));

  // Compute local user stats (optimistic)
  const completedSessions = sessions.filter(s => s.status === 'SUCCESS');
  const focusMinutes = completedSessions.reduce((sum, s) => sum + (s.actualDuration ?? 0), 0);

  // Fetch authoritative stats from server
  try {
    const res = await fetch(`${BACKEND_URL}/state/user`);
    if (res.ok) {
      const { user } = await res.json();
      if (user) {
        store.setUserStats({
          coins: user.coins,
          streak: user.streak,
          focusMinutes: user.focusMinutes,
        });
        return;
      }
    }
  } catch {
    // Offline — use local estimate
  }

  // Offline fallback: estimate from local sessions
  store.setUserStats({
    coins: completedSessions.length * 50,
    streak: completedSessions.length,
    focusMinutes,
  });
}

async function fetchNotifications(): Promise<void> {
  try {
    const res = await fetch(`${BACKEND_URL}/notifications`);
    if (res.ok) {
      const { notifications } = await res.json();
      useAppStore.getState().setNotifications(notifications);
    }
  } catch {
    // Offline — skip
  }
}

function updateEventCounts(): void {
  const db = getDb();
  const store = useAppStore.getState();

  const pending = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM events WHERE synced = 0'
  );
  const synced = db.getFirstSync<{ count: number }>(
    'SELECT COUNT(*) as count FROM events WHERE synced = 1'
  );

  store.setPendingEventCount(pending?.count ?? 0);
  store.setSyncedEventCount(synced?.count ?? 0);
}
