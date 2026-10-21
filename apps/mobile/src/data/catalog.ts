export type CatalogBook = {
  key: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  pageCount: number | null;
};

type SearchDocument = {
  key?: unknown;
  title?: unknown;
  author_name?: unknown;
  first_publish_year?: unknown;
  number_of_pages?: unknown;
  number_of_pages_median?: unknown;
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

  const params = new URLSearchParams({
    q: trimmed,
    fields: 'key,title,author_name,first_publish_year,number_of_pages,number_of_pages_median',
    limit: '20',
  });

  const releaseRequestSlot = await waitForCatalogRequestSlot();
  try {
    const cachedAfterWait = searchCache.get(cacheKey);
    if (cachedAfterWait) return cachedAfterWait;
    let response: Response;
    try {
      response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`);
    } catch {
      throw new Error('The book catalog could not be reached. Check your internet connection and try again.');
    }
    if (!response.ok) throw new Error('The book catalog is temporarily unavailable. Try again in a moment.');

    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.docs)) return [];

    const books = (payload.docs as SearchDocument[]).flatMap((document) => {
      if (!isRecord(document) || typeof document.key !== 'string' || typeof document.title !== 'string') {
        return [];
      }
      const authors = Array.isArray(document.author_name)
        ? document.author_name.filter((author): author is string => typeof author === 'string')
        : [];
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
