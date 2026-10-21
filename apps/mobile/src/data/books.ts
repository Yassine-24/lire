import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { withAppTransaction } from '@/data/transactions';
import { sumSegmentSeconds } from '@/domain/time';

export type BookStatus = 'reading' | 'want_to_read' | 'finished' | 'paused';

export type Book = {
  id: string;
  title: string;
  author: string | null;
  status: BookStatus;
  page_count: number | null;
  current_page: number;
  catalog_id: string | null;
  isbn: string | null;
  cover_url: string | null;
  published_year: number | null;
  started_at: string | null;
  finished_at: string | null;
  rating: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type ReadingSegment = {
  id: string;
  session_id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
  updated_at?: string;
};

export type CurrentSession = {
  id: string;
  book_id: string;
  status: 'running' | 'paused';
  started_at: string;
  book_title: string;
  book_author: string | null;
  segments: ReadingSegment[];
};

export type SessionHistoryItem = {
  id: string;
  started_at: string;
  completed_at: string;
  updated_at: string;
  seconds: number;
};

const bookColumns = 'id, title, author, status, page_count, current_page, catalog_id, isbn, cover_url, published_year, started_at, finished_at, rating, notes, created_at, updated_at';

export async function listBooks(db: SQLiteDatabase): Promise<Book[]> {
  return db.getAllAsync<Book>(
    `SELECT ${bookColumns} FROM books ORDER BY CASE status WHEN 'reading' THEN 0 WHEN 'paused' THEN 1 WHEN 'want_to_read' THEN 2 ELSE 3 END, updated_at DESC, title COLLATE NOCASE ASC`,
  );
}

export async function getBook(db: SQLiteDatabase, id: string): Promise<Book | null> {
  return db.getFirstAsync<Book>(`SELECT ${bookColumns} FROM books WHERE id = ?`, id);
}

export async function createBook(
  db: SQLiteDatabase,
  input: {
    title: string;
    author?: string | null;
    status: BookStatus;
    currentPage?: number;
    pageCount?: number | null;
    catalogId?: string | null;
    isbn?: string | null;
    coverUrl?: string | null;
    publishedYear?: number | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    rating?: number | null;
    notes?: string | null;
  },
): Promise<string> {
  const title = input.title.trim();
  const author = input.author?.trim() || null;
  if (!title) throw new Error('Add a title before saving.');
  const pageCount = input.pageCount ?? null;
  const currentPage = input.status === 'finished' && pageCount !== null ? pageCount : input.currentPage ?? 0;
  if (!Number.isSafeInteger(currentPage) || currentPage < 0) {
    throw new Error('Current page must be a whole number of zero or more.');
  }
  if (pageCount !== null && (!Number.isSafeInteger(pageCount) || pageCount < 1)) {
    throw new Error('Total pages must be a positive whole number.');
  }
  if (pageCount !== null && currentPage > pageCount) {
    throw new Error('Current page cannot be greater than the total pages.');
  }
  if (input.rating != null && (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    throw new Error('Rating must be a whole number from one to five.');
  }

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync(
      'INSERT INTO books (id, title, author, status, page_count, current_page, catalog_id, isbn, cover_url, published_year, started_at, finished_at, rating, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      title,
      author,
      input.status,
      pageCount,
      currentPage,
      input.catalogId ?? null,
      input.isbn?.trim() || null,
      input.coverUrl ?? null,
      input.publishedYear ?? null,
      input.startedAt ?? (input.status === 'reading' ? now : null),
      input.finishedAt ?? (input.status === 'finished' ? now : null),
      input.rating ?? null,
      input.notes?.trim() || null,
      now,
      now,
    );
  });
  return id;
}

export async function updateBookProgress(
  db: SQLiteDatabase,
  id: string,
  input: { currentPage: number; pageCount: number | null },
): Promise<void> {
  if (!Number.isSafeInteger(input.currentPage) || input.currentPage < 0) {
    throw new Error('Current page must be a whole number of zero or more.');
  }
  if (input.pageCount !== null && (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1)) {
    throw new Error('Total pages must be a positive whole number.');
  }
  if (input.pageCount !== null && input.currentPage > input.pageCount) {
    throw new Error('Current page cannot be greater than the total pages.');
  }

  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync(
      "UPDATE books SET current_page = CASE WHEN status = 'finished' AND ? IS NOT NULL THEN ? ELSE ? END, page_count = ?, updated_at = ? WHERE id = ?",
      input.pageCount,
      input.pageCount,
      input.currentPage,
      input.pageCount,
      new Date().toISOString(),
      id,
    );
  });
}

export async function updateBookDetails(
  db: SQLiteDatabase,
  id: string,
  input: {
    title: string;
    author: string;
    isbn: string;
    startedAt: string;
    finishedAt: string;
    rating: number | null;
    notes: string;
  },
): Promise<void> {
  const title = input.title.trim();
  if (!title) throw new Error('A title is needed to save this book.');
  if (input.rating !== null && (!Number.isSafeInteger(input.rating) || input.rating < 1 || input.rating > 5)) {
    throw new Error('Rating must be a whole number from one to five.');
  }
  const startedAt = parseDateField(input.startedAt, 'Start date');
  const finishedAt = parseDateField(input.finishedAt, 'Finish date');
  if (startedAt && finishedAt && Date.parse(finishedAt) < Date.parse(startedAt)) {
    throw new Error('Finish date cannot be earlier than the start date.');
  }
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync(
      'UPDATE books SET title = ?, author = ?, isbn = ?, started_at = ?, finished_at = ?, rating = ?, notes = ?, updated_at = ? WHERE id = ?',
      title,
      input.author.trim() || null,
      input.isbn.trim() || null,
      startedAt,
      finishedAt,
      input.rating,
      input.notes.trim() || null,
      new Date().toISOString(),
      id,
    );
  });
}

function parseDateField(value: string, label: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) throw new Error(`${label} must use YYYY-MM-DD.`);
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0);
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return date.toISOString();
}

export async function updateBookStatus(
  db: SQLiteDatabase,
  id: string,
  status: BookStatus,
): Promise<void> {
  const now = new Date().toISOString();
  await withAppTransaction(db, async (transaction) => {
    const activeSession = await transaction.getFirstAsync<{ id: string }>(
      "SELECT id FROM reading_sessions WHERE book_id = ? AND status IN ('running', 'paused') LIMIT 1",
      id,
    );
    if (activeSession && status !== 'reading') {
      throw new Error('Pause or finish this book’s active timer before moving it to another shelf.');
    }

    const previous = await transaction.getFirstAsync<{ status: BookStatus }>(
      'SELECT status FROM books WHERE id = ?',
      id,
    );
    const restarted = previous?.status === 'finished' && status === 'reading';
    await transaction.runAsync(
      "UPDATE books SET status = ?, current_page = CASE WHEN ? = 'finished' AND page_count IS NOT NULL THEN page_count ELSE current_page END, started_at = CASE WHEN ? = 1 THEN ? WHEN ? = 'reading' AND started_at IS NULL THEN ? ELSE started_at END, finished_at = CASE WHEN ? = 'finished' THEN COALESCE(finished_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?",
      status,
      status,
      restarted ? 1 : 0,
      now,
      status,
      now,
      status,
      now,
      now,
      id,
    );
  });
}

export async function getReadingSegments(db: SQLiteDatabase): Promise<ReadingSegment[]> {
  return db.getAllAsync<ReadingSegment>(
    'SELECT segments.id, segments.session_id, sessions.book_id, segments.started_at, segments.ended_at, segments.updated_at FROM session_segments AS segments JOIN reading_sessions AS sessions ON sessions.id = segments.session_id ORDER BY segments.started_at ASC',
  );
}

export async function getCurrentSession(db: SQLiteDatabase): Promise<CurrentSession | null> {
  const session = await db.getFirstAsync<Omit<CurrentSession, 'segments'>>(
    "SELECT sessions.id, sessions.book_id, sessions.status, sessions.started_at, books.title AS book_title, books.author AS book_author FROM reading_sessions AS sessions JOIN books ON books.id = sessions.book_id WHERE sessions.status IN ('running', 'paused') LIMIT 1",
  );
  if (!session) return null;

  const segments = await db.getAllAsync<ReadingSegment>(
    'SELECT segments.id, segments.session_id, sessions.book_id, segments.started_at, segments.ended_at, segments.updated_at FROM session_segments AS segments JOIN reading_sessions AS sessions ON sessions.id = segments.session_id WHERE segments.session_id = ? ORDER BY segments.started_at ASC',
    session.id,
  );
  return { ...session, segments };
}

export async function getBookSessionHistory(
  db: SQLiteDatabase,
  bookId: string,
): Promise<SessionHistoryItem[]> {
  const sessions = await db.getAllAsync<Omit<SessionHistoryItem, 'seconds'>>(
    "SELECT id, started_at, completed_at, updated_at FROM reading_sessions WHERE book_id = ? AND status = 'completed' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 100",
    bookId,
  );
  if (sessions.length === 0) return [];

  const segments = await getReadingSegments(db);
  return sessions.map((session) => ({
    ...session,
    seconds: sumSegmentSeconds(segments.filter((segment) => segment.session_id === session.id)),
  }));
}

export async function getCompletedSessionCount(db: SQLiteDatabase): Promise<number> {
  const result = await db.getFirstAsync<{ total: number }>(
    "SELECT COUNT(*) AS total FROM reading_sessions WHERE status = 'completed'",
  );
  return result?.total ?? 0;
}


export async function deleteBook(db: SQLiteDatabase, id: string, cloudUserId?: string): Promise<void> {
  const deletedAt = new Date().toISOString();
  await withAppTransaction(db, async (transaction) => {
    const activeSession = await transaction.getFirstAsync<{ id: string }>(
      "SELECT id FROM reading_sessions WHERE book_id = ? AND status IN ('running', 'paused') LIMIT 1",
      id,
    );
    if (activeSession) throw new Error('Pause or finish this book’s timer before removing it.');

    if (cloudUserId) {
      await transaction.runAsync(
        'INSERT INTO deleted_book_ids (user_id, book_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(user_id, book_id) DO UPDATE SET deleted_at = excluded.deleted_at',
        cloudUserId,
        id,
        deletedAt,
      );
    }
    const result = await transaction.runAsync('DELETE FROM books WHERE id = ?', id);
    if (result.changes === 0) throw new Error('This book is no longer in your library.');
  });
}
