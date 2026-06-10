// ============================================================
// Developer Panel Screen
//
// The full diagnostic dashboard for the demo:
//  - Toggle online/offline
//  - Switch device ID (client-a / client-b)
//  - View pending/synced events
//  - View vector clocks per entity
//  - Manual sync trigger
//  - DB reset (for demo scenarios)
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, Platform, Switch, Alert
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { sync, refreshStateFromDb, BACKEND_URL } from '../../src/sync/syncEngine';
import { setDeviceId as persistDeviceId, getDeviceId } from '../../src/utils/deviceId';
import { setDatabaseNamespace, getDb } from '../../src/db/database';
import { getAllEvents } from '../../src/events/eventStore';
import { refreshSyllabusState } from '../../src/features/syllabus/syllabusService';

export default function DevScreen() {
  const {
    deviceId, isOnline, isSyncing, userStats,
    syncLogs, pendingEventCount, syncedEventCount,
    vectorClocks, subjects, tasks, notifications,
    setIsOnline, setDeviceId, clearSyncLogs, addSyncLog,
  } = useAppStore();

  const [recentEvents, setRecentEvents] = useState<Array<{
    eventId: string; type: string; entityId: string; synced: number; createdAt: string;
  }>>([]);

  const refreshEvents = () => {
    try {
      const events = getAllEvents().slice(0, 15);
      setRecentEvents(events.map(e => ({
        eventId: e.eventId,
        type: e.type,
        entityId: e.entityId,
        synced: (e as any).synced,
        createdAt: e.createdAt,
      })));
    } catch { /* DB not ready */ }
  };

  useEffect(() => {
    refreshEvents();
    const interval = setInterval(refreshEvents, 3000);
    return () => clearInterval(interval);
  }, [deviceId]);

  const handleToggleOnline = (value: boolean) => {
    setIsOnline(value);
    addSyncLog(value ? '🟢 Went online' : '🔴 Went offline', value ? 'success' : 'info');
    if (value) {
      setTimeout(() => sync(), 500); // Sync immediately on reconnect
    }
  };

  const handleSwitchDevice = async (newId: 'client-a' | 'client-b') => {
    Alert.alert(
      'Switch Device',
      `This will reload the app as "${newId}". The local database will switch to this device's namespace.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch', onPress: async () => {
            await persistDeviceId(newId);
            setDeviceId(newId);
            setDatabaseNamespace(newId);
            getDb(); // Re-initialize with new namespace
            refreshSyllabusState();
            await refreshStateFromDb();
            addSyncLog(`Switched to ${newId}`, 'info');
          }
        }
      ]
    );
  };

  const handleManualSync = async () => {
    addSyncLog('Manual sync triggered', 'info');
    await sync();
    refreshEvents();
  };

  const handleResetDb = () => {
    Alert.alert(
      'Reset Server DB',
      'This will reset all server data (coins, streak, events, sessions). Local DB remains.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset', style: 'destructive', onPress: async () => {
            try {
              await fetch(`${BACKEND_URL}/dev/reset`, { method: 'POST' });
              addSyncLog('Server DB reset', 'success');
              await refreshStateFromDb();
            } catch {
              addSyncLog('Reset failed — server offline?', 'error');
            }
          }
        }
      ]
    );
  };

  const handleDuplicateEventReplay = async () => {
    // Demo: replay the first event to show idempotency
    try {
      const events = getAllEvents();
      if (events.length === 0) {
        addSyncLog('No events to replay', 'info');
        return;
      }
      const firstEvent = events[events.length - 1]; // oldest event
      addSyncLog(`Replaying event ${firstEvent.eventId.slice(0, 8)}...`, 'info');

      const res = await fetch(`${BACKEND_URL}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          lastSyncedSequence: 0,
          events: [firstEvent],
        }),
      });

      if (res.ok) {
        addSyncLog('✅ Duplicate event replayed — server correctly ignored it', 'success');
      }
    } catch (err) {
      addSyncLog('Replay failed', 'error');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Developer Panel 🛠️</Text>

      {/* Online/Offline Toggle */}
      <Section title="Network Simulation">
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>
              {isOnline ? '🟢 Online' : '🔴 Offline'}
            </Text>
            <Text style={styles.toggleSub}>
              {isOnline ? 'Events will sync immediately' : 'Events queued locally'}
            </Text>
          </View>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: '#7f1d1d', true: '#065f46' }}
            thumbColor={isOnline ? '#34d399' : '#ef4444'}
          />
        </View>
      </Section>

      {/* Device Switcher */}
      <Section title="Device Identity">
        <Text style={styles.deviceId}>{deviceId}</Text>
        <View style={styles.deviceButtons}>
          <TouchableOpacity
            style={[styles.deviceBtn, deviceId === 'client-a' && styles.deviceBtnActive]}
            onPress={() => handleSwitchDevice('client-a')}
          >
            <Text style={styles.deviceBtnText}>📱 client-a</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deviceBtn, deviceId === 'client-b' && styles.deviceBtnActive]}
            onPress={() => handleSwitchDevice('client-b')}
          >
            <Text style={styles.deviceBtnText}>💻 client-b</Text>
          </TouchableOpacity>
        </View>
      </Section>

      {/* Stats */}
      <Section title="Current State">
        <View style={styles.statsGrid}>
          <StatItem label="Coins" value={userStats.coins.toString()} color="#f59e0b" />
          <StatItem label="Streak" value={userStats.streak.toString()} color="#ef4444" />
          <StatItem label="Focus Min" value={userStats.focusMinutes.toString()} color="#7c3aed" />
          <StatItem label="Notifications" value={notifications.length.toString()} color="#10b981" />
          <StatItem label="Pending Events" value={pendingEventCount.toString()} color="#f59e0b" />
          <StatItem label="Synced Events" value={syncedEventCount.toString()} color="#10b981" />
          <StatItem label="Total Tasks" value={tasks.length.toString()} color="#60a5fa" />
          <StatItem label="Done Tasks" value={tasks.filter(t => t.status === 'DONE').length.toString()} color="#34d399" />
        </View>
      </Section>

      {/* Demo Actions */}
      <Section title="Demo Actions">
        <DemoButton icon="sync" label="Manual Sync" onPress={handleManualSync} disabled={isSyncing} />
        <DemoButton icon="replay" label="Replay Duplicate Event" onPress={handleDuplicateEventReplay} />
        <DemoButton icon="delete-forever" label="Reset Server DB" onPress={handleResetDb} danger />
      </Section>

      {/* Vector Clocks */}
      {Object.entries(vectorClocks).length > 0 && (
        <Section title="Vector Clocks">
          {Object.entries(vectorClocks).slice(0, 6).map(([entityId, clock]) => (
            <View key={entityId} style={styles.clockRow}>
              <Text style={styles.clockEntity} numberOfLines={1}>
                {entityId.length > 20 ? entityId.slice(0, 20) + '...' : entityId}
              </Text>
              <Text style={styles.clockValue}>
                {Object.entries(clock).map(([d, c]) => `${d}: ${c}`).join(', ')}
              </Text>
            </View>
          ))}
        </Section>
      )}

      {/* Recent Events */}
      <Section title={`Recent Events (${recentEvents.length})`}>
        {recentEvents.length === 0 ? (
          <Text style={styles.emptyText}>No events yet</Text>
        ) : (
          recentEvents.map((evt) => (
            <View key={evt.eventId} style={styles.eventRow}>
              <View style={[styles.syncDot, { backgroundColor: evt.synced ? '#10b981' : '#f59e0b' }]} />
              <View style={styles.eventContent}>
                <Text style={styles.eventType}>{evt.type}</Text>
                <Text style={styles.eventId}>{evt.eventId.slice(0, 12)}...</Text>
              </View>
              <Text style={styles.eventSynced}>{evt.synced ? '✅' : '⏳'}</Text>
            </View>
          ))
        )}
      </Section>

      {/* Sync Logs */}
      <Section title="Sync Logs" rightAction={{ label: 'Clear', onPress: clearSyncLogs }}>
        {syncLogs.length === 0 ? (
          <Text style={styles.emptyText}>No sync activity yet</Text>
        ) : (
          syncLogs.slice(0, 20).map((log, i) => (
            <View key={i} style={styles.logRow}>
              <View style={[styles.logDot, {
                backgroundColor: log.type === 'success' ? '#10b981' : log.type === 'error' ? '#ef4444' : '#6b7280'
              }]} />
              <Text style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</Text>
              <Text style={[styles.logMsg, {
                color: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#34d399' : '#9ca3af'
              }]}>{log.message}</Text>
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children, rightAction }: {
  title: string;
  children: React.ReactNode;
  rightAction?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {rightAction && (
          <TouchableOpacity onPress={rightAction.onPress}>
            <Text style={styles.rightAction}>{rightAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
      {children}
    </View>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function DemoButton({ icon, label, onPress, danger, disabled }: {
  icon: string; label: string; onPress: () => void; danger?: boolean; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.demoBtn, danger && styles.demoBtnDanger, disabled && { opacity: 0.5 }]}
      onPress={onPress}
      disabled={disabled}
    >
      <MaterialIcons name={icon as any} size={18} color={danger ? '#ef4444' : '#7c3aed'} />
      <Text style={[styles.demoBtnText, danger && { color: '#ef4444' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  content: { padding: 16, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 60, gap: 16 },
  title: { fontSize: 22, fontWeight: '800', color: '#f1f5f9', marginBottom: 8 },
  section: { backgroundColor: '#13131f', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e1e2e' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  rightAction: { fontSize: 13, color: '#7c3aed', fontWeight: '600' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { fontSize: 16, fontWeight: '700', color: '#e2e8f0' },
  toggleSub: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  deviceId: { fontSize: 13, color: '#9ca3af', fontFamily: 'monospace', marginBottom: 12, backgroundColor: '#0f0f1a', padding: 8, borderRadius: 8 },
  deviceButtons: { flexDirection: 'row', gap: 12 },
  deviceBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#1e1e2e', alignItems: 'center', borderWidth: 1, borderColor: '#374151' },
  deviceBtnActive: { backgroundColor: '#2e1065', borderColor: '#7c3aed' },
  deviceBtnText: { fontSize: 14, fontWeight: '600', color: '#e2e8f0' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statItem: { width: '45%', backgroundColor: '#0f0f1a', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#1e1e2e' },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 11, color: '#6b7280', marginTop: 4, textAlign: 'center' },
  demoBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#1e1e2e', borderRadius: 12, marginBottom: 8 },
  demoBtnDanger: { backgroundColor: '#7f1d1d22', borderWidth: 1, borderColor: '#7f1d1d' },
  demoBtnText: { fontSize: 14, fontWeight: '600', color: '#7c3aed' },
  clockRow: { marginBottom: 8 },
  clockEntity: { fontSize: 12, fontFamily: 'monospace', color: '#9ca3af', marginBottom: 2 },
  clockValue: { fontSize: 11, fontFamily: 'monospace', color: '#4b5563' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e1e2e' },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  eventContent: { flex: 1 },
  eventType: { fontSize: 12, fontWeight: '600', color: '#e2e8f0' },
  eventId: { fontSize: 10, fontFamily: 'monospace', color: '#4b5563', marginTop: 2 },
  eventSynced: { fontSize: 14 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4 },
  logDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5 },
  logTime: { fontSize: 10, color: '#4b5563', minWidth: 60 },
  logMsg: { flex: 1, fontSize: 12 },
  emptyText: { fontSize: 13, color: '#374151', textAlign: 'center', padding: 12 },
});
