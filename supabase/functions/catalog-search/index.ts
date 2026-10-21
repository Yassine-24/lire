import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=300, s-maxage=900',
  'Content-Type': 'application/json; charset=utf-8',
};

type CatalogBook = {
  key: string;
  title: string;
  author: string | null;
  firstPublishYear: number | null;
  pageCount: number | null;
  isbn: string | null;
  coverUrl: string | null;
};

type CachedResults = { until: number; books: CatalogBook[] };
const cache = new Map<string, CachedResults>();
let requestQueue: Promise<void> = Promise.resolve();
let lastRequestAt = 0;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isbnFrom(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const candidates = value.filter((item): item is string => typeof item === 'string');
  return candidates.find((item) => item.replace(/[^0-9Xx]/g, '').length === 13)
    ?? candidates.find((item) => item.replace(/[^0-9Xx]/g, '').length === 10)
    ?? null;
}

function normalize(documents: unknown[]): CatalogBook[] {
  return documents.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.key !== 'string' || typeof raw.title !== 'string') return [];
    const authors = Array.isArray(raw.author_name)
      ? raw.author_name.filter((author): author is string => typeof author === 'string')
      : [];
    const pageCount = [raw.number_of_pages, raw.number_of_pages_median].find(
      (value): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0,
    ) ?? null;
    const isbn = isbnFrom(raw.isbn);
    const coverUrl = typeof raw.cover_i === 'number' && Number.isSafeInteger(raw.cover_i)
      ? `https://covers.openlibrary.org/b/id/${raw.cover_i}-M.jpg`
      : isbn ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-M.jpg?default=false` : null;
    return [{
      key: raw.key,
      title: raw.title,
      author: authors.length > 0 ? authors.join(', ') : null,
      firstPublishYear: typeof raw.first_publish_year === 'number' && Number.isInteger(raw.first_publish_year)
        ? raw.first_publish_year
        : null,
      pageCount,
      isbn,
      coverUrl,
    }];
  });
}

async function waitForRequestSlot(): Promise<() => void> {
  let release = () => {};
  const previous = requestQueue;
  requestQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  const waitMs = Math.max(0, 1100 - (Date.now() - lastRequestAt));
  if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
  return release;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'GET') return json({ error: 'Use GET to search the book catalog.' }, 405);

  const query = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  if (query.length < 2 || query.length > 120) return json({ error: 'Search with between 2 and 120 characters.' }, 400);
  const cacheKey = query.toLocaleLowerCase();
  const cached = cache.get(cacheKey);
  if (cached && cached.until > Date.now()) return json({ books: cached.books });

  const release = await waitForRequestSlot();
  try {
    const cachedAfterWait = cache.get(cacheKey);
    if (cachedAfterWait && cachedAfterWait.until > Date.now()) return json({ books: cachedAfterWait.books });

    const params = new URLSearchParams({
      q: query,
      limit: '20',
      fields: 'key,title,author_name,first_publish_year,number_of_pages,number_of_pages_median,isbn,cover_i',
    });
    const response = await fetch(`https://openlibrary.org/search.json?${params.toString()}`, {
      headers: { 'User-Agent': 'Lire/0.1 (https://github.com/Yassine-24/lire)' },
    });
    if (!response.ok) return json({ error: 'The book catalog is temporarily unavailable.' }, 502);
    const payload: unknown = await response.json();
    const documents = isRecord(payload) && Array.isArray(payload.docs) ? payload.docs : [];
    const books = normalize(documents);

    if (books.length > 0) {
      const url = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      if (url && serviceKey) {
        const admin = createClient(url, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        const rows = books.map((book) => ({
          id: book.key,
          provider: 'open_library',
          provider_book_id: book.key,
          title: book.title,
          author: book.author,
          isbn: book.isbn,
          page_count: book.pageCount,
          cover_url: book.coverUrl,
          published_year: book.firstPublishYear,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await admin.from('catalog_books').upsert(rows, { onConflict: 'id' });
        if (error) return json({ error: 'Catalog results could not be cached.' }, 500);
      }
    }

    cache.set(cacheKey, { books, until: Date.now() + 15 * 60 * 1000 });
    if (cache.size > 100) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    return json({ books });
  } catch {
    return json({ error: 'The book catalog could not be reached.' }, 502);
  } finally {
    release();
  }
});
