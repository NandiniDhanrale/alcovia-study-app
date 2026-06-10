// ============================================================
// Notification Routes
//
// POST /mock-notification       - n8n calls this to deliver notifications
// GET  /notifications           - Frontend polls for notification history
// POST /notification-log/claim  - n8n atomically claims delivery rights
// POST /notification-log        - n8n marks a claimed notification as sent
// GET  /notification-log/:eventId - debug/visibility for notification state
// ============================================================

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

router.post('/mock-notification', (req: Request, res: Response) => {
  const db = getDb();
  const { eventId, sessionId, streak, coins } = req.body;

  if (!eventId || !sessionId) {
    res.status(400).json({ error: 'eventId and sessionId are required' });
    return;
  }

  const message = `Focus Session Success! Streak: ${streak} | Coins: ${coins}`;
  console.log(`[Notification] ${message} (eventId: ${eventId})`);

  db.prepare(`
    INSERT OR IGNORE INTO notifications (eventId, sessionId, streak, coins, message)
    VALUES (?, ?, ?, ?, ?)
  `).run(eventId, sessionId, streak, coins, message);

  res.json({ success: true, message });
});

router.get('/notifications', (_req: Request, res: Response) => {
  const db = getDb();

  const notifications = db.prepare(`
    SELECT * FROM notifications ORDER BY createdAt DESC LIMIT 50
  `).all();

  res.json({ notifications });
});

router.get('/notification-log/:eventId', (req: Request, res: Response) => {
  const db = getDb();
  const { eventId } = req.params;

  const existing = db.prepare(
    'SELECT * FROM notification_log WHERE eventId = ?'
  ).get(eventId) as { sentAt: string | null } | undefined;

  res.json({ alreadySent: !!existing?.sentAt, record: existing || null });
});

router.post('/notification-log/claim', (req: Request, res: Response) => {
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

    res.json({ claimed: true });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE constraint')) {
      res.json({ claimed: false, alreadyClaimed: true });
    } else {
      res.status(500).json({ error: 'Failed to claim notification' });
    }
  }
});

router.post('/notification-log', (req: Request, res: Response) => {
  const db = getDb();
  const { eventId, streak, coins } = req.body;

  if (!eventId) {
    res.status(400).json({ error: 'eventId is required' });
    return;
  }

  try {
    const result = db.prepare(`
      UPDATE notification_log
      SET sentAt = datetime('now'),
          streak = COALESCE(?, streak),
          coins = COALESCE(?, coins)
      WHERE eventId = ?
    `).run(streak ?? null, coins ?? null, eventId);

    if (result.changes === 0) {
      res.status(404).json({ error: 'Notification claim not found' });
      return;
    }

    res.json({ success: true, markedSent: true });
  } catch {
    res.status(500).json({ error: 'Failed to log notification' });
  }
});

export default router;
