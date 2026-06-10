// ============================================================
// Home Screen
// ============================================================

import React, { useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Animated, Platform
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { refreshStateFromDb, sync } from '../../src/sync/syncEngine';

export default function HomeScreen() {
  const router = useRouter();
  const { userStats, deviceId, isOnline, activeSessions, subjects, tasks } = useAppStore();

  const completedSessions = activeSessions.filter(s => s.status === 'SUCCESS').length;
  const doneTasks = tasks.filter(t => t.status === 'DONE').length;
  const totalTasks = tasks.length;

  useEffect(() => {
    refreshStateFromDb();
  }, []);

  const formatTime = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Welcome back! 👋</Text>
          <Text style={styles.deviceLabel}>Device: {deviceId || 'Loading...'}</Text>
        </View>
        <View style={[styles.onlineBadge, { backgroundColor: isOnline ? '#065f46' : '#7f1d1d' }]}>
          <View style={[styles.onlineDot, { backgroundColor: isOnline ? '#34d399' : '#ef4444' }]} />
          <Text style={[styles.onlineText, { color: isOnline ? '#34d399' : '#ef4444' }]}>
            {isOnline ? 'Online' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="monetization-on"
          value={userStats.coins.toString()}
          label="Coins"
          color="#f59e0b"
          gradient="#78350f"
        />
        <StatCard
          icon="local-fire-department"
          value={userStats.streak.toString()}
          label="Streak"
          color="#ef4444"
          gradient="#7f1d1d"
        />
        <StatCard
          icon="access-time"
          value={formatTime(userStats.focusMinutes)}
          label="Focus Time"
          color="#7c3aed"
          gradient="#3b0764"
        />
        <StatCard
          icon="check-circle"
          value={`${doneTasks}/${totalTasks}`}
          label="Tasks Done"
          color="#10b981"
          gradient="#064e3b"
        />
      </View>

      {/* Quick Actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsGrid}>
        <ActionCard
          icon="timer"
          title="Start Focus"
          subtitle="25-120 min sessions"
          color="#7c3aed"
          onPress={() => router.push('/focus')}
        />
        <ActionCard
          icon="menu-book"
          title="Syllabus"
          subtitle={`${subjects.length} subjects`}
          color="#0891b2"
          onPress={() => router.push('/syllabus')}
        />
        <ActionCard
          icon="sync"
          title="Sync Now"
          subtitle={isOnline ? 'Push & pull changes' : 'Offline'}
          color="#059669"
          onPress={() => sync()}
        />
        <ActionCard
          icon="developer-mode"
          title="Dev Panel"
          subtitle="Debug & simulate"
          color="#d97706"
          onPress={() => router.push('/dev')}
        />
      </View>

      {/* Recent Sessions */}
      {activeSessions.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          {activeSessions.slice(0, 3).map((session) => (
            <View key={session.sessionId} style={styles.sessionCard}>
              <View style={[
                styles.sessionStatus,
                { backgroundColor: session.status === 'SUCCESS' ? '#065f46' : session.status === 'FAILED' ? '#7f1d1d' : '#1e3a5f' }
              ]}>
                <MaterialIcons
                  name={session.status === 'SUCCESS' ? 'check-circle' : session.status === 'FAILED' ? 'cancel' : 'timer'}
                  size={20}
                  color={session.status === 'SUCCESS' ? '#34d399' : session.status === 'FAILED' ? '#ef4444' : '#60a5fa'}
                />
              </View>
              <View style={styles.sessionInfo}>
                <Text style={styles.sessionDuration}>{session.targetDuration} min session</Text>
                <Text style={styles.sessionDate}>
                  {session.status} · {new Date(session.startedAt).toLocaleDateString()}
                </Text>
              </View>
              {session.status === 'SUCCESS' && (
                <Text style={styles.sessionCoins}>+50 🪙</Text>
              )}
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

function StatCard({ icon, value, label, color, gradient }: {
  icon: string; value: string; label: string; color: string; gradient: string;
}) {
  return (
    <View style={[styles.statCard, { backgroundColor: gradient + '44' }]}>
      <MaterialIcons name={icon as any} size={24} color={color} />
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function ActionCard({ icon, title, subtitle, color, onPress }: {
  icon: string; title: string; subtitle: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.actionIcon, { backgroundColor: color + '22' }]}>
        <MaterialIcons name={icon as any} size={28} color={color} />
      </View>
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionSubtitle}>{subtitle}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  greeting: { fontSize: 24, fontWeight: '700', color: '#f1f5f9', marginBottom: 4 },
  deviceLabel: { fontSize: 12, color: '#6b7280', fontFamily: 'monospace' },
  onlineBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4 },
  onlineText: { fontSize: 12, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  statCard: { flex: 1, minWidth: '45%', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e2e', gap: 8 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#e2e8f0', marginBottom: 14 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 },
  actionCard: { flex: 1, minWidth: '45%', backgroundColor: '#13131f', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e1e2e', gap: 8 },
  actionIcon: { width: 52, height: 52, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  actionTitle: { fontSize: 14, fontWeight: '700', color: '#f1f5f9' },
  actionSubtitle: { fontSize: 12, color: '#6b7280' },
  sessionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#13131f', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#1e1e2e', gap: 12 },
  sessionStatus: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sessionInfo: { flex: 1 },
  sessionDuration: { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },
  sessionDate: { fontSize: 12, color: '#6b7280', marginTop: 2, textTransform: 'capitalize' },
  sessionCoins: { fontSize: 14, fontWeight: '700', color: '#f59e0b' },
});
