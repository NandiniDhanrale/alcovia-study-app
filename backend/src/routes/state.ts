// ============================================================
// State Query Routes
// Returns current derived state for the frontend to display.
// ============================================================

import { Router, Request, Response } from 'express';
import { getDb } from '../db/database';

const router = Router();

const STUDENT_ID = 'student-1';

// ---- GET /state/user ----
router.get('/user', (_req: Request, res: Response) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE studentId = ?').get(STUDENT_ID);
  res.json({ user });
});

// ---- GET /state/sessions ----
router.get('/sessions', (_req: Request, res: Response) => {
  const db = getDb();
  const sessions = db.prepare(
    'SELECT * FROM focus_sessions WHERE studentId = ? ORDER BY startedAt DESC LIMIT 20'
  ).all(STUDENT_ID);
  res.json({ sessions });
});

// ---- GET /state/syllabus ----
router.get('/syllabus', (_req: Request, res: Response) => {
  const db = getDb();

  const subjects = db.prepare(
    'SELECT * FROM subjects WHERE studentId = ? AND deleted = 0'
  ).all(STUDENT_ID);

  const chapters = db.prepare(
    'SELECT c.* FROM chapters c JOIN subjects s ON c.subjectId = s.subjectId WHERE s.studentId = ? AND c.deleted = 0'
  ).all(STUDENT_ID);

  const tasks = db.prepare(`
    SELECT t.* FROM tasks t
    JOIN chapters c ON t.chapterId = c.chapterId
    JOIN subjects s ON c.subjectId = s.subjectId
    WHERE s.studentId = ? AND t.deleted = 0
  `).all(STUDENT_ID);

  res.json({ subjects, chapters, tasks });
});

export default router;
