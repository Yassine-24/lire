import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { sumSegmentSeconds } from '@/domain/time';

export type BookStatus = 'reading' | 'want_to_read' | 'finished';

export type Book = {
  id: string;
  title: string;
  author: string | null;
  status: BookStatus;
  created_at: string;
  updated_at: string;
};

export type ReadingSegment = {
  id: string;
  session_id: string;
  book_id: string;
  started_at: string;
  ended_at: string | null;
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
  completed_at: string;
  seconds: number;
};

export async function listBooks(db: SQLiteDatabase): Promise<Book[]> {
  return db.getAllAsync<Book>(
    "SELECT id, title, author, status, created_at, updated_at FROM books ORDER BY CASE status WHEN 'reading' THEN 0 WHEN 'want_to_read' THEN 1 ELSE 2 END, updated_at DESC, title COLLATE NOCASE ASC",
  );
}

export async function getBook(db: SQLiteDatabase, id: string): Promise<Book | null> {
  return db.getFirstAsync<Book>(
    'SELECT id, title, author, status, created_at, updated_at FROM books WHERE id = ?',
    id,
  );
}

export async function createBook(
  db: SQLiteDatabase,
  input: { title: string; author?: string; status: BookStatus },
): Promise<string> {
  const title = input.title.trim();
  const author = input.author?.trim() || null;
  if (!title) throw new Error('Add a title before saving.');

  const id = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    'INSERT INTO books (id, title, author, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    title,
    author,
    input.status,
    now,
    now,
  );
  return id;
}

export async function updateBookStatus(
  db: SQLiteDatabase,
  id: string,
  status: BookStatus,
): Promise<void> {
  await db.runAsync(
    'UPDATE books SET status = ?, updated_at = ? WHERE id = ?',
    status,
    new Date().toISOString(),
    id,
  );
}

export async function getReadingSegments(db: SQLiteDatabase): Promise<ReadingSegment[]> {
  return db.getAllAsync<ReadingSegment>(
    'SELECT segments.id, segments.session_id, sessions.book_id, segments.started_at, segments.ended_at FROM session_segments AS segments JOIN reading_sessions AS sessions ON sessions.id = segments.session_id ORDER BY segments.started_at ASC',
  );
}

export async function getCurrentSession(db: SQLiteDatabase): Promise<CurrentSession | null> {
  const session = await db.getFirstAsync<Omit<CurrentSession, 'segments'>>(
    "SELECT sessions.id, sessions.book_id, sessions.status, sessions.started_at, books.title AS book_title, books.author AS book_author FROM reading_sessions AS sessions JOIN books ON books.id = sessions.book_id WHERE sessions.status IN ('running', 'paused') LIMIT 1",
  );
  if (!session) return null;

  const segments = await db.getAllAsync<ReadingSegment>(
    'SELECT segments.id, segments.session_id, sessions.book_id, segments.started_at, segments.ended_at FROM session_segments AS segments JOIN reading_sessions AS sessions ON sessions.id = sessions.session_id WHERE segments.session_id = ? ORDER BY segments.started_at ASC',
    session.id,
  );
  return { ...session, segments };
}

export async function getBookSessionHistory(
  db: SQLiteDatabase,
  bookId: string,
): Promise<SessionHistoryItem[]> {
  const sessions = await db.getAllAsync<{ id: string; completed_at: string }>(
    "SELECT id, completed_at FROM reading_sessions WHERE book_id = ? AND status = 'completed' AND completed_at IS NOT NULL ORDER BY completed_at DESC LIMIT 30",
    bookId,
  );
  if (sessions.length === 0) return [];

  const segments = await getReadingSegments(db);
  return sessions.map((session) => ({
    id: session.id,
    completed_at: session.completed_at,
    seconds: sumSegmentSeconds(segments.filter((segment) => segment.session_id === session.id)),
  }));
}
