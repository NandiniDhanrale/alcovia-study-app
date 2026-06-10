// ============================================================
// Focus Session Screen
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Platform, ScrollView, Alert
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useFocusSession, SessionPhase } from '../../src/features/focus/useFocusSession';
import { useAppStore } from '../../src/store/appStore';

const DURATION_OPTIONS = [25, 45, 60, 90, 120];

export default function FocusScreen() {
  const [selectedDuration, setSelectedDuration] = useState(25);
  const { phase, remainingSeconds, failureReason, startFocusSession, handleGiveUp, reset } = useFocusSession();
  const { userStats, isOnline } = useAppStore();

  const formatTime = (totalSeconds: number) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = phase === 'running'
    ? 1 - remainingSeconds / (selectedDuration * 60)
    : phase === 'success' ? 1 : 0;

  const confirmGiveUp = () => {
    Alert.alert(
      'Give Up?',
      'Are you sure you want to end this session? No coins will be awarded.',
      [
        { text: 'Keep Going', style: 'cancel' },
        { text: 'Give Up', style: 'destructive', onPress: handleGiveUp },
      ]
    );
  };

  if (phase === 'idle') {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={styles.title}>Focus Session</Text>
        <Text style={styles.subtitle}>Complete a session to earn 50 coins 🪙</Text>

        {!isOnline && (
          <View style={styles.offlineBanner}>
            <MaterialIcons name="wifi-off" size={16} color="#f59e0b" />
            <Text style={styles.offlineText}>Offline — session will sync when reconnected</Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>Choose Duration</Text>
        <View style={styles.durationGrid}>
          {DURATION_OPTIONS.map((d) => (
            <TouchableOpacity
              key={d}
              style={[styles.durationOption, selectedDuration === d && styles.durationSelected]}
              onPress={() => setSelectedDuration(d)}
            >
              <Text style={[styles.durationText, selectedDuration === d && styles.durationTextSelected]}>
                {d}m
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.rewardInfo}>
          <MaterialIcons name="info" size={16} color="#7c3aed" />
          <Text style={styles.rewardText}>
            Complete the full session to earn 50 coins and extend your streak.
            If you leave the app for more than 5 seconds, the session fails.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.startButton}
          onPress={() => startFocusSession(selectedDuration)}
          activeOpacity={0.85}
        >
          <MaterialIcons name="play-arrow" size={24} color="white" />
          <Text style={styles.startButtonText}>Start {selectedDuration}-Minute Session</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (phase === 'running') {
    return (
      <View style={styles.container}>
        <View style={styles.timerContainer}>
          <Text style={styles.timerTitle}>Stay Focused!</Text>
          <Text style={styles.timerSubtitle}>
            {selectedDuration} min session · {isOnline ? 'Online' : 'Offline'}
          </Text>

          {/* Circular Progress Ring */}
          <View style={styles.timerRing}>
            <View style={styles.timerInner}>
              <Text style={styles.timerText}>{formatTime(remainingSeconds)}</Text>
              <Text style={styles.timerLabel}>remaining</Text>
            </View>
          </View>

          <View style={styles.progressBarContainer}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` as any }]} />
          </View>
          <Text style={styles.progressLabel}>
            {Math.round(progress * 100)}% complete
          </Text>

          <TouchableOpacity style={styles.giveUpButton} onPress={confirmGiveUp}>
            <MaterialIcons name="close" size={20} color="#ef4444" />
            <Text style={styles.giveUpText}>Give Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.successIcon}>
            <MaterialIcons name="emoji-events" size={64} color="#f59e0b" />
          </View>
          <Text style={styles.resultTitle}>Session Complete! 🎉</Text>
          <Text style={styles.resultSubtitle}>Amazing focus! You've earned your reward.</Text>

          <View style={styles.rewardCard}>
            <View style={styles.rewardRow}>
              <MaterialIcons name="monetization-on" size={28} color="#f59e0b" />
              <Text style={styles.rewardAmount}>+50 Coins</Text>
            </View>
            <View style={styles.rewardRow}>
              <MaterialIcons name="local-fire-department" size={28} color="#ef4444" />
              <Text style={styles.rewardAmount}>Streak +1</Text>
            </View>
          </View>

          {!isOnline && (
            <Text style={styles.syncNote}>
              ⏳ Reward will be confirmed when you go online
            </Text>
          )}

          <View style={styles.statsRow}>
            <Text style={styles.statsText}>Total Coins: {userStats.coins} 🪙</Text>
            <Text style={styles.statsText}>Streak: {userStats.streak} 🔥</Text>
          </View>

          <TouchableOpacity style={styles.startButton} onPress={reset}>
            <Text style={styles.startButtonText}>Start Another Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={styles.container}>
        <View style={styles.resultContainer}>
          <View style={styles.failIcon}>
            <MaterialIcons name="cancel" size={64} color="#ef4444" />
          </View>
          <Text style={styles.resultTitle}>Session Failed 😔</Text>
          <Text style={styles.resultSubtitle}>{failureReason}</Text>
          <Text style={styles.failNote}>No coins awarded. Keep trying!</Text>

          <TouchableOpacity style={styles.startButton} onPress={reset}>
            <Text style={styles.startButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 24, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: '800', color: '#f1f5f9', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#9ca3af', marginBottom: 24 },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#78350f44', borderRadius: 12, padding: 12, marginBottom: 24, gap: 8, borderWidth: 1, borderColor: '#92400e' },
  offlineText: { flex: 1, fontSize: 13, color: '#f59e0b' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#e2e8f0', marginBottom: 14 },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  durationOption: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 14, backgroundColor: '#13131f', borderWidth: 1, borderColor: '#1e1e2e' },
  durationSelected: { backgroundColor: '#4c1d95', borderColor: '#7c3aed' },
  durationText: { fontSize: 16, fontWeight: '700', color: '#6b7280' },
  durationTextSelected: { color: '#fff' },
  rewardInfo: { flexDirection: 'row', backgroundColor: '#2e1065', borderRadius: 14, padding: 14, gap: 10, marginBottom: 28, borderWidth: 1, borderColor: '#4c1d95' },
  rewardText: { flex: 1, fontSize: 13, color: '#c4b5fd', lineHeight: 20 },
  startButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#7c3aed', borderRadius: 16, paddingVertical: 18, gap: 8 },
  startButtonText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  timerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  timerTitle: { fontSize: 28, fontWeight: '800', color: '#f1f5f9', marginBottom: 8 },
  timerSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 48 },
  timerRing: { width: 240, height: 240, borderRadius: 120, borderWidth: 8, borderColor: '#7c3aed', justifyContent: 'center', alignItems: 'center', marginBottom: 32, backgroundColor: '#13131f', shadowColor: '#7c3aed', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  timerInner: { alignItems: 'center' },
  timerText: { fontSize: 52, fontWeight: '800', color: '#f1f5f9', fontVariant: ['tabular-nums'] },
  timerLabel: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  progressBarContainer: { width: '80%', height: 6, backgroundColor: '#1e1e2e', borderRadius: 3, marginBottom: 8, overflow: 'hidden' },
  progressBar: { height: '100%', backgroundColor: '#7c3aed', borderRadius: 3 },
  progressLabel: { fontSize: 13, color: '#9ca3af', marginBottom: 48 },
  giveUpButton: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, borderWidth: 1, borderColor: '#7f1d1d', backgroundColor: '#7f1d1d33' },
  giveUpText: { fontSize: 15, fontWeight: '600', color: '#ef4444' },
  resultContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  successIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#78350f44', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  failIcon: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#7f1d1d44', justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  resultTitle: { fontSize: 28, fontWeight: '800', color: '#f1f5f9', marginBottom: 8, textAlign: 'center' },
  resultSubtitle: { fontSize: 16, color: '#9ca3af', marginBottom: 28, textAlign: 'center' },
  rewardCard: { backgroundColor: '#13131f', borderRadius: 20, padding: 24, gap: 16, borderWidth: 1, borderColor: '#1e1e2e', marginBottom: 16, width: '100%' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rewardAmount: { fontSize: 22, fontWeight: '800', color: '#f1f5f9' },
  syncNote: { fontSize: 13, color: '#f59e0b', marginBottom: 16, textAlign: 'center' },
  statsRow: { flexDirection: 'row', gap: 24, marginBottom: 32 },
  statsText: { fontSize: 15, color: '#9ca3af', fontWeight: '600' },
  failNote: { fontSize: 15, color: '#6b7280', marginBottom: 32, textAlign: 'center' },
});
