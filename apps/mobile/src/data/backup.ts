import type { SQLiteDatabase } from 'expo-sqlite';
import type { Book, BookStatus } from '@/data/books';
import { withAppTransaction } from '@/data/transactions';

export type BackupSession = {
  id: string;
  book_id: string;
  status: 'running' | 'paused' | 'completed';
  started_at: string;
  completed_at: string | null;
  updated_at: string;
};

export type BackupSegment = {
  id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
};

export type LireBackup = {
  format: 'lire-backup';
  version: 3;
  exportedAt: string;
  books: Book[];
  sessions: BackupSession[];
  segments: BackupSegment[];
};

const invalidBackup = () => new Error('This file is not a valid Lire backup. Select a JSON backup exported by Lire.');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export async function createBackup(db: SQLiteDatabase): Promise<string> {
  let backup: LireBackup | null = null;

  await withAppTransaction(db, async (transaction) => {
    const exportedAt = new Date().toISOString();
    const books = await transaction.getAllAsync<Book>(
      'SELECT id, title, author, status, page_count, current_page, catalog_id, isbn, cover_url, published_year, started_at, finished_at, rating, notes, created_at, updated_at FROM books ORDER BY created_at ASC, id ASC',
    );
    const sessions = await transaction.getAllAsync<BackupSession>(
      'SELECT id, book_id, status, started_at, completed_at, updated_at FROM reading_sessions ORDER BY started_at ASC, id ASC',
    );
    const segments = await transaction.getAllAsync<BackupSegment>(
      'SELECT id, session_id, started_at, ended_at, updated_at FROM session_segments ORDER BY started_at ASC, id ASC',
    );
    const runningSessionIds = new Set(sessions.filter((session) => session.status === 'running').map((session) => session.id));
    const snapshotSessions = sessions.map((session) =>
      session.status === 'running' ? { ...session, status: 'paused' as const, updated_at: exportedAt } : session,
    );
    const snapshotSegments = segments.map((segment) => {
      if (segment.ended_at !== null) return segment;
      if (!runningSessionIds.has(segment.session_id)) {
        throw new Error('Your reading data could not be backed up because a session is inconsistent.');
      }
      return { ...segment, ended_at: exportedAt, updated_at: exportedAt };
    });

    backup = {
      format: 'lire-backup',
      version: 3,
      exportedAt,
      books,
      sessions: snapshotSessions,
      segments: snapshotSegments,
    };
  });

  if (!backup) throw new Error('Your backup could not be created.');
  return JSON.stringify(backup, null, 2);
}

export function parseBackup(contents: string): LireBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (
    !isRecord(raw) ||
    raw.format !== 'lire-backup' ||
    (raw.version !== 1 && raw.version !== 2 && raw.version !== 3) ||
    !isTimestamp(raw.exportedAt)
  ) {
    throw new Error('This backup was created by an incompatible version of Lire.');
  }
  if (!Array.isArray(raw.books) || !Array.isArray(raw.sessions) || !Array.isArray(raw.segments)) {
    throw invalidBackup();
  }

  const books = raw.books.map((item): Book => {
    const pageCount = raw.version === 1 ? null : isRecord(item) ? item.page_count : undefined;
    const currentPage = raw.version === 1 ? 0 : isRecord(item) ? item.current_page : undefined;
    const catalogId = raw.version === 3 && isRecord(item) ? item.catalog_id : null;
    const isbn = raw.version === 3 && isRecord(item) ? item.isbn : null;
    const coverUrl = raw.version === 3 && isRecord(item) ? item.cover_url : null;
    const publishedYear = raw.version === 3 && isRecord(item) ? item.published_year : null;
    const startedAt = raw.version === 3 && isRecord(item) ? item.started_at : null;
    const finishedAt = raw.version === 3 && isRecord(item) ? item.finished_at : null;
    const rating = raw.version === 3 && isRecord(item) ? item.rating : null;
    const notes = raw.version === 3 && isRecord(item) ? item.notes : null;
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.title) ||
      !(item.author === null || typeof item.author === 'string') ||
      !(raw.version === 3
        ? (['reading', 'want_to_read', 'finished', 'paused'] as unknown[]).includes(item.status)
        : (['reading', 'want_to_read', 'finished'] as unknown[]).includes(item.status)) ||
      !isTimestamp(item.created_at) ||
      !isTimestamp(item.updated_at) ||
      !(pageCount === null || (typeof pageCount === 'number' && Number.isSafeInteger(pageCount) && pageCount > 0)) ||
      typeof currentPage !== 'number' ||
      !Number.isSafeInteger(currentPage) ||
      currentPage < 0 ||
      (pageCount !== null && currentPage > pageCount) ||
      !(catalogId === null || typeof catalogId === 'string') ||
      !(isbn === null || typeof isbn === 'string') ||
      !(coverUrl === null || typeof coverUrl === 'string') ||
      !(publishedYear === null || (typeof publishedYear === 'number' && Number.isInteger(publishedYear))) ||
      !(startedAt === null || isTimestamp(startedAt)) ||
      !(finishedAt === null || isTimestamp(finishedAt)) ||
      !(rating === null || (typeof rating === 'number' && Number.isSafeInteger(rating) && rating >= 1 && rating <= 5)) ||
      !(notes === null || typeof notes === 'string') ||
      (startedAt !== null && finishedAt !== null && Date.parse(finishedAt) < Date.parse(startedAt))
    ) {
      throw invalidBackup();
    }
    return {
      id: item.id,
      title: item.title,
      author: item.author,
      status: item.status as BookStatus,
      page_count: pageCount,
      current_page: currentPage,
      catalog_id: catalogId,
      isbn,
      cover_url: coverUrl,
      published_year: publishedYear,
      started_at: startedAt,
      finished_at: finishedAt,
      rating,
      notes,
      created_at: item.created_at,
      updated_at: item.updated_at,
    };
  });

  const sessions = raw.sessions.map((item): BackupSession => {
    const updatedAt = raw.version === 3 && isRecord(item)
      ? item.updated_at
      : isRecord(item) ? item.completed_at ?? item.started_at : undefined;
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.book_id) ||
      !(['running', 'paused', 'completed'] as unknown[]).includes(item.status) ||
      !isTimestamp(item.started_at) ||
      !(item.completed_at === null || isTimestamp(item.completed_at)) ||
      !isTimestamp(updatedAt)
    ) {
      throw invalidBackup();
    }
    if ((item.status === 'completed') !== (item.completed_at !== null)) throw invalidBackup();
    return {
      id: item.id,
      book_id: item.book_id,
      status: item.status as BackupSession['status'],
      started_at: item.started_at,
      completed_at: item.completed_at,
      updated_at: updatedAt,
    };
  });

  const segments = raw.segments.map((item): BackupSegment => {
    const updatedAt = raw.version === 3 && isRecord(item)
      ? item.updated_at
      : isRecord(item) ? item.ended_at ?? item.started_at : undefined;
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.id) ||
      !isNonEmptyString(item.session_id) ||
      !isTimestamp(item.started_at) ||
      !(item.ended_at === null || isTimestamp(item.ended_at)) ||
      !isTimestamp(updatedAt)
    ) {
      throw invalidBackup();
    }
    if (item.ended_at !== null && Date.parse(item.ended_at) < Date.parse(item.started_at)) throw invalidBackup();
    return {
      id: item.id,
      session_id: item.session_id,
      started_at: item.started_at,
      ended_at: item.ended_at,
      updated_at: updatedAt,
    };
  });

  const bookIds = new Set<string>();
  for (const book of books) {
    if (bookIds.has(book.id)) throw invalidBackup();
    bookIds.add(book.id);
  }
  const sessionIds = new Set<string>();
  for (const session of sessions) {
    if (sessionIds.has(session.id) || !bookIds.has(session.book_id)) throw invalidBackup();
    sessionIds.add(session.id);
  }
  const segmentIds = new Set<string>();
  const segmentsBySession = new Map<string, BackupSegment[]>();
  for (const segment of segments) {
    if (segmentIds.has(segment.id) || !sessionIds.has(segment.session_id)) throw invalidBackup();
    segmentIds.add(segment.id);
    const list = segmentsBySession.get(segment.session_id) ?? [];
    list.push(segment);
    segmentsBySession.set(segment.session_id, list);
  }

  if (sessions.filter((session) => session.status !== 'completed').length > 1) throw invalidBackup();
  let runningSessionCount = 0;
  for (const session of sessions) {
    const sessionSegments = segmentsBySession.get(session.id) ?? [];
    if (sessionSegments.length === 0) throw invalidBackup();
    const sorted = [...sessionSegments].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
    if (Date.parse(sorted[0].started_at) !== Date.parse(session.started_at)) throw invalidBackup();

    let previousEnd: number | null = null;
    let previousWasOpen = false;
    let openCount = 0;
    for (const segment of sorted) {
      if (previousWasOpen) throw invalidBackup();
      const start = Date.parse(segment.started_at);
      if (previousEnd !== null && start < previousEnd) throw invalidBackup();
      if (segment.ended_at === null) {
        openCount += 1;
        if (session.status !== 'running' || Date.parse(raw.exportedAt as string) < start) throw invalidBackup();
        previousWasOpen = true;
        previousEnd = null;
      } else {
        const end = Date.parse(segment.ended_at);
        if (session.status === 'completed' && end > Date.parse(session.completed_at as string)) throw invalidBackup();
        previousEnd = end;
      }
    }
    if ((session.status === 'running' && openCount !== 1) || (session.status !== 'running' && openCount !== 0)) {
      throw invalidBackup();
    }
    if (session.status === 'running') runningSessionCount += 1;
  }
  if (runningSessionCount > 1 || segments.filter((segment) => segment.ended_at === null).length > 1) {
    throw invalidBackup();
  }

  const exportedAt = raw.exportedAt;
  return {
    format: 'lire-backup',
    version: 3,
    exportedAt,
    books,
    sessions: sessions.map((session) =>
      session.status === 'running' ? { ...session, status: 'paused' as const } : session,
    ),
    segments: segments.map((segment) =>
      segment.ended_at === null ? { ...segment, ended_at: exportedAt } : segment,
    ),
  };
}

export async function restoreBackup(db: SQLiteDatabase, backup: LireBackup): Promise<void> {
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync('DELETE FROM session_segments');
    await transaction.runAsync('DELETE FROM reading_sessions');
    await transaction.runAsync('DELETE FROM books');

    for (const book of backup.books) {
      await transaction.runAsync(
        'INSERT INTO books (id, title, author, status, page_count, current_page, catalog_id, isbn, cover_url, published_year, started_at, finished_at, rating, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        book.id,
        book.title,
        book.author,
        book.status,
        book.page_count,
        book.current_page,
        book.catalog_id,
        book.isbn,
        book.cover_url,
        book.published_year,
        book.started_at,
        book.finished_at,
        book.rating,
        book.notes,
        book.created_at,
        book.updated_at,
      );
    }
    for (const session of backup.sessions) {
      await transaction.runAsync(
        'INSERT INTO reading_sessions (id, book_id, status, started_at, completed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        session.id,
        session.book_id,
        session.status,
        session.started_at,
        session.completed_at,
        session.updated_at,
      );
    }
    for (const segment of backup.segments) {
      await transaction.runAsync(
        'INSERT INTO session_segments (id, session_id, started_at, ended_at, updated_at) VALUES (?, ?, ?, ?, ?)',
        segment.id,
        segment.session_id,
        segment.started_at,
        segment.ended_at,
        segment.updated_at,
      );
    }
  });
}
