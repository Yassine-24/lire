import type { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(
    [
      "CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK (length(trim(title)) > 0), author TEXT, status TEXT NOT NULL CHECK (status IN ('reading', 'want_to_read', 'finished')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, page_count INTEGER CHECK (page_count IS NULL OR page_count > 0), current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0));",
      "CREATE TABLE IF NOT EXISTS reading_sessions (id TEXT PRIMARY KEY NOT NULL, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed')), started_at TEXT NOT NULL, completed_at TEXT);",
      "CREATE TABLE IF NOT EXISTS session_segments (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE, started_at TEXT NOT NULL, ended_at TEXT CHECK (ended_at IS NULL OR ended_at >= started_at));",
      'CREATE INDEX IF NOT EXISTS books_status_updated_idx ON books(status, updated_at DESC);',
      'CREATE INDEX IF NOT EXISTS sessions_book_completed_idx ON reading_sessions(book_id, completed_at DESC);',
      'CREATE INDEX IF NOT EXISTS segments_session_started_idx ON session_segments(session_id, started_at);',
      "CREATE UNIQUE INDEX IF NOT EXISTS one_unfinished_session_idx ON reading_sessions((1)) WHERE status IN ('running', 'paused');",
      'CREATE UNIQUE INDEX IF NOT EXISTS one_open_segment_idx ON session_segments((1)) WHERE ended_at IS NULL;',
    ].join('\n'),
  );

  const databaseVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((databaseVersion?.user_version ?? 0) < 2) {
    const bookColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(books)');
    if (!bookColumns.some((column) => column.name === 'page_count')) {
      await db.execAsync('ALTER TABLE books ADD COLUMN page_count INTEGER CHECK (page_count IS NULL OR page_count > 0);');
    }
    if (!bookColumns.some((column) => column.name === 'current_page')) {
      await db.execAsync('ALTER TABLE books ADD COLUMN current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0);');
    }
    await db.execAsync('PRAGMA user_version = 2;');
  }
}
