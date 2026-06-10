// ============================================================
// Database Connection — Frontend (expo-sqlite)
//
// Uses expo-sqlite for local persistence.
// The database is namespaced by deviceId so two browser tabs
// can have completely isolated state (client-a-db, client-b-db).
// ============================================================

import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL, SEED_DATA_SQL } from './schema';

let _db: SQLite.SQLiteDatabase | null = null;
let _deviceId: string = 'default';

/**
 * Set which device's database to use.
 * Must be called before getDb().
 * This enables "two browser windows = two devices" simulation.
 */
export function setDatabaseNamespace(deviceId: string): void {
  _deviceId = deviceId;
  _db = null; // Reset so we re-open with new name
}

/**
 * Get (or lazily create) the SQLite database for the current device.
 */
export function getDb(): SQLite.SQLiteDatabase {
  if (_db) return _db;

  // Namespace the DB file by deviceId — isolation between simulated devices
  const dbName = `alcovia-${_deviceId}.db`;
  _db = SQLite.openDatabaseSync(dbName);

  initializeSchema(_db);

  console.log(`[DB] Opened database: ${dbName}`);
  return _db;
}

/**
 * Initialize all tables. Idempotent — safe to call multiple times.
 */
function initializeSchema(db: SQLite.SQLiteDatabase): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  db.execSync('PRAGMA foreign_keys = ON;');

  for (const sql of CREATE_TABLES_SQL) {
    db.execSync(sql);
  }

  // Seed initial data (INSERT OR IGNORE ensures idempotency)
  db.execSync(SEED_DATA_SQL);

  console.log('[DB] Schema initialized');
}

/**
 * Get or set a sync metadata value (e.g., lastSyncedSequence).
 */
export function getSyncMetadata(db: SQLite.SQLiteDatabase, key: string): string | null {
  const row = db.getFirstSync<{ value: string }>(
    'SELECT value FROM sync_metadata WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export function setSyncMetadata(db: SQLite.SQLiteDatabase, key: string, value: string): void {
  db.runSync(
    'INSERT OR REPLACE INTO sync_metadata (key, value) VALUES (?, ?)',
    [key, value]
  );
}
