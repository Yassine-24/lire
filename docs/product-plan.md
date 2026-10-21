# Lire product plan

## Product

Lire is a private reading companion for people who want to make time for books and see how that time adds up. The core job is to start a reading timer quickly, keep a useful library, and understand reading habits.

Lire is free and open source under MIT. It is not a social network, bookstore, e-reader, or recommendation feed.

## Product decisions

- **Delivery:** Python-first Django web app with server-rendered pages and small browser enhancements.
- **Accounts:** Required. Every reader has a private account; the server database is the source of truth for their books, sessions, notes, and settings.
- **Database:** SQLite for local development. PostgreSQL for hosted reader data.
- **Core measure:** Reading time. Page progress helps orient the reader; it does not replace time tracking.
- **Privacy:** No public profiles, social feed, ads, or analytics. All reader-data queries are scoped to the signed-in account. Open Library receives catalog search requests from the Lire server and serves the cover images.
- **Book entry:** Manual entry, Open Library lookup, or a one-time Goodreads CSV import.
- **Data portability:** JSON export and restore, plus account deletion.
- **License:** MIT.

## First-release experience

### Today

- Show today’s total in a circular reading clock.
- Put the current timer and start action near the top of the page.
- Start a session from Today or a book page. Pause, resume, and finish sessions.
- Persist timer segments as timestamps so closing or refreshing the browser does not lose elapsed time.
- Permit one unfinished session per reader account.
- After a long timer, allow the reader to pause or finish and correct saved session duration in the book’s history.

### Library and book page

- Add a book manually or search Open Library for title, author, ISBN, cover, publication year, and estimated page total.
- Make the catalog search the first step; let the reader inspect and edit catalog details before saving.
- Set current page and total pages independently. Reaching the last page moves the book to Finished automatically.
- Organize books into Want to read, Reading, Finished, or Paused shelves. Search the library and switch between compact list and tile views.
- Show book covers when available, with a styled fallback for missing artwork.
- Track current page, start and finish dates, optional one-to-five rating, and private notes.
- Show elapsed reading time separately from calendar days.
- Show session history and allow correcting a saved session duration.
- Deleting a book removes its sessions, notes, and progress from that account.

### Stats

- Review time today, this week, and this month, plus a daily chart and time by book.
- Split session segments across the reader’s local calendar-day boundaries, including sessions that cross midnight.
- Keep reading time separate from calendar days to finish.
- Do not require a goal, streak, or profile setup.

### Account and data tools

- Sign up, sign in, edit account details, and delete the account.
- Import a Goodreads CSV with a preview, duplicate checks, and a choice to keep or skip duplicate copies.
- Carry over shelves, ISBN, page total, rating, notes, publication year, and start/finish dates. Never invent reading-time sessions.
- Export and restore versioned Lire JSON backups.
- Restore earlier Lire backup formats so readers can move existing library data into the account-backed app.

## Data and timer model

Books, reading sessions, and timestamped segments are account-owned. A session has running, paused, or completed status. Pausing closes the open segment; resuming creates a new one. A database constraint allows at most one unfinished session per account.

Elapsed time is calculated from segment timestamps rather than a background counter. Day, week, and month summaries use the browser’s IANA timezone. The app stores timezone-aware timestamps.

Production must use persistent PostgreSQL storage. Do not use an ephemeral filesystem or a temporary database for reader libraries. A reader can export a JSON backup and delete their account and data from the profile page.

## Implementation status

The Django source is under apps/web. It includes account registration and sign-in, account-owned book/session models, a responsive Today page, library and book pages, timer actions, Open Library lookup, stats, Goodreads import preview, JSON export/restore, account editing/deletion, static styling, and a Render Blueprint.

This is an initial implementation and has not yet completed its release validation. Account email verification, password recovery, and login-attempt throttling remain unimplemented. No production Render resources have been provisioned.

## Building and release phases

### Phase 1 — Python foundation (implemented in source)

Django project, local SQLite setup, private accounts, owner-scoped models, schema migration, secure production settings, and Render PostgreSQL configuration.

### Phase 2 — Reading loop and library (implemented in source)

Today clock, one active timer, timestamped pause/resume segments, reading shelves, compact list and tile views, catalog search, covers, page progress, notes, ratings, dates, book deletion, and editable session history.

### Phase 3 — Import, backup, and stats (implemented in source)

Daily, weekly, monthly, and per-book totals; browser-local day splits; Goodreads CSV preview and duplicate choices; portable JSON backup and restore from earlier versions; account deletion.

### Phase 4 — Local review and behavior validation (next)

Install the Python dependencies, migrate a clean SQLite database, create an account, and manually walk the full reading loop. Check account isolation with two accounts, page and shelf edits, timer pause/resume/reopen/correction, midnight boundaries, Goodreads duplicate decisions, backup round trips, and account deletion. Review layouts at phone and desktop widths. Complete this review before public release.

### Phase 5 — Production setup (not provisioned)

Review Render’s current service and database pricing before applying the Blueprint. Deploy the Python web service and PostgreSQL database, set the custom domain and DNS records, confirm HTTPS and secure cookies, and run Django’s production deployment checks. Validate reader-data isolation, backups, account deletion, sign-in, and Open Library availability in the deployed environment.

### Phase 6 — Public beta readiness

Add account email verification, password recovery, and login-attempt throttling. Publish a plain-language privacy policy and support contact. Test restore and recovery procedures, and validate that the production database has backups before inviting readers.

## Release bar

A reader can create an account, add or import a book, verify its page total, enter current progress, start and correct a timer, return after closing the browser, and see accurate local-day and per-book totals. Their data stays scoped to their account, can be exported and restored, and can be removed with the account.

## Deferred

Public profiles, follows, reviews, social feeds, recommendations, reading challenges, barcode scanning, live Goodreads sync, paid plans, reminders, widgets, and cross-account sharing remain out of scope.
