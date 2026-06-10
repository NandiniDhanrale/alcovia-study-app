// ============================================================
// SQLite Schema — Frontend (Local Device Storage)
//
// The local database stores events and derived state.
// When online, unsynced events are pushed to the server.
// ============================================================

export const CREATE_TABLES_SQL = [
  // ---- Event Log (local append-only log) ----
  // synced=0 means not yet pushed to server
  `CREATE TABLE IF NOT EXISTS events (
    eventId     TEXT PRIMARY KEY,
    deviceId    TEXT NOT NULL,
    counter     INTEGER NOT NULL,
    type        TEXT NOT NULL,
    entityId    TEXT NOT NULL,
    payload     TEXT NOT NULL,
    vectorClock TEXT NOT NULL,
    createdAt   TEXT NOT NULL,
    synced      INTEGER NOT NULL DEFAULT 0
  )`,

  // ---- Sync Metadata ----
  // Stores watermarks: lastSyncedSequence = the server sequence number
  // we last received. Only fetch events after this number on next sync.
  `CREATE TABLE IF NOT EXISTS sync_metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,

  // ---- Idempotency Guard ----
  // Events we've already processed locally (prevents double-applying on replay)
  `CREATE TABLE IF NOT EXISTS processed_events (
    eventId     TEXT PRIMARY KEY,
    processedAt TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ---- Focus Sessions ----
  `CREATE TABLE IF NOT EXISTS sessions (
    sessionId      TEXT PRIMARY KEY,
    status         TEXT NOT NULL DEFAULT 'RUNNING',
    targetDuration INTEGER NOT NULL,
    actualDuration INTEGER,
    failureReason  TEXT,
    startedAt      TEXT NOT NULL,
    completedAt    TEXT
  )`,

  // ---- Syllabus ----
  `CREATE TABLE IF NOT EXISTS subjects (
    subjectId   TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    vectorClock TEXT NOT NULL DEFAULT '{}'
  )`,

  `CREATE TABLE IF NOT EXISTS chapters (
    chapterId   TEXT PRIMARY KEY,
    subjectId   TEXT NOT NULL,
    name        TEXT NOT NULL,
    deleted     INTEGER NOT NULL DEFAULT 0,
    vectorClock TEXT NOT NULL DEFAULT '{}'
  )`,

  `CREATE TABLE IF NOT EXISTS tasks (
    taskId      TEXT PRIMARY KEY,
    chapterId   TEXT NOT NULL,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'NOT_STARTED',
    deleted     INTEGER NOT NULL DEFAULT 0,
    vectorClock TEXT NOT NULL DEFAULT '{}'
  )`,

  // ---- Local rewards (pending until confirmed by server) ----
  `CREATE TABLE IF NOT EXISTS local_rewards (
    sessionId TEXT PRIMARY KEY,
    coins     INTEGER NOT NULL DEFAULT 0,
    streak    INTEGER NOT NULL DEFAULT 0,
    awarded   INTEGER NOT NULL DEFAULT 0
  )`,
];

// Default seed data for demo — Math → Algebra chapter with tasks
export const SEED_DATA_SQL = `
  INSERT OR IGNORE INTO subjects (subjectId, name) VALUES
    ('sub-math', 'Mathematics'),
    ('sub-sci', 'Science'),
    ('sub-hist', 'History');

  INSERT OR IGNORE INTO chapters (chapterId, subjectId, name) VALUES
    ('ch-algebra', 'sub-math', 'Algebra'),
    ('ch-geometry', 'sub-math', 'Geometry'),
    ('ch-physics', 'sub-sci', 'Physics'),
    ('ch-chemistry', 'sub-sci', 'Chemistry'),
    ('ch-ancient', 'sub-hist', 'Ancient History');

  INSERT OR IGNORE INTO tasks (taskId, chapterId, name, status) VALUES
    ('task-alg-1', 'ch-algebra', 'Linear Equations', 'NOT_STARTED'),
    ('task-alg-2', 'ch-algebra', 'Quadratic Formula', 'NOT_STARTED'),
    ('task-alg-3', 'ch-algebra', 'Factoring Polynomials', 'NOT_STARTED'),
    ('task-alg-4', 'ch-algebra', 'Systems of Equations', 'NOT_STARTED'),
    ('task-geo-1', 'ch-geometry', 'Pythagorean Theorem', 'NOT_STARTED'),
    ('task-geo-2', 'ch-geometry', 'Circle Theorems', 'NOT_STARTED'),
    ('task-geo-3', 'ch-geometry', 'Area & Volume', 'NOT_STARTED'),
    ('task-phy-1', 'ch-physics', 'Newtons Laws', 'NOT_STARTED'),
    ('task-phy-2', 'ch-physics', 'Kinematics', 'NOT_STARTED'),
    ('task-phy-3', 'ch-physics', 'Energy & Work', 'NOT_STARTED'),
    ('task-chem-1', 'ch-chemistry', 'Periodic Table', 'NOT_STARTED'),
    ('task-chem-2', 'ch-chemistry', 'Chemical Bonds', 'NOT_STARTED'),
    ('task-hist-1', 'ch-ancient', 'Ancient Egypt', 'NOT_STARTED'),
    ('task-hist-2', 'ch-ancient', 'Greek Civilization', 'NOT_STARTED'),
    ('task-hist-3', 'ch-ancient', 'Roman Empire', 'NOT_STARTED');
`;
