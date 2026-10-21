import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(
    [
      "CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK (length(trim(title)) > 0), author TEXT, status TEXT NOT NULL CHECK (status IN ('reading', 'want_to_read', 'finished')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);",
      "CREATE TABLE IF NOT EXISTS reading_sessions (id TEXT PRIMARY KEY NOT NULL, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed')), started_at TEXT NOT NULL, completed_at TEXT);",
      "CREATE TABLE IF NOT EXISTS session_segments (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE, started_at TEXT NOT NULL, ended_at TEXT CHECK (ended_at IS NULL OR ended_at >= started_at));",
      'CREATE INDEX IF NOT EXISTS books_status_updated_idx ON books(status, updated_at DESC);',
      'CREATE INDEX IF NOT EXISTS sessions_book_completed_idx ON reading_sessions(book_id, completed_at DESC);',
      'CREATE INDEX IF NOT EXISTS segments_session_started_idx ON session_segments(session_id, started_at);',
      "CREATE UNIQUE INDEX IF NOT EXISTS one_unfinished_session_idx ON reading_sessions((1)) WHERE status IN ('running', 'paused');",
      'CREATE UNIQUE INDEX IF NOT EXISTS one_open_segment_idx ON session_segments((1)) WHERE ended_at IS NULL;',
      'PRAGMA user_version = 1;',
    ].join('\n'),
  );
}
