// ============================================================
// Root Layout — Expo Router
// Initializes device ID, database, and periodic sync
// ============================================================

import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import { initDeviceId, getDeviceId } from '../src/utils/deviceId';
import { setDatabaseNamespace, getDb } from '../src/db/database';
import { refreshStateFromDb, sync } from '../src/sync/syncEngine';
import { refreshSyllabusState } from '../src/features/syllabus/syllabusService';
import { useAppStore } from '../src/store/appStore';
import { useFonts } from 'expo-font';

export default function RootLayout() {
  const { isInitialized, setIsInitialized, setDeviceId, isOnline } = useAppStore();

  const [fontsLoaded] = useFonts({
    // Using system fonts — no additional load needed
  });

  useEffect(() => {
    async function initialize() {
      try {
        // Step 1: Determine device identity
        const deviceId = await initDeviceId();
        setDeviceId(deviceId);

        // Step 2: Open the correct namespaced DB
        setDatabaseNamespace(deviceId);

        // Step 3: Initialize DB (creates tables, seeds data)
        getDb();

        // Step 4: Load state into memory
        refreshSyllabusState();
        await refreshStateFromDb();

        setIsInitialized(true);
        console.log(`[App] Initialized as ${deviceId}`);

        // Step 5: Initial sync attempt
        await sync();
      } catch (err) {
        console.error('[App] Initialization error:', err);
        setIsInitialized(true); // Still show app even if sync fails
      }
    }

    initialize();
  }, []);

  // Periodic sync every 30 seconds when online
  useEffect(() => {
    if (!isInitialized) return;
    const interval = setInterval(() => {
      if (isOnline) sync();
    }, 30000);
    return () => clearInterval(interval);
  }, [isInitialized, isOnline]);

  if (!isInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f0f1a' }}>
        <ActivityIndicator size="large" color="#7c3aed" />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
