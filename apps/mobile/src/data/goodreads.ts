import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { withAppTransaction } from '@/data/transactions';
import type { BookStatus } from '@/data/books';

export const maxGoodreadsCsvBytes = 10 * 1024 * 1024;
const maxGoodreadsRows = 20_000;

export type GoodreadsBook = {
  title: string;
  author: string | null;
  status: BookStatus;
};

export type GoodreadsImportPreview = {
  books: GoodreadsBook[];
  duplicateCount: number;
  skippedCount: number;
  totalRows: number;
};

export type GoodreadsImportResult = {
  added: number;
  duplicateCount: number;
};

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (inQuotes) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && csv[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
      if (rows.length > maxGoodreadsRows + 1) {
        throw new Error('This Goodreads export has too many rows to import at once.');
      }
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error('This Goodreads CSV has an unfinished quoted field. Download a fresh export and try again.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
  }
  if (rows.length > maxGoodreadsRows + 1) {
    throw new Error('This Goodreads export has too many rows to import at once.');
  }
  return rows;
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) {
      byteLength += 1;
    } else if (code <= 0x7ff) {
      byteLength += 2;
    } else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const nextCode = value.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else {
        byteLength += 3;
      }
    } else {
      byteLength += 3;
    }
  }
  return byteLength;
}

function normalizedHeader(value: string): string {
  return value.replace(/^\uFEFF/, '').trim().toLocaleLowerCase();
}

function normalizedIdentityPart(value: string | null): string {
  return (value ?? '').normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
}

function identity(book: Pick<GoodreadsBook, 'title' | 'author'>): string {
  return `${normalizedIdentityPart(book.title)}\u0000${normalizedIdentityPart(book.author)}`;
}

function shelfStatus(value: string): BookStatus {
  const shelf = value.trim().toLocaleLowerCase().replace(/[\s_]+/g, '-');
  if (shelf === 'currently-reading' || shelf === 'reading') return 'reading';
  if (shelf === 'read' || shelf === 'finished') return 'finished';
  return 'want_to_read';
}

function parseGoodreadsCsv(csv: string): { books: GoodreadsBook[]; skippedCount: number; totalRows: number } {
  if (utf8ByteLength(csv) > maxGoodreadsCsvBytes) {
    throw new Error('This Goodreads export is larger than Lire can safely import.');
  }
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error('This CSV does not contain any books.');

  const headers = rows[0].map(normalizedHeader);
  const titleIndex = headers.indexOf('title');
  const authorIndex = headers.indexOf('author');
  const shelfIndex = headers.indexOf('exclusive shelf');
  const bookshelvesIndex = headers.indexOf('bookshelves');
  if (titleIndex < 0) throw new Error('This does not look like a Goodreads library export. The Title column is missing.');

  const books: GoodreadsBook[] = [];
  let skippedCount = 0;
  for (const row of rows.slice(1)) {
    const title = (row[titleIndex] ?? '').trim();
    if (!title) {
      skippedCount += 1;
      continue;
    }
    const author = authorIndex >= 0 ? (row[authorIndex] ?? '').trim() || null : null;
    const exclusiveShelf = shelfIndex >= 0 ? (row[shelfIndex] ?? '').trim() : '';
    const shelves = bookshelvesIndex >= 0 ? (row[bookshelvesIndex] ?? '') : '';
    const fallbackShelf = shelves
      .split(/[,;|]/)
      .map((value) => value.trim())
      .find((value) => ['currently-reading', 'currently_reading', 'reading', 'read', 'finished'].includes(value.toLocaleLowerCase()));
    const shelf = exclusiveShelf || fallbackShelf || '';
    books.push({ title, author, status: shelfStatus(shelf) });
  }

  return { books, skippedCount, totalRows: rows.length - 1 };
}

export async function previewGoodreadsImport(
  db: SQLiteDatabase,
  csv: string,
): Promise<GoodreadsImportPreview> {
  const parsed = parseGoodreadsCsv(csv);
  const currentBooks = await db.getAllAsync<{ title: string; author: string | null }>(
    'SELECT title, author FROM books',
  );
  const seen = new Set(currentBooks.map(identity));
  const books: GoodreadsBook[] = [];
  let duplicateCount = 0;
  for (const book of parsed.books) {
    const key = identity(book);
    if (seen.has(key)) {
      duplicateCount += 1;
    } else {
      seen.add(key);
      books.push(book);
    }
  }
  return { books, duplicateCount, skippedCount: parsed.skippedCount, totalRows: parsed.totalRows };
}

export async function importGoodreadsBooks(
  db: SQLiteDatabase,
  books: GoodreadsBook[],
): Promise<GoodreadsImportResult> {
  let added = 0;
  let duplicateCount = 0;
  await withAppTransaction(db, async (transaction) => {
    const currentBooks = await transaction.getAllAsync<{ title: string; author: string | null }>(
      'SELECT title, author FROM books',
    );
    const seen = new Set(currentBooks.map(identity));
    for (const book of books) {
      const key = identity(book);
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      const id = Crypto.randomUUID();
      const now = new Date().toISOString();
      await transaction.runAsync(
        'INSERT INTO books (id, title, author, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        id,
        book.title,
        book.author,
        book.status,
        now,
        now,
      );
      added += 1;
    }
  });
  return { added, duplicateCount };
}
