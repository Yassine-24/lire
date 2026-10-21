import type { SQLiteDatabase } from 'expo-sqlite';
import { listBooks, type Book } from '@/data/books';
import { withAppTransaction } from '@/data/transactions';
import { supabase } from '@/data/supabase';

type CloudSession = {
  id: string;
  user_id: string;
  book_id: string;
  status: 'completed';
  started_at: string;
  completed_at: string;
  updated_at: string;
};

type CloudBookDeletion = {
  user_id: string;
  book_id: string;
  deleted_at: string;
};

type LocalBookDeletion = Omit<CloudBookDeletion, 'user_id'>;

type CloudSegment = {
  id: string;
  user_id: string;
  session_id: string;
  started_at: string;
  ended_at: string;
  updated_at: string;
};

type LocalSession = Omit<CloudSession, 'user_id'>;
type LocalSegment = Omit<CloudSegment, 'user_id'>;

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

function remoteWins(remoteUpdatedAt: string, localUpdatedAt: string): boolean {
  return Date.parse(remoteUpdatedAt) > Date.parse(localUpdatedAt);
}

async function saveCloudBookLocally(db: SQLiteDatabase, book: Book): Promise<void> {
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync(
      'INSERT INTO books (id, title, author, status, page_count, current_page, catalog_id, isbn, cover_url, published_year, started_at, finished_at, rating, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title=excluded.title, author=excluded.author, status=excluded.status, page_count=excluded.page_count, current_page=excluded.current_page, catalog_id=excluded.catalog_id, isbn=excluded.isbn, cover_url=excluded.cover_url, published_year=excluded.published_year, started_at=excluded.started_at, finished_at=excluded.finished_at, rating=excluded.rating, notes=excluded.notes, updated_at=excluded.updated_at',
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
  });
}

async function saveCloudSessionLocally(db: SQLiteDatabase, session: LocalSession): Promise<void> {
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync(
      "INSERT INTO reading_sessions (id, book_id, status, started_at, completed_at, updated_at) VALUES (?, ?, 'completed', ?, ?, ?) ON CONFLICT(id) DO UPDATE SET book_id=excluded.book_id, status='completed', started_at=excluded.started_at, completed_at=excluded.completed_at, updated_at=excluded.updated_at",
      session.id,
      session.book_id,
      session.started_at,
      session.completed_at,
      session.updated_at,
    );
  });
}

async function saveCloudSegmentLocally(db: SQLiteDatabase, segment: LocalSegment): Promise<void> {
  await withAppTransaction(db, async (transaction) => {
    await transaction.runAsync(
      'INSERT INTO session_segments (id, session_id, started_at, ended_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET session_id=excluded.session_id, started_at=excluded.started_at, ended_at=excluded.ended_at, updated_at=excluded.updated_at',
      segment.id,
      segment.session_id,
      segment.started_at,
      segment.ended_at,
      segment.updated_at,
    );
  });
}

export async function synchronizeReadingData(
  db: SQLiteDatabase,
  userId: string,
): Promise<{ books: number; sessions: number }> {
  if (!supabase) throw new Error('Add your Supabase URL and publishable key to enable account sync.');

  const [
    { data: remoteBooks, error: bookReadError },
    { data: remoteSessions, error: sessionReadError },
    { data: remoteDeletions, error: deletionReadError },
  ] = await Promise.all([
    supabase.from('user_books').select('*').eq('user_id', userId),
    supabase.from('reading_sessions').select('*').eq('user_id', userId),
    supabase.from('user_book_deletions').select('*').eq('user_id', userId),
  ]);
  throwIfError(bookReadError);
  throwIfError(sessionReadError);
  throwIfError(deletionReadError);

  const localDeletions = await db.getAllAsync<LocalBookDeletion>(
    'SELECT book_id, deleted_at FROM deleted_book_ids WHERE user_id = ?',
    userId,
  );
  const deletionByBookId = new Map<string, string>();
  for (const deletion of remoteDeletions ?? []) {
    const row = deletion as CloudBookDeletion;
    deletionByBookId.set(row.book_id, row.deleted_at);
  }
  for (const deletion of localDeletions) {
    const existing = deletionByBookId.get(deletion.book_id);
    if (!existing || Date.parse(deletion.deleted_at) > Date.parse(existing)) {
      deletionByBookId.set(deletion.book_id, deletion.deleted_at);
    }
  }
  const deletedBookIds = new Set(deletionByBookId.keys());
  const deletionsToPush = [...deletionByBookId].map(([book_id, deleted_at]) => ({ user_id: userId, book_id, deleted_at }));
  if (deletionsToPush.length > 0) {
    const { error } = await supabase.from('user_book_deletions').upsert(deletionsToPush, { onConflict: 'user_id,book_id' });
    throwIfError(error);
  }
  for (const bookId of deletedBookIds) {
    const { error } = await supabase.from('user_books').delete().eq('user_id', userId).eq('id', bookId);
    throwIfError(error);
  }
  if (deletedBookIds.size > 0) {
    await withAppTransaction(db, async (transaction) => {
      for (const [bookId, deletedAt] of deletionByBookId) {
        await transaction.runAsync(
          'INSERT INTO deleted_book_ids (user_id, book_id, deleted_at) VALUES (?, ?, ?) ON CONFLICT(user_id, book_id) DO UPDATE SET deleted_at = excluded.deleted_at',
          userId,
          bookId,
          deletedAt,
        );
        await transaction.runAsync('DELETE FROM books WHERE id = ?', bookId);
      }
    });
  }

  const availableRemoteBooks = (remoteBooks ?? []).filter((value) => !deletedBookIds.has((value as Book).id));
  const availableRemoteSessions = (remoteSessions ?? []).filter((value) => !deletedBookIds.has((value as CloudSession).book_id));
  let localBooks = await listBooks(db);
  const localBooksById = new Map(localBooks.map((book) => [book.id, book]));
  for (const value of availableRemoteBooks) {
    const remote = value as Book & { user_id: string };
    const local = localBooksById.get(remote.id);
    if (!local || remoteWins(remote.updated_at, local.updated_at)) {
      await saveCloudBookLocally(db, remote);
    }
  }
  localBooks = await listBooks(db);

  const userBookRows = localBooks.map((book) => ({ ...book, user_id: userId }));
  if (userBookRows.length > 0) {
    const { error } = await supabase.from('user_books').upsert(userBookRows, { onConflict: 'id' });
    throwIfError(error);
  }

  const localSessions = await db.getAllAsync<LocalSession>(
    "SELECT id, book_id, status, started_at, completed_at, updated_at FROM reading_sessions WHERE status = 'completed' AND completed_at IS NOT NULL ORDER BY updated_at ASC",
  );
  const localSessionsById = new Map(localSessions.map((session) => [session.id, session]));
  const sessionsToPush = new Map<string, LocalSession>();
  for (const value of availableRemoteSessions) {
    const remote = value as CloudSession;
    const local = localSessionsById.get(remote.id);
    if (!local) {
      await saveCloudSessionLocally(db, remote);
    } else if (remoteWins(remote.updated_at, local.updated_at)) {
      await saveCloudSessionLocally(db, remote);
    } else {
      sessionsToPush.set(local.id, local);
    }
  }
  for (const local of localSessions) {
    if (!availableRemoteSessions.some((value) => (value as CloudSession).id === local.id)) {
      sessionsToPush.set(local.id, local);
    }
  }

  const cloudSessions = [...availableRemoteSessions] as CloudSession[];
  const sessionIds = new Set([...cloudSessions.map((session) => session.id), ...localSessions.map((session) => session.id)]);
  const sessionIdList = [...sessionIds];
  let remoteSegments: CloudSegment[] = [];
  if (sessionIdList.length > 0) {
    const { data, error } = await supabase.from('session_segments').select('*').eq('user_id', userId).in('session_id', sessionIdList);
    throwIfError(error);
    remoteSegments = (data ?? []) as CloudSegment[];
  }

  const completedIds = new Set(localSessions.map((session) => session.id));
  for (const session of cloudSessions) completedIds.add(session.id);
  const localSegments = completedIds.size > 0
    ? await db.getAllAsync<LocalSegment>(
        `SELECT id, session_id, started_at, ended_at, updated_at FROM session_segments WHERE session_id IN (${[...completedIds].map(() => '?').join(',')}) ORDER BY updated_at ASC`,
        ...completedIds,
      )
    : [];
  const localSegmentsById = new Map(localSegments.map((segment) => [segment.id, segment]));
  const segmentsToPush = new Map<string, LocalSegment>();
  for (const remote of remoteSegments) {
    const local = localSegmentsById.get(remote.id);
    if (!local || remoteWins(remote.updated_at, local.updated_at)) {
      await saveCloudSegmentLocally(db, remote);
    } else {
      segmentsToPush.set(local.id, local);
    }
  }
  for (const local of localSegments) {
    if (!remoteSegments.some((remote) => remote.id === local.id)) segmentsToPush.set(local.id, local);
  }

  if (sessionsToPush.size > 0) {
    const rows = [...sessionsToPush.values()].map((session) => ({ ...session, user_id: userId }));
    const { error } = await supabase.from('reading_sessions').upsert(rows, { onConflict: 'id' });
    throwIfError(error);
  }
  if (segmentsToPush.size > 0) {
    const rows = [...segmentsToPush.values()].flatMap((segment) => segment.ended_at ? [{ ...segment, user_id: userId }] : []);
    if (rows.length > 0) {
      const { error } = await supabase.from('session_segments').upsert(rows, { onConflict: 'id' });
      throwIfError(error);
    }
  }

  return { books: localBooks.length, sessions: localSessions.length };
}
