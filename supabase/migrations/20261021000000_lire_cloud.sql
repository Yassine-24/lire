-- Shared catalog details are non-personal. A user's shelves, notes, progress,
-- and finished sessions are stored in separate rows protected by RLS.
create table if not exists public.catalog_books (
  id text primary key,
  provider text not null,
  provider_book_id text not null,
  title text not null,
  author text,
  isbn text,
  page_count integer check (page_count is null or page_count > 0),
  cover_url text,
  published_year integer,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_books (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_id text references public.catalog_books(id) on delete set null,
  title text not null,
  author text,
  status text not null check (status in ('reading', 'want_to_read', 'finished', 'paused')),
  page_count integer check (page_count is null or page_count > 0),
  current_page integer not null default 0 check (current_page >= 0),
  check (page_count is null or current_page <= page_count),
  isbn text,
  cover_url text,
  published_year integer,
  started_at timestamptz,
  finished_at timestamptz,
  rating integer check (rating is null or rating between 1 and 5),
  notes text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  unique (id, user_id)
);

create table if not exists public.reading_sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null,
  status text not null default 'completed' check (status = 'completed'),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  updated_at timestamptz not null,
  foreign key (book_id, user_id) references public.user_books(id, user_id) on delete cascade,
  unique (id, user_id)
);

create table if not exists public.session_segments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  updated_at timestamptz not null,
  foreign key (session_id, user_id) references public.reading_sessions(id, user_id) on delete cascade
);

create index if not exists user_books_user_updated_idx on public.user_books(user_id, updated_at desc);
create index if not exists reading_sessions_user_updated_idx on public.reading_sessions(user_id, updated_at desc);
create index if not exists session_segments_user_session_idx on public.session_segments(user_id, session_id);

alter table public.catalog_books enable row level security;
alter table public.user_books enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.session_segments enable row level security;

revoke all on table public.catalog_books from anon, authenticated;
revoke all on table public.user_books from anon, authenticated;
revoke all on table public.reading_sessions from anon, authenticated;
revoke all on table public.session_segments from anon, authenticated;

grant select on table public.catalog_books to anon, authenticated;
grant select, insert, update, delete on table public.user_books to authenticated;
grant select, insert, update, delete on table public.reading_sessions to authenticated;
grant select, insert, update, delete on table public.session_segments to authenticated;

drop policy if exists "Catalog is publicly readable" on public.catalog_books;
create policy "Catalog is publicly readable"
on public.catalog_books for select to anon, authenticated
using (true);

drop policy if exists "Signed-in readers can cache catalog entries" on public.catalog_books;
drop policy if exists "Signed-in readers can refresh catalog entries" on public.catalog_books;

drop policy if exists "Readers manage their own books" on public.user_books;
create policy "Readers manage their own books"
on public.user_books for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Readers manage their own sessions" on public.reading_sessions;
create policy "Readers manage their own sessions"
on public.reading_sessions for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

drop policy if exists "Readers manage their own session segments" on public.session_segments;
create policy "Readers manage their own session segments"
on public.session_segments for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);
