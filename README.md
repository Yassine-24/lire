# Lire

Lire is a free, open-source reading tracker for the web. It helps readers keep a personal library, record reading sessions, and understand how they spend time with books.

The current release is the browser experience. The library, timer, and stats work without an account. Optional cloud sync requires a configured Supabase project. Lire has no social feed, ads, or analytics.

## Current features

- Today screen with a live circular reading clock, active timer controls, and long-session correction.
- Library search with list or tile view, Open Library covers and page counts, manual entry, ISBN, and four shelves.
- Book progress, start and finish dates, reading time, private notes, ratings, and editable session history.
- Daily, weekly, and monthly stats, including time by book, total sessions, and reading days.
- Goodreads CSV preview with ISBN-first duplicate matching, optional separate-copy import, ratings, notes, dates, page counts, and shelves.
- Local JSON backup and restore, plus local and account data deletion controls.
- Optional Supabase email sign-in and sync for books and completed sessions. Running and paused sessions stay local.

Reading reminders are not available in the current browser build. Catalog search sends the query to Open Library, directly when no backend is configured and through the included cached Edge Function when configured. Covers are loaded from Open Library.

## Run locally

The browser client is in `apps/mobile`:

```sh
cd apps/mobile
npm ci
npm run web
```

## Build for hosting

```sh
npm run build:web
```

This exports the site to `apps/mobile/dist`. For Netlify, use:

- Base directory: `apps/mobile`
- Build command: `npm run build:web`
- Publish directory: `dist`

The project uses single-page routing. The `public/_redirects` file sends browser routes back to the app entry point so paths such as `/book/123` also work when opened directly or refreshed.

## Optional Supabase setup

Without Supabase settings, Lire remains usable locally. To enable cloud accounts, sync, and the server-side catalog adapter:

1. Create a Supabase project and copy `apps/mobile/.env.example` to `apps/mobile/.env`.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the public publishable/anon key). Never place a service-role key in the client.
3. Link the Supabase CLI project, apply `supabase/migrations/20261021000000_lire_cloud.sql`, then deploy `catalog-search` and `delete-account` from `supabase/functions/`.
4. Configure Supabase email delivery and the hosted browser callback before enabling email sign-in on a deployed site. Callback configuration still needs production validation.
5. Restart the development server after changing the environment file.

The SQL migration separates public catalog metadata from private `user_books`, `reading_sessions`, and `session_segments`, enables row-level security, and grants access only to the account owner. The delete-account Edge Function uses the server-side service role to delete the Auth user; keep that key in Supabase function secrets only. Sync merges rows by `updated_at` (last write wins). Account-scoped deletion markers keep removed books from returning after sync. Active timers are excluded.

## Project docs

- [Product plan and implementation phases](docs/product-plan.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
