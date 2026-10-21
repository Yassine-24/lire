# Lire

Lire is a free, open-source reading companion. It helps readers keep a personal library, track sessions, and see the time they spend with books.

The app is local-first: creating an account is optional, and the timer always runs on the device where it was started. The mobile app is the product; a small website can later host project, privacy, and support pages.

## Current build

- Today screen with a live circular reading clock and long-session correction.
- Library search with list or tile view, Open Library covers and page counts, manual entry, ISBN, and four shelves.
- Book progress, start/finish dates, reading time, private notes, ratings, and editable session history.
- Daily, weekly, and monthly stats, including time by book, total sessions, and reading days.
- Goodreads CSV preview with ISBN-first duplicate matching, optional separate-copy import, ratings, notes, dates, page counts, and shelves.
- Local JSON backup and restore, daily on-device reminders, and data deletion controls.
- Optional Supabase email sign-in and sync for books and completed sessions. Running and paused sessions stay local.

Lire has no social feed, ads, or analytics. Catalog search sends the query to Open Library, directly when no backend is configured and through the included cached Edge Function when configured. Covers are loaded from Open Library.

## Get started

The Expo app lives in `apps/mobile`. Use Node.js and npm:

```sh
cd apps/mobile
npm install
npx expo start
```

Open the project in an iOS Simulator or Android emulator. Validate scheduled reminders in iOS and Android development builds before release. See the [Expo EAS documentation](https://docs.expo.dev/eas/) for signed device and store builds.

## Optional Supabase setup

Without Supabase settings, Lire remains usable offline. To enable accounts, cloud sync, and the server-side catalog adapter:

1. Create a Supabase project and copy `apps/mobile/.env.example` to `apps/mobile/.env`.
2. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` (the public publishable/anon key). Never place a service-role key in the app.
3. Link the Supabase CLI project, apply `supabase/migrations/20261021000000_lire_cloud.sql`, then deploy `catalog-search` and `delete-account` from `supabase/functions/`.
4. Add `lire://auth/callback` to the Supabase Auth redirect URL allow list and configure email delivery for confirmation and password reset.
5. Restart Expo after changing the environment file.

The SQL migration separates public catalog metadata from private `user_books`, `reading_sessions`, and `session_segments`, enables row-level security, and grants access only to the account owner. The delete-account Edge Function uses the server-side service role to delete the Auth user; keep that key in Supabase function secrets only. Sync merges rows by `updated_at` (last write wins). Account-scoped deletion markers keep removed books from returning on another device. Active timers are excluded, so they are not handed between devices.

## Project docs

- [Product plan and implementation phases](docs/product-plan.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See [LICENSE](LICENSE).
