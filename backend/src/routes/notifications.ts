// ============================================================
// Notification Routes
//
// POST /mock-notification — n8n calls this to deliver notifications
// GET  /notifications     — Frontend polls for notification history
// POST /notification-log  — n8n checks/records idempotency log
// GET  /notification-log/:eventId — n8n checks if already sent
// ============================================================

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

// ---- POST /mock-notification ----
// Called by n8n after confirming the notification hasn't been sent yet.
// Stores the notification for UI display.
router.post('/mock-notification', (req: Request, res: Response) => {
  const db = getDb();
  const { eventId, sessionId, streak, coins } = req.body;

  if (!eventId || !sessionId) {
    res.status(400).json({ error: 'eventId and sessionId are required' });
    return;
  }

  const message = `🔥 Focus Session Success! Streak: ${streak} | Coins: ${coins}`;
  console.log(`[Notification] ${message} (eventId: ${eventId})`);

  db.prepare(`
    INSERT OR IGNORE INTO notifications (eventId, sessionId, streak, coins, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventId, sessionId, streak, coins, message);

  res.json({ success: true, message });
});

// ---- GET /notifications ----
// Returns all stored notifications for the UI.
router.get('/notifications', (_req: Request, res: Response) => {
  const db = getDb();

  const notifications = db.prepare(`
    SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 50
  `).all();

  res.json({ notifications });
});

// ---- GET /notification-log/:eventId ----
// n8n uses this to check if a notification was already sent (idempotency check).
router.get('/notification-log/:eventId', (req: Request, res: Response) => {
  const db = getDb();
  const { eventId } = req.params;

  const existing = db.prepare(
    'SELECT * FROM notification_log WHERE eventId = ?'
  ).get(eventId);

  res.json({ alreadySent: !!existing, record: existing || null });
});

// ---- POST /notification-log ----
// n8n records the eventId after successfully sending a notification.
// This is the idempotency write — if this exists, don't send again.
router.post('/notification-log', (req: Request, res: Response) => {
  const db = getDb();
  const { eventId, streak, coins } = req.body;

  if (!eventId) {
    res.status(400).json({ error: 'eventId is required' });
    return;
  }

  try {
    db.prepare(`
      INSERT INTO notification_log (eventId, streak, coins)
      VALUES (?, ?, ?)
    `).run(eventId, streak ?? 0, coins ?? 0);

    res.json({ success: true });
  } catch (err: unknown) {
    // Duplicate key — already logged (idempotent)
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      res.json({ success: true, alreadyLogged: true });
    } else {
      res.status(500).json({ error: 'Failed to log notification' });
    }
  }
});

export default router;
