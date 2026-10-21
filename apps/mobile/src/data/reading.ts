import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

function nowIso(): string {
  return new Date().toISOString();
}

export async function startSession(db: SQLiteDatabase, bookId: string): Promise<string> {
  const id = Crypto.randomUUID();
  const segmentId = Crypto.randomUUID();
  const now = nowIso();

  await db.withExclusiveTransactionAsync(async (transaction) => {
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
      "INSERT INTO reading_sessions (id, book_id, status, started_at, completed_at) VALUES (?, ?, 'running', ?, NULL)",
      id,
      bookId,
      now,
    );
    await transaction.runAsync(
      'INSERT INTO session_segments (id, session_id, started_at, ended_at) VALUES (?, ?, ?, NULL)',
      segmentId,
      id,
      now,
    );
    await transaction.runAsync(
      "UPDATE books SET status = 'reading', updated_at = ? WHERE id = ?",
      now,
      bookId,
    );
  });

  return id;
}

export async function pauseSession(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const session = await transaction.getFirstAsync<{ id: string; status: string }>(
      "SELECT id, status FROM reading_sessions WHERE id = ? AND status IN ('running', 'paused')",
      id,
    );
    if (!session || session.status !== 'running') throw new Error('This session is not running.');

    await transaction.runAsync(
      'UPDATE session_segments SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL',
      now,
      id,
    );
    await transaction.runAsync("UPDATE reading_sessions SET status = 'paused' WHERE id = ?", id);
  });
}

export async function resumeSession(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  const segmentId = Crypto.randomUUID();
  await db.withExclusiveTransactionAsync(async (transaction) => {
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
      'INSERT INTO session_segments (id, session_id, started_at, ended_at) VALUES (?, ?, ?, NULL)',
      segmentId,
      id,
      now,
    );
    await transaction.runAsync("UPDATE reading_sessions SET status = 'running' WHERE id = ?", id);
  });
}

export async function finishSession(db: SQLiteDatabase, id: string): Promise<void> {
  const now = nowIso();
  await db.withExclusiveTransactionAsync(async (transaction) => {
    const session = await transaction.getFirstAsync<{ id: string; status: string }>(
      "SELECT id, status FROM reading_sessions WHERE id = ? AND status IN ('running', 'paused')",
      id,
    );
    if (!session) throw new Error('This session has already been finished.');

    if (session.status === 'running') {
      await transaction.runAsync(
        'UPDATE session_segments SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL',
        now,
        id,
      );
    }
    await transaction.runAsync(
      "UPDATE reading_sessions SET status = 'completed', completed_at = ? WHERE id = ?",
      now,
      id,
    );
  });
}
