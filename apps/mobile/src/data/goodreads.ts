import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { withAppTransaction } from '@/data/transactions';
import type { BookStatus } from '@/data/books';
import { coverFromIsbn } from '@/components/BookCover';

export const maxGoodreadsCsvBytes = 10 * 1024 * 1024;
const maxGoodreadsRows = 20_000;

export type GoodreadsBook = {
  sourceKey: string;
  title: string;
  author: string | null;
  status: BookStatus;
  isbn: string | null;
  pageCount: number | null;
  rating: number | null;
  notes: string | null;
  publishedYear: number | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type GoodreadsDuplicate = GoodreadsBook & {
  duplicateMatch: 'isbn' | 'title-author' | 'same-file';
};

export type GoodreadsImportPreview = {
  books: GoodreadsBook[];
  duplicates: GoodreadsDuplicate[];
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
      if (rows.length > maxGoodreadsRows + 1) throw new Error('This Goodreads export has too many rows to import at once.');
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error('This Goodreads CSV has an unfinished quoted field. Download a fresh export and try again.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.trim().length > 0)) rows.push(row);
  }
  if (rows.length > maxGoodreadsRows + 1) throw new Error('This Goodreads export has too many rows to import at once.');
  return rows;
}

function utf8ByteLength(value: string): number {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) byteLength += 1;
    else if (code <= 0x7ff) byteLength += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const nextCode = value.charCodeAt(index + 1);
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else byteLength += 3;
    } else byteLength += 3;
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

function normalizedIsbn(value: string | null): string | null {
  const normalized = value?.replace(/[^0-9Xx]/g, '').toLocaleUpperCase();
  return normalized && (normalized.length === 10 || normalized.length === 13) ? normalized : null;
}

function shelfStatus(value: string, finishedAt: string | null): BookStatus {
  const shelf = value.trim().toLocaleLowerCase().replace(/[\s_]+/g, '-');
  if (shelf === 'currently-reading' || shelf === 'reading') return 'reading';
  if (shelf === 'paused' || shelf === 'on-hold' || shelf === 'currently-paused') return 'paused';
  if (shelf === 'read' || shelf === 'finished') return 'finished';
  if (finishedAt) return 'finished';
  return 'want_to_read';
}

function parseExportDate(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let year: number;
  let month: number;
  let day: number;
  const parts = trimmed.split(/[/-]/).map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part))) return null;
  if (String(parts[0]).length === 4) [year, month, day] = parts;
  else if (String(parts[2]).length === 4) [month, day, year] = parts;
  else return null;
  const date = new Date(year, month - 1, day, 12, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.toISOString();
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseRating(value: string): number | null {
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

function parseGoodreadsCsv(csv: string): { books: GoodreadsBook[]; skippedCount: number; totalRows: number } {
  if (utf8ByteLength(csv) > maxGoodreadsCsvBytes) throw new Error('This Goodreads export is larger than Lire can safely import.');
  const rows = parseCsvRows(csv);
  if (rows.length < 2) throw new Error('This CSV does not contain any books.');

  const headers = rows[0].map(normalizedHeader);
  const column = (...names: string[]) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const titleIndex = column('title');
  const authorIndex = column('author');
  const shelfIndex = column('exclusive shelf');
  const bookshelvesIndex = column('bookshelves');
  const isbnIndex = column('isbn13', 'isbn');
  const pageIndex = column('number of pages', 'pages');
  const ratingIndex = column('my rating', 'rating');
  const startedIndex = column('date started');
  const finishedIndex = column('date read', 'date finished');
  const reviewIndex = column('my review', 'review');
  const yearIndex = column('original publication year');
  if (titleIndex < 0) throw new Error('This does not look like a Goodreads library export. The Title column is missing.');

  const books: GoodreadsBook[] = [];
  let skippedCount = 0;
  for (const [rowOffset, row] of rows.slice(1).entries()) {
    const title = (row[titleIndex] ?? '').trim();
    if (!title) {
      skippedCount += 1;
      continue;
    }
    const author = authorIndex >= 0 ? (row[authorIndex] ?? '').trim() || null : null;
    const finishedAt = finishedIndex >= 0 ? parseExportDate(row[finishedIndex] ?? '') : null;
    const exclusiveShelf = shelfIndex >= 0 ? (row[shelfIndex] ?? '').trim() : '';
    const shelves = bookshelvesIndex >= 0 ? row[bookshelvesIndex] ?? '' : '';
    const fallbackShelf = shelves.split(/[,;|]/).map((value) => value.trim()).find((value) =>
      ['currently-reading', 'currently_reading', 'reading', 'paused', 'on-hold', 'read', 'finished'].includes(value.toLocaleLowerCase()),
    );
    const isbn = normalizedIsbn(isbnIndex >= 0 ? row[isbnIndex] ?? '' : null);
    const rawYear = yearIndex >= 0 ? Number((row[yearIndex] ?? '').trim()) : NaN;
    books.push({
      sourceKey: `row-${rowOffset + 2}-${identity({ title, author })}`,
      title,
      author,
      status: shelfStatus(exclusiveShelf || fallbackShelf || '', finishedAt),
      isbn,
      pageCount: pageIndex >= 0 ? parseInteger(row[pageIndex] ?? '') : null,
      rating: ratingIndex >= 0 ? parseRating(row[ratingIndex] ?? '') : null,
      notes: reviewIndex >= 0 ? (row[reviewIndex] ?? '').trim() || null : null,
      publishedYear: Number.isInteger(rawYear) && rawYear >= 1000 && rawYear <= 9999 ? rawYear : null,
      startedAt: startedIndex >= 0 ? parseExportDate(row[startedIndex] ?? '') : null,
      finishedAt,
    });
  }
  return { books, skippedCount, totalRows: rows.length - 1 };
}

function matchDuplicate(
  book: GoodreadsBook,
  isbns: Set<string>,
  identities: Set<string>,
): GoodreadsDuplicate['duplicateMatch'] | null {
  const isbn = normalizedIsbn(book.isbn);
  if (isbn && isbns.has(isbn)) return 'isbn';
  if (identities.has(identity(book))) return 'title-author';
  return null;
}

export async function previewGoodreadsImport(
  db: SQLiteDatabase,
  csv: string,
): Promise<GoodreadsImportPreview> {
  const parsed = parseGoodreadsCsv(csv);
  const currentBooks = await db.getAllAsync<{ title: string; author: string | null; isbn: string | null }>(
    'SELECT title, author, isbn FROM books',
  );
  const existingIsbns = new Set(currentBooks.map((book) => normalizedIsbn(book.isbn)).filter((value): value is string => Boolean(value)));
  const existingIdentities = new Set(currentBooks.map(identity));
  const seenIsbns = new Set(existingIsbns);
  const seenIdentities = new Set(existingIdentities);
  const books: GoodreadsBook[] = [];
  const duplicates: GoodreadsDuplicate[] = [];

  for (const book of parsed.books) {
    const duplicateMatch = matchDuplicate(book, seenIsbns, seenIdentities);
    if (duplicateMatch) duplicates.push({ ...book, duplicateMatch: existingIsbns.has(normalizedIsbn(book.isbn) ?? '') || existingIdentities.has(identity(book)) ? duplicateMatch : 'same-file' });
    else books.push(book);
    const isbn = normalizedIsbn(book.isbn);
    if (isbn) seenIsbns.add(isbn);
    seenIdentities.add(identity(book));
  }

  return {
    books,
    duplicates,
    duplicateCount: duplicates.length,
    skippedCount: parsed.skippedCount,
    totalRows: parsed.totalRows,
  };
}

export async function importGoodreadsBooks(
  db: SQLiteDatabase,
  books: GoodreadsBook[],
  addAsCopies: string[] = [],
): Promise<GoodreadsImportResult> {
  let added = 0;
  let duplicateCount = 0;
  const selectedDuplicateKeys = new Set(addAsCopies);
  await withAppTransaction(db, async (transaction) => {
    const currentBooks = await transaction.getAllAsync<{ title: string; author: string | null; isbn: string | null }>(
      'SELECT title, author, isbn FROM books',
    );
    const seenIsbns = new Set(currentBooks.map((book) => normalizedIsbn(book.isbn)).filter((value): value is string => Boolean(value)));
    const seenIdentities = new Set(currentBooks.map(identity));

    for (const book of books) {
      const duplicate = matchDuplicate(book, seenIsbns, seenIdentities);
      const addCopy = selectedDuplicateKeys.has(book.sourceKey);
      if (duplicate && !addCopy) {
        duplicateCount += 1;
        continue;
      }
      const id = Crypto.randomUUID();
      const now = new Date().toISOString();
      await transaction.runAsync(
        'INSERT INTO books (id, title, author, status, page_count, current_page, isbn, cover_url, published_year, started_at, finished_at, rating, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        id,
        book.title.trim(),
        book.author,
        book.status,
        book.pageCount,
        book.status === 'finished' && book.pageCount !== null ? book.pageCount : 0,
        book.isbn,
        coverFromIsbn(book.isbn),
        book.publishedYear,
        book.startedAt,
        book.finishedAt,
        book.rating,
        book.notes,
        now,
        now,
      );
      added += 1;
      const isbn = normalizedIsbn(book.isbn);
      if (isbn) seenIsbns.add(isbn);
      seenIdentities.add(identity(book));
    }
  });
  return { added, duplicateCount };
}
