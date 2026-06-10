// ============================================================
// Database Connection — Server
// Uses better-sqlite3 for synchronous, embedded SQLite.
// ============================================================

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL, SEED_SQL } from './schema';

// Use /data for Railway persistent volume, fall back to local ./data for dev
const DB_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? process.env.RAILWAY_VOLUME_MOUNT_PATH
  : path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'alcovia.db');


let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Initialize schema
  _db.exec(SCHEMA_SQL);
  _db.exec(SEED_SQL);

  console.log(`[DB] Connected to SQLite at ${DB_PATH}`);
  return _db;
}

/**
 * Get the next sequence number for an event.
 * Uses a dedicated auto-increment table to generate globally ordered sequence numbers.
 */
export function nextSequenceNumber(db: Database.Database): number {
  const result = db.prepare('INSERT INTO event_sequence (dummy) VALUES (1)').run();
  return Number(result.lastInsertRowid);
}

/**
 * Close the database connection (useful for tests).
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Create a fresh in-memory DB for testing.
 */
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  db.exec(SEED_SQL);
  return db;
}
