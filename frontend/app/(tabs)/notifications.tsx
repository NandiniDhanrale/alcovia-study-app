// ============================================================
// Notifications Screen
// ============================================================

import React, { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppStore } from '../../src/store/appStore';
import { BACKEND_URL } from '../../src/sync/syncEngine';

export default function NotificationsScreen() {
  const { notifications, isOnline, setNotifications } = useAppStore();

  const fetchNotifications = async () => {
    if (!isOnline) return;
    try {
      const res = await fetch(`${BACKEND_URL}/notifications`);
      if (res.ok) {
        const { notifications: data } = await res.json();
        setNotifications(data);
      }
    } catch {
      // Offline
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <TouchableOpacity onPress={fetchNotifications} style={styles.refreshBtn}>
          <MaterialIcons name="refresh" size={20} color="#7c3aed" />
        </TouchableOpacity>
      </View>

      {!isOnline && (
        <View style={styles.offlineBanner}>
          <MaterialIcons name="wifi-off" size={16} color="#f59e0b" />
          <Text style={styles.offlineText}>Offline — notifications load when connected</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        {notifications.length === 0 ? (
          <View style={styles.empty}>
            <MaterialIcons name="notifications-none" size={56} color="#374151" />
            <Text style={styles.emptyTitle}>No notifications yet</Text>
            <Text style={styles.emptySubtitle}>Complete a focus session to receive your first notification!</Text>
          </View>
        ) : (
          notifications.map((notif) => (
            <View key={notif.id} style={styles.notifCard}>
              <View style={styles.notifIcon}>
                <MaterialIcons name="local-fire-department" size={24} color="#ef4444" />
              </View>
              <View style={styles.notifContent}>
                <Text style={styles.notifMessage}>{notif.message}</Text>
                <View style={styles.notifMeta}>
                  <Text style={styles.metaText}>🪙 {notif.coins} coins</Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaText}>🔥 Streak {notif.streak}</Text>
                  <Text style={styles.metaDot}>·</Text>
                  <Text style={styles.metaTime}>
                    {new Date(notif.createdAt).toLocaleTimeString()}
                  </Text>
                </View>
                <Text style={styles.notifEventId} numberOfLines={1}>
                  ID: {notif.eventId.slice(0, 16)}...
                </Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {notifications.length > 0 && (
        <View style={styles.footer}>
          <MaterialIcons name="info" size={14} color="#4b5563" />
          <Text style={styles.footerText}>
            Each notification is sent exactly once per session (idempotent via n8n workflow)
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '800', color: '#f1f5f9' },
  refreshBtn: { padding: 8, backgroundColor: '#13131f', borderRadius: 10, borderWidth: 1, borderColor: '#1e1e2e' },
  offlineBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#78350f44', margin: 16, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: '#92400e' },
  offlineText: { flex: 1, fontSize: 13, color: '#f59e0b' },
  list: { padding: 16, gap: 12, paddingBottom: 40 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151' },
  emptySubtitle: { fontSize: 14, color: '#4b5563', textAlign: 'center', maxWidth: 280 },
  notifCard: { flexDirection: 'row', backgroundColor: '#13131f', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e1e2e', gap: 14 },
  notifIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#7f1d1d33', justifyContent: 'center', alignItems: 'center' },
  notifContent: { flex: 1 },
  notifMessage: { fontSize: 14, fontWeight: '600', color: '#e2e8f0', marginBottom: 6 },
  notifMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  metaDot: { fontSize: 12, color: '#4b5563' },
  metaTime: { fontSize: 11, color: '#4b5563' },
  notifEventId: { fontSize: 10, color: '#374151', fontFamily: 'monospace', marginTop: 2 },
  footer: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 8, borderTopWidth: 1, borderTopColor: '#1e1e2e' },
  footerText: { flex: 1, fontSize: 11, color: '#4b5563', lineHeight: 16 },
});
