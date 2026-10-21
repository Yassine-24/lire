# Lire product plan

## Product

Lire is a free, open-source reading companion for the browser. Its central job is to make it easy to start a reading timer, keep a useful library, and understand time spent with books.

Lire is private by default and useful without an account. It is not a social network, bookstore, or replacement for an e-reader.

## Product decisions

- **Delivery:** Browser-based app built with Expo and React Native Web. Prioritize responsive browser layouts and hosted web use.
- **Audience and price:** Public web release, free at first release.
- **Core measure:** Reading time. Page progress supplements it; it does not replace it.
- **Account:** Optional. Local use must not require signup.
- **Privacy:** Books and reading history stay in the local database until a reader turns on sync. Catalog queries go to Open Library directly or through Lire's configured server adapter. No analytics, advertising, or public reader profile.
- **License:** MIT.
- **Book entry:** Manual entry, Open Library search, or one-time Goodreads CSV import.
- **Sync:** Optional Supabase account sync for books and completed sessions. Running timers stay local.
- **Data portability:** Local JSON backup and restore remain available with or without an account.

## First-release experience

### Today

- Show today's total in a live circular clock and show the current book and timer controls.
- Start a timer from Today or a book page. Pause, resume, and finish sessions.
- Persist timestamp-based timer segments so closing or refreshing the browser does not stop elapsed-time calculation.
- After a timer has run for more than six hours, ask the reader to confirm the total or correct it before pausing or finishing.

### Library and book page

- Add manually or search a catalog for title, author, ISBN, cover, year, and total pages.
- Use catalog page totals when available while allowing the reader to correct missing or incorrect totals and enter their current page.
- Organize books into Want to read, Reading, Finished, or Paused shelves. Search the library and choose list or tile view.
- Show cover art when available, with a designed fallback for missing covers.
- Track current page, start and finish dates, optional one-to-five rating, and private notes.
- Show reading time and calendar time separately, such as “4 hr 20 min read over 12 days.”
- Show session history and let the reader correct a completed session's total.

### Stats

- Review time by day, week, and month, along with reading days, session count, all-time time, and time by book.
- Split session segments across local calendar-day boundaries, including sessions spanning midnight and daylight-saving changes.
- Keep reading time separate from elapsed calendar days to finish.
- Do not require a goal, streak, or profile setup.

### Profile

- Offer optional sign-in and cloud sync, Goodreads import, JSON backup and restore, privacy information, and local/account data deletion.
- Keep the browser experience useful without profile setup.
- Reading reminders are outside the current browser release.

## Goodreads import

Goodreads is a one-time CSV import, not a live integration. The reader previews parsed books and possible duplicates before import. Matching checks ISBN first, then normalized title and author. The reader may import a duplicate as a separate copy. When present, import shelf status, ISBN, page total, rating, review note, publication year, and start/finish dates. Never invent reading-time sessions from Goodreads data.

## Data and timer model

The local database is the source of truth. Books and sessions have stable IDs. A session contains timestamped segments; pausing closes a segment and resuming starts another. The app allows one unfinished timer per browser installation. Elapsed time is computed from saved timestamps, not a background counter.

The optional Supabase backend keeps catalog metadata separate from each reader's `user_books` and private session history. Row-level security grants personal rows only to their owner. Sync uses `updated_at` with last-write-wins for matching IDs. Account-scoped deletion markers carry book removals across sync. Completed sessions sync; running and paused sessions remain local. Account deletion removes the Auth user and cascades the reader's cloud data.

Open Library lookup is normalized behind a cacheable Edge Function when Supabase is configured. A local direct-API fallback keeps catalog search usable before backend setup. Provider credentials and service-role keys stay server-side.

## Implementation status

The repository includes the browser reading loop, four tabs, four shelves, book covers and page progress, timer recovery/correction, day/week/month stats, Goodreads CSV preview and matching, JSON backup/restore, account/profile controls, Supabase schema/RLS, account and catalog Edge Functions, and optional row sync.

Supabase features require a real project URL/key, the migration and Edge Functions deployed, and validated browser callback/email settings. Browser deployment, authentication callback, and timezone-transition checks remain release work. Reading reminders are not available in the current browser build.

## Building and release phases

### Phase 1 — Foundation (implemented)

Public MIT repository, browser client, dark slate/orange system, local database migrations, navigation, documentation, and local privacy defaults.

### Phase 2 — Reading loop and library (implemented)

Manual and catalog book entry, metadata, four shelves, list/tile presentation, covers, progress editing, timer lifecycle, restore after refresh, and long-session correction.

### Phase 3 — Personal value and resilience (implemented in code; browser validation remains)

Daily/weekly/monthly and per-book stats, local date-boundary aggregation, Goodreads import preview and duplicate handling, JSON backup/restore, accessibility and empty/error states, rating/notes, and local data deletion.

### Phase 4 — Optional cloud foundation (implemented in code; project setup remains)

Supabase email auth, owner-only data tables with RLS, catalog Edge Function, completed-session sync, timestamp conflict handling, and account deletion. Configure and validate against an actual Supabase project before public release.

### Phase 5 — Browser beta and release (remaining)

Validate responsive layouts, route refresh/deep links, timer reopen/correction, offline library use, import/export, account deletion, RLS isolation, and timezone changes. Configure the production domain, privacy disclosures, and support information.

## Release bar

A reader can add or import a book, see its catalog page total and enter their current page, start and correct a timer, close and reopen the browser without losing the session, and see accurate daily and per-book totals. They can keep everything local, export it, or opt into private sync after configuring a backend.

## Deferred

Public profiles, follows, reviews, social feeds, recommendations, reading challenges, barcode scanning, live Goodreads sync, paid plans, widgets, and cross-device active-timer handoff remain out of scope.
