// ============================================================
// Database Schema — Server-side SQLite
// Single source of truth for all persisted server state.
// ============================================================

export const SCHEMA_SQL = `
  -- ---- User (single hardcoded student) ----
  CREATE TABLE IF NOT EXISTS users (
    studentId   TEXT PRIMARY KEY,
    coins       INTEGER NOT NULL DEFAULT 0,
    streak      INTEGER NOT NULL DEFAULT 0,
    focusMinutes INTEGER NOT NULL DEFAULT 0,
    updatedAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ---- Event Log (append-only, source of truth) ----
  -- sequenceNumber is a server-assigned global ordering number.
  -- Clients use this to fetch only missing events (incremental sync).
  CREATE TABLE IF NOT EXISTS events (
    eventId        TEXT PRIMARY KEY,
    deviceId       TEXT NOT NULL,
    type           TEXT NOT NULL,
    entityId       TEXT NOT NULL,
    payload        TEXT NOT NULL,  -- JSON
    vectorClock    TEXT NOT NULL,  -- JSON
    counter        INTEGER NOT NULL,
    createdAt      TEXT NOT NULL,
    receivedAt     TEXT NOT NULL DEFAULT (datetime('now')),
    sequenceNumber INTEGER NOT NULL  -- server-assigned, globally ordered
  );

  -- Auto-increment sequence table
  CREATE TABLE IF NOT EXISTS event_sequence (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    dummy INTEGER
  );

  -- ---- Idempotency Guard for Rewards ----
  -- Before awarding coins/streak, check this table.
  -- If eventId already here → skip. This ensures exactly-once reward semantics.
  CREATE TABLE IF NOT EXISTS processed_events (
    eventId     TEXT PRIMARY KEY,
    processedAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- ---- Idempotency Guard for Notifications ----
  -- Checked by n8n workflow before sending a notification.
  CREATE TABLE IF NOT EXISTS notification_log (
    eventId     TEXT PRIMARY KEY,
    claimedAt   TEXT NOT NULL DEFAULT (datetime('now')),
    sentAt      TEXT,
    streak      INTEGER,
    coins       INTEGER
  );

  -- ---- Focus Sessions ----
  CREATE TABLE IF NOT EXISTS focus_sessions (
    sessionId      TEXT PRIMARY KEY,
    studentId      TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'RUNNING',
    targetDuration INTEGER NOT NULL,
    actualDuration INTEGER,
    failureReason  TEXT,
    startedAt      TEXT,
    completedAt    TEXT,
    FOREIGN KEY (studentId) REFERENCES users(studentId)
  );

  -- ---- Syllabus ----
  CREATE TABLE IF NOT EXISTS subjects (
    subjectId   TEXT PRIMARY KEY,
    studentId   TEXT NOT NULL,
    name        TEXT NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    vectorClock TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS chapters (
    chapterId   TEXT PRIMARY KEY,
    subjectId   TEXT NOT NULL,
    name        TEXT NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    vectorClock TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS tasks (
    taskId      TEXT PRIMARY KEY,
    chapterId   TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'NOT_STARTED',
    deleted     INTEGER NOT NULL DEFAULT 0,
    vectorClock TEXT NOT NULL DEFAULT '{}'
  );

  -- ---- Stored Notifications (for UI display) ----
  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    eventId     TEXT NOT NULL,
    sessionId   TEXT NOT NULL,
    streak      INTEGER NOT NULL,
    coins       INTEGER NOT NULL,
    message     TEXT NOT NULL,
    createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

// Seed the single hardcoded student
export const SEED_SQL = `
  INSERT OR IGNORE INTO users (studentId, coins, streak, focusMinutes)
  VALUES ('student-1', 0, 0, 0);
`;
