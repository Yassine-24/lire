begin;

create table if not exists public.user_book_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  book_id uuid not null,
  deleted_at timestamptz not null,
  primary key (user_id, book_id)
);

alter table public.user_book_deletions enable row level security;

revoke all on table public.user_book_deletions from anon, authenticated;
grant select, insert, update, delete on table public.user_book_deletions to authenticated;

drop policy if exists "Readers manage their own book deletions" on public.user_book_deletions;
create policy "Readers manage their own book deletions"
on public.user_book_deletions for all to authenticated
using ((select auth.uid()) is not null and (select auth.uid()) = user_id)
with check ((select auth.uid()) is not null and (select auth.uid()) = user_id);

commit;
