export type CatalogBook = {
  key: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  pageCount: number | null;
  isbn: string | null;
  coverUrl: string | null;
};

type SearchDocument = {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  number_of_pages?: unknown;
  number_of_pages_median?: unknown;
  isbn?: unknown;
  cover_i?: unknown;
};

const searchCache = new Map<string, CatalogBook[]>();
let lastRequestAt = 0;
let requestQueue: Promise<void> = Promise.resolve();

async function waitForCatalogRequestSlot(): Promise<() => void> {
  let release = () => {};
  const previous = requestQueue;
  requestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  const waitMs = Math.max(0, 1000 - (Date.now() - lastRequestAt));
  if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
  return release;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function searchCatalog(query: string): Promise<CatalogBook[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) throw new Error('Enter at least two characters to search the catalog.');
  const cacheKey = trimmed.toLocaleLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ q: trimmed, limit: '20' });

  const releaseRequestSlot = await waitForCatalogRequestSlot();
  try {
    const cachedAfterWait = searchCache.get(cacheKey);
    if (cachedAfterWait) return cachedAfterWait;
    let response: Response;
    try {
      const baseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
      const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
      if (baseUrl && publicKey) {
        response = await fetch(`${baseUrl}/functions/v1/catalog-search?${params.toString()}`, {
          headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` },
        });
      } else {
        // Offline-first development and self-hosted builds can search directly.
        // Configured builds use the edge adapter to keep provider traffic behind
        // a cacheable server boundary.
        params.set('fields', 'key,title,author_name,first_publish_year,number_of_pages,number_of_pages_median,isbn,cover_i');
        response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
      }
    } catch {
      throw new Error('The book catalog could not be reached. Check your internet connection and try again.');
    }
    if (!response.ok) throw new Error('The book catalog is temporarily unavailable. Try again in a moment.');

    const payload: unknown = await response.json();
    if (!isRecord(payload)) return [];
    if (Array.isArray(payload.books)) {
      const books = payload.books.flatMap((value): CatalogBook[] => {
        if (!isRecord(value) || typeof value.key !== 'string' || typeof value.title !== 'string') return [];
        return [{
          key: value.key,
          title: value.title,
          author: typeof value.author === 'string' ? value.author : null,
          firstPublishYear: typeof value.firstPublishYear === 'number' && Number.isInteger(value.firstPublishYear)
            ? value.firstPublishYear
            : null,
          pageCount: typeof value.pageCount === 'number' && Number.isSafeInteger(value.pageCount) && value.pageCount > 0
            ? value.pageCount
            : null,
          isbn: typeof value.isbn === 'string' ? value.isbn : null,
          coverUrl: typeof value.coverUrl === 'string' ? value.coverUrl : null,
        }];
      });
      searchCache.set(cacheKey, books);
      return books;
    }
    if (!Array.isArray(payload.docs)) return [];

    const documents = payload.docs as SearchDocument[];
    const books = documents.flatMap((document) => {
      if (!isRecord(document) || typeof document.key !== 'string' || typeof document.title !== 'string') {
        return [];
      }
      const authors = Array.isArray(document.author_name)
        ? document.author_name.filter((author): author is string => typeof author === 'string')
        : [];
      const isbnValues = Array.isArray(document.isbn)
        ? document.isbn.filter((value): value is string => typeof value === 'string')
        : [];
      const isbn = isbnValues.find((value) => value.replace(/[^0-9Xx]/g, '').length === 13)
        ?? isbnValues.find((value) => value.replace(/[^0-9Xx]/g, '').length === 10)
        ?? null;
      const coverUrl = typeof document.cover_i === 'number' && Number.isSafeInteger(document.cover_i)
        ? `https://covers.openlibrary.org/b/id/${document.cover_i}-M.jpg`
        : isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false` : null;
      return [{
        key: document.key,
        title: document.title,
        author: authors.length > 0 ? authors.join(', ') : null,
        firstPublishYear:
          typeof document.first_publish_year === 'number' && Number.isInteger(document.first_publish_year)
            ? document.first_publish_year
            : null,
        pageCount: [document.number_of_pages, document.number_of_pages_median].find(
          (value): value is number =>
            typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
        ) ?? null,
        isbn,
        coverUrl,
      }];
    });
    if (searchCache.size >= 50) {
      const oldestKey = searchCache.keys().next().value;
      if (oldestKey) searchCache.delete(oldestKey);
    }
    searchCache.set(cacheKey, books);
    return books;
  } finally {
    releaseRequestSlot();
  }
}
