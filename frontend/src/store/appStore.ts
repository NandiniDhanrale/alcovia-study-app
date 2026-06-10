// ============================================================
// Global App State (Zustand)
//
// Holds in-memory derived state so UI can be reactive.
// SQLite is the source of truth; this is a fast in-memory cache.
// ============================================================

import { create } from 'zustand';
import { Subject, Chapter, Task, FocusSession, UserStats, Notification } from '../events/types';
import { VectorClock } from '../utils/vectorClock';

interface SyncLog {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'error';
}

interface AppState {
  // ---- Identity ----
  deviceId: string;
  isInitialized: boolean;

  // ---- Network ----
  isOnline: boolean;
  isSyncing: boolean;

  // ---- User Stats (optimistic, from local DB) ----
  userStats: UserStats;

  // ---- Syllabus ----
  subjects: Subject[];
  chapters: Chapter[];
  tasks: Task[];

  // ---- Sessions ----
  activeSessions: FocusSession[];
  currentSession: FocusSession | null;

  // ---- Notifications ----
  notifications: Notification[];

  // ---- Vector Clocks (per entity) ----
  vectorClocks: Record<string, VectorClock>;

  // ---- Sync Logs ----
  syncLogs: SyncLog[];
  pendingEventCount: number;
  syncedEventCount: number;

  // ---- Actions ----
  setDeviceId: (id: string) => void;
  setIsInitialized: (v: boolean) => void;
  setIsOnline: (v: boolean) => void;
  setIsSyncing: (v: boolean) => void;
  setUserStats: (stats: UserStats) => void;
  setSubjects: (subjects: Subject[]) => void;
  setChapters: (chapters: Chapter[]) => void;
  setTasks: (tasks: Task[]) => void;
  setActiveSessions: (sessions: FocusSession[]) => void;
  setCurrentSession: (session: FocusSession | null) => void;
  setNotifications: (notifications: Notification[]) => void;
  updateVectorClock: (entityId: string, clock: VectorClock) => void;
  addSyncLog: (message: string, type?: 'info' | 'success' | 'error') => void;
  clearSyncLogs: () => void;
  setPendingEventCount: (count: number) => void;
  setSyncedEventCount: (count: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  deviceId: '',
  isInitialized: false,
  isOnline: true,
  isSyncing: false,

  userStats: { coins: 0, streak: 0, focusMinutes: 0 },

  subjects: [],
  chapters: [],
  tasks: [],
  activeSessions: [],
  currentSession: null,
  notifications: [],

  vectorClocks: {},
  syncLogs: [],
  pendingEventCount: 0,
  syncedEventCount: 0,

  setDeviceId: (id) => set({ deviceId: id }),
  setIsInitialized: (v) => set({ isInitialized: v }),
  setIsOnline: (v) => set({ isOnline: v }),
  setIsSyncing: (v) => set({ isSyncing: v }),
  setUserStats: (stats) => set({ userStats: stats }),
  setSubjects: (subjects) => set({ subjects }),
  setChapters: (chapters) => set({ chapters }),
  setTasks: (tasks) => set({ tasks }),
  setActiveSessions: (activeSessions) => set({ activeSessions }),
  setCurrentSession: (currentSession) => set({ currentSession }),
  setNotifications: (notifications) => set({ notifications }),
  updateVectorClock: (entityId, clock) =>
    set((state) => ({
      vectorClocks: { ...state.vectorClocks, [entityId]: clock },
    })),
  addSyncLog: (message, type = 'info') =>
    set((state) => ({
      syncLogs: [
        { timestamp: new Date().toISOString(), message, type },
        ...state.syncLogs.slice(0, 99), // Keep last 100
      ],
    })),
  clearSyncLogs: () => set({ syncLogs: [] }),
  setPendingEventCount: (count) => set({ pendingEventCount: count }),
  setSyncedEventCount: (count) => set({ syncedEventCount: count }),
}));
