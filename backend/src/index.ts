// ============================================================
// Express Server Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import { getDb } from './db/database';
import syncRouter from './routes/sync';
import notificationRouter from './routes/notifications';
import stateRouter from './routes/state';

const app = express();
const PORT = process.env.PORT || 3001;

// ---- Middleware ----
app.use(cors({
  origin: '*', // Allow all origins for dev (Expo web)
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));

// ---- Request Logging ----
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---- Routes ----
app.use('/sync', syncRouter);
app.use('/', notificationRouter);
app.use('/state', stateRouter);

// ---- Health Check ----
app.get('/health', (_req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE studentId = ?').get('student-1') as {
    coins: number;
    streak: number;
    focusMinutes: number;
  };
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    studentId: 'student-1',
    coins: user?.coins ?? 0,
    streak: user?.streak ?? 0,
    focusMinutes: user?.focusMinutes ?? 0,
  });
});

// ---- Dev: Reset (for demo scenarios) ----
app.post('/dev/reset', (_req, res) => {
  const db = getDb();
  db.exec(`
    DELETE FROM events;
    DELETE FROM event_sequence;
    DELETE FROM processed_events;
    DELETE FROM notification_log;
    DELETE FROM focus_sessions;
    DELETE FROM subjects;
    DELETE FROM chapters;
    DELETE FROM tasks;
    DELETE FROM notifications;
    UPDATE users SET coins = 0, streak = 0, focusMinutes = 0 WHERE studentId = 'student-1';
  `);
  console.log('[Dev] Database reset');
  res.json({ success: true, message: 'Database reset' });
});

// ---- Dev: Get all events (for debugging) ----
app.get('/dev/events', (_req, res) => {
  const db = getDb();
  const events = db.prepare('SELECT * FROM events ORDER BY sequenceNumber ASC').all();
  res.json({ events, count: events.length });
});

// ---- Initialize DB and Start Server ----
getDb(); // Ensures schema is created on startup

app.listen(PORT, () => {
  console.log(`\n🚀 Alcovia Backend running on http://localhost:${PORT}`);
  console.log(`   POST /sync          — Event sync endpoint`);
  console.log(`   POST /mock-notification — n8n notification delivery`);
  console.log(`   GET  /notifications — Notification history`);
  console.log(`   GET  /state/user    — Current user stats`);
  console.log(`   GET  /health        — Health check\n`);
});

export { app };
