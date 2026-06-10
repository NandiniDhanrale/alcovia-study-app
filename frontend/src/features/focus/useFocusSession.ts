// ============================================================
// Focus Session Hook
//
// Manages the countdown timer, AppState detection (background),
// and grace period logic.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { FocusSession } from '../../events/types';
import {
  startSession,
  completeSession,
  giveUpSession,
  appSwitchFail,
} from './focusService';
import { useAppStore } from '../../store/appStore';

const GRACE_PERIOD_MS = 5000; // 5 seconds before background counts as failure

export type SessionPhase = 'idle' | 'running' | 'success' | 'failed';

interface UseFocusSessionReturn {
  phase: SessionPhase;
  session: FocusSession | null;
  remainingSeconds: number;
  failureReason: string | null;
  startFocusSession: (durationMinutes: number) => void;
  handleGiveUp: () => void;
  reset: () => void;
}

export function useFocusSession(): UseFocusSessionReturn {
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [failureReason, setFailureReason] = useState<string | null>(null);

  const sessionRef = useRef<FocusSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const backgroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const startTimeRef = useRef<number>(0);
  const durationRef = useRef<number>(0);

  const store = useAppStore();

  const clearTimers = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (backgroundTimerRef.current) clearTimeout(backgroundTimerRef.current);
    timerRef.current = null;
    backgroundTimerRef.current = null;
  }, []);

  const handleSessionComplete = useCallback(() => {
    clearTimers();
    const session = sessionRef.current;
    if (!session) return;

    const actualMinutes = Math.ceil(
      (Date.now() - startTimeRef.current) / 60000
    );

    completeSession(session.sessionId, Math.min(actualMinutes, session.targetDuration));
    setPhase('success');
  }, [clearTimers]);

  const handleSessionFail = useCallback((reason: 'give_up' | 'app_switch') => {
    clearTimers();
    const session = sessionRef.current;
    if (!session) return;

    if (reason === 'give_up') {
      giveUpSession(session.sessionId);
    } else {
      appSwitchFail(session.sessionId);
    }

    setFailureReason(reason === 'give_up' ? 'You gave up' : 'App went to background');
    setPhase('failed');
  }, [clearTimers]);

  const startFocusSession = useCallback((durationMinutes: number) => {
    const session = startSession(durationMinutes);
    sessionRef.current = session;
    startTimeRef.current = Date.now();
    durationRef.current = durationMinutes;

    const totalSeconds = durationMinutes * 60;
    setRemainingSeconds(totalSeconds);
    setPhase('running');
    setFailureReason(null);

    // Countdown timer — ticks every second
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = totalSeconds - elapsed;

      if (remaining <= 0) {
        handleSessionComplete();
      } else {
        setRemainingSeconds(remaining);
      }
    }, 1000);
  }, [handleSessionComplete]);

  // AppState monitoring for background detection
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      const prevState = appStateRef.current;
      appStateRef.current = nextState;

      if (phase !== 'running') return;

      if (
        prevState === 'active' &&
        (nextState === 'background' || nextState === 'inactive')
      ) {
        // App went to background — start grace period timer
        console.log('[Focus] App went background — starting grace period');
        backgroundTimerRef.current = setTimeout(() => {
          console.log('[Focus] Grace period expired — session failed');
          handleSessionFail('app_switch');
        }, GRACE_PERIOD_MS);
      }

      if (nextState === 'active' && prevState !== 'active') {
        // App returned to foreground within grace period — cancel failure
        if (backgroundTimerRef.current) {
          clearTimeout(backgroundTimerRef.current);
          backgroundTimerRef.current = null;
          console.log('[Focus] App returned in grace period — session continues');
        }
      }
    });

    return () => subscription.remove();
  }, [phase, handleSessionFail]);

  // Cleanup on unmount
  useEffect(() => () => clearTimers(), [clearTimers]);

  return {
    phase,
    session: sessionRef.current,
    remainingSeconds,
    failureReason,
    startFocusSession,
    handleGiveUp: () => handleSessionFail('give_up'),
    reset: () => {
      clearTimers();
      sessionRef.current = null;
      setPhase('idle');
      setRemainingSeconds(0);
      setFailureReason(null);
      store.setCurrentSession(null);
    },
  };
}
