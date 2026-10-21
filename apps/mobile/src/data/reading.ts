import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { withAppTransaction } from '@/data/transactions';

function nowIso(): string {
  return new Date().toISOString();
}

export async function startSession(db: SQLiteDatabase, bookId: string): Promise<string> {
  const id = Crypto.randomUUID();
  const segmentId = Crypto.randomUUID();
  const now = nowIso();

  await withAppTransaction(db, async (transaction) => {
    const existing = await transaction.getFirstAsync<{ id: string; status: string }>(
      "SELECT id, status FROM reading_sessions WHERE status IN ('running', 'paused') LIMIT 1",
    );
    if (existing) {
      throw new Error('Finish or resume your current session before starting another.');
    }
    const book = await transaction.getFirstAsync<{ id: string }>(
      'SELECT id FROM books WHERE id = ?',
      bookId,
    );
    if (!book) throw new Error('That book could not be found.');

    await transaction.runAsync(
      "INSERT INTO reading_sessions (id, book_id, status, started_at, completed_at, updated_at) VALUES (?, ?, 'running', ?, NULL, ?)",
      id,
      bookId,
      now,
      now,
    );
    await transaction.runAsync(
      'INSERT INTO session_segments (id, session_id, started_at, ended_at, updated_at) VALUES (?, ?, ?, NULL, ?)',
      segmentId,
      id,
      now,
      now,
    );
    await transaction.runAsync(
      "UPDATE books SET status = 'reading', started_at = CASE WHEN status = 'finished' OR started_at IS NULL THEN ? ELSE started_at END, finished_at = NULL, updated_at = ? WHERE id = ?",
      now,
      now,
      bookId,
    );
  });

  return id;
}

export async function pauseSession(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await withAppTransaction(db, async (transaction) => {
    const session = await transaction.getFirstAsync<{ id: string; status: string }>(
      "SELECT id, status FROM reading_sessions WHERE id = ? AND status IN ('running', 'paused')",
      id,
    );
    if (!session || session.status !== 'running') throw new Error('This session is not running.');

    await transaction.runAsync(
      'UPDATE session_segments SET ended_at = ?, updated_at = ? WHERE session_id = ? AND ended_at IS NULL',
      now,
      now,
      id,
    );
    await transaction.runAsync("UPDATE reading_sessions SET status = 'paused', updated_at = ? WHERE id = ?", now, id);
  });
}

export async function resumeSession(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  const segmentId = Crypto.randomUUID();
  await withAppTransaction(db, async (transaction) => {
    const session = await transaction.getFirstAsync<{ id: string; status: string }>(
      "SELECT id, status FROM reading_sessions WHERE id = ? AND status IN ('running', 'paused')",
      id,
    );
    if (!session || session.status !== 'paused') throw new Error('This session is not paused.');

    const other = await transaction.getFirstAsync<{ id: string }>(
      "SELECT id FROM reading_sessions WHERE id != ? AND status IN ('running', 'paused') LIMIT 1",
      id,
    );
    if (other) throw new Error('Another session is already in progress.');

    await transaction.runAsync(
      'INSERT INTO session_segments (id, session_id, started_at, ended_at, updated_at) VALUES (?, ?, ?, NULL, ?)',
      segmentId,
      id,
      now,
      now,
    );
    await transaction.runAsync("UPDATE reading_sessions SET status = 'running', updated_at = ? WHERE id = ?", now, id);
  });
}

export async function finishSession(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await withAppTransaction(db, async (transaction) => {
    const session = await transaction.getFirstAsync<{ id: string; status: string }>(
      "SELECT id, status FROM reading_sessions WHERE id = ? AND status IN ('running', 'paused')",
      id,
    );
    if (!session) throw new Error('This session has already been finished.');

    if (session.status === 'running') {
      await transaction.runAsync(
        'UPDATE session_segments SET ended_at = ?, updated_at = ? WHERE session_id = ? AND ended_at IS NULL',
        now,
        now,
        id,
      );
    }
    await transaction.runAsync(
      "UPDATE reading_sessions SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?",
      now,
      now,
      id,
    );
  });
}

export async function correctSessionDuration(
  db: SQLiteDatabase,
  id: string,
  totalMinutes: number,
  finish: boolean,
): Promise<void> {
  if (!Number.isSafeInteger(totalMinutes) || totalMinutes < 0) {
    throw new Error('Enter a whole number of minutes from zero up.');
  }
  const now = nowIso();
  const targetSeconds = totalMinutes * 60;

  await withAppTransaction(db, async (transaction) => {
    const session = await transaction.getFirstAsync<{
      id: string;
      status: 'running' | 'paused' | 'completed';
      started_at: string;
    }>('SELECT id, status, started_at FROM reading_sessions WHERE id = ?', id);
    if (!session) throw new Error('This reading session could not be found.');

    const segments = await transaction.getAllAsync<{
      id: string;
      started_at: string;
      ended_at: string | null;
    }>(
      'SELECT id, started_at, ended_at FROM session_segments WHERE session_id = ? ORDER BY started_at ASC, id ASC',
      id,
    );
    if (segments.length === 0) throw new Error('This reading session has no saved time to correct.');

    const last = segments[segments.length - 1];
    const priorSeconds = segments.slice(0, -1).reduce((total, segment) => {
      const start = Date.parse(segment.started_at);
      const end = segment.ended_at ? Date.parse(segment.ended_at) : Date.parse(now);
      return total + (Number.isFinite(start) && Number.isFinite(end) && end > start
        ? Math.floor((end - start) / 1000)
        : 0);
    }, 0);
    if (targetSeconds < priorSeconds) {
      throw new Error('That total is shorter than the time saved in earlier parts of this session.');
    }

    const lastStart = Date.parse(last.started_at);
    const correctedEnd = lastStart + (targetSeconds - priorSeconds) * 1000;
    if (!Number.isFinite(lastStart) || correctedEnd < lastStart || correctedEnd > Date.parse(now)) {
      throw new Error('The corrected end time must be between the segment start and now.');
    }
    const previous = segments.length > 1 ? segments[segments.length - 2] : null;
    if (previous?.ended_at && correctedEnd < Date.parse(previous.ended_at)) {
      throw new Error('The corrected time overlaps an earlier reading segment.');
    }

    await transaction.runAsync(
      'UPDATE session_segments SET ended_at = ?, updated_at = ? WHERE id = ?',
      new Date(correctedEnd).toISOString(),
      now,
      last.id,
    );
    const nextStatus = finish ? 'completed' : session.status === 'completed' ? 'completed' : 'paused';
    const completedAt = nextStatus === 'completed' ? new Date(correctedEnd).toISOString() : null;
    await transaction.runAsync(
      'UPDATE reading_sessions SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?',
      nextStatus,
      completedAt,
      now,
      id,
    );
  });
}
