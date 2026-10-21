import type { SQLiteDatabase } from 'expo-sqlite';

const baseSchema = [
  "CREATE TABLE IF NOT EXISTS books (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK (length(trim(title)) > 0), author TEXT, status TEXT NOT NULL CHECK (status IN ('reading', 'want_to_read', 'finished')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, page_count INTEGER CHECK (page_count IS NULL OR page_count > 0), current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0));",
  "CREATE TABLE IF NOT EXISTS reading_sessions (id TEXT PRIMARY KEY NOT NULL, book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE, status TEXT NOT NULL CHECK (status IN ('running', 'paused', 'completed')), started_at TEXT NOT NULL, completed_at TEXT);",
  'CREATE TABLE IF NOT EXISTS session_segments (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL REFERENCES reading_sessions(id) ON DELETE CASCADE, started_at TEXT NOT NULL, ended_at TEXT CHECK (ended_at IS NULL OR ended_at >= started_at));',
  "CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
  'CREATE INDEX IF NOT EXISTS books_status_updated_idx ON books(status, updated_at DESC);',
  'CREATE INDEX IF NOT EXISTS sessions_book_completed_idx ON reading_sessions(book_id, completed_at DESC);',
  'CREATE INDEX IF NOT EXISTS segments_session_started_idx ON session_segments(session_id, started_at);',
  "CREATE UNIQUE INDEX IF NOT EXISTS one_unfinished_session_idx ON reading_sessions((1)) WHERE status IN ('running', 'paused');",
  'CREATE UNIQUE INDEX IF NOT EXISTS one_open_segment_idx ON session_segments((1)) WHERE ended_at IS NULL;',
].join('\n');

async function migrateToV2(db: SQLiteDatabase): Promise<void> {
  const bookColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(books)');
  if (!bookColumns.some((column) => column.name === 'page_count')) {
    await db.execAsync('ALTER TABLE books ADD COLUMN page_count INTEGER CHECK (page_count IS NULL OR page_count > 0);');
  }
  if (!bookColumns.some((column) => column.name === 'current_page')) {
    await db.execAsync('ALTER TABLE books ADD COLUMN current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0);');
  }
  await db.execAsync('PRAGMA user_version = 2;');
}

async function migrateToV3(db: SQLiteDatabase): Promise<void> {
  const sessionColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(reading_sessions)');
  const segmentColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(session_segments)');
  const has = (columns: { name: string }[], name: string) => columns.some((column) => column.name === name);

  // SQLite cannot alter a CHECK constraint, so rebuild only the parent table while
  // foreign-key enforcement is briefly disabled. Child tables continue to point at
  // the same `books` name and every existing row and id is retained.
  await db.execAsync('PRAGMA foreign_keys = OFF;');
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(
        [
          "CREATE TABLE books_next (id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL CHECK (length(trim(title)) > 0), author TEXT, status TEXT NOT NULL CHECK (status IN ('reading', 'want_to_read', 'finished', 'paused')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL, page_count INTEGER CHECK (page_count IS NULL OR page_count > 0), current_page INTEGER NOT NULL DEFAULT 0 CHECK (current_page >= 0), catalog_id TEXT, isbn TEXT, cover_url TEXT, published_year INTEGER, started_at TEXT, finished_at TEXT, rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5), notes TEXT);",
          'INSERT INTO books_next (id, title, author, status, created_at, updated_at, page_count, current_page) SELECT id, title, author, status, created_at, updated_at, page_count, current_page FROM books;',
          'DROP TABLE books;',
          'ALTER TABLE books_next RENAME TO books;',
          'CREATE INDEX IF NOT EXISTS books_status_updated_idx ON books(status, updated_at DESC);',
          ...(has(sessionColumns, 'updated_at')
            ? []
            : ["ALTER TABLE reading_sessions ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';", "UPDATE reading_sessions SET updated_at = COALESCE(completed_at, started_at) WHERE updated_at = '';"]),
          ...(has(segmentColumns, 'updated_at')
            ? []
            : ["ALTER TABLE session_segments ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';", "UPDATE session_segments SET updated_at = COALESCE(ended_at, started_at) WHERE updated_at = '';"]),
          'PRAGMA user_version = 3;',
        ].join('\n'),
      );
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(baseSchema);

  let databaseVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((databaseVersion?.user_version ?? 0) < 2) {
    await migrateToV2(db);
  }

  databaseVersion = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if ((databaseVersion?.user_version ?? 0) < 3) {
    await migrateToV3(db);
  }
}
