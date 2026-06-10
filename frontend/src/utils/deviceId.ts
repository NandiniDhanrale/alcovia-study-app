// ============================================================
// Device Identity
//
// Each device (browser tab/phone) gets a persistent deviceId.
// For multi-device simulation in the browser, we look for a
// URL param ?device=client-a or ?device=client-b.
// On native, we generate and store a UUID in AsyncStorage.
//
// Storage key is namespaced by deviceId so two browser tabs
// have fully isolated SQLite databases.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { generateUUID } from './idGenerator';
import { Platform } from 'react-native';

const DEVICE_ID_KEY = 'alcovia_device_id';

let _deviceId: string | null = null;

/**
 * Get the current device's persistent ID.
 * Must call initDeviceId() before using this.
 */
export function getDeviceId(): string {
  if (!_deviceId) {
    throw new Error('DeviceId not initialized. Call initDeviceId() first.');
  }
  return _deviceId;
}

/**
 * Initialize device identity.
 * - On web: check URL param ?device=client-a (for multi-window simulation)
 * - On native: read from AsyncStorage, generate if not found
 */
export async function initDeviceId(): Promise<string> {
  if (_deviceId) return _deviceId;

  // On web: allow URL param override for multi-tab simulation
  if (Platform.OS === 'web') {
    try {
      const url = new URL(window.location.href);
      const paramDevice = url.searchParams.get('device');
      if (paramDevice && (paramDevice === 'client-a' || paramDevice === 'client-b')) {
        _deviceId = paramDevice;
        console.log(`[DeviceId] Using URL param device: ${_deviceId}`);
        return _deviceId;
      }
    } catch {
      // Not in browser environment
    }
  }

  // Try to load from storage
  try {
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) {
      _deviceId = stored;
      console.log(`[DeviceId] Loaded from storage: ${_deviceId}`);
      return _deviceId;
    }
  } catch {
    // Storage not available
  }

  // Generate a new device ID
  _deviceId = `device-${generateUUID().slice(0, 8)}`;

  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, _deviceId);
  } catch {
    // Non-critical
  }

  console.log(`[DeviceId] Generated new device ID: ${_deviceId}`);
  return _deviceId;
}

/**
 * Override device ID (used by Dev Panel for switching between client-a/client-b)
 */
export async function setDeviceId(newId: string): Promise<void> {
  _deviceId = newId;
  try {
    await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
  } catch {
    // Non-critical
  }
}
