# Lire product plan

## Product

Lire is a free, open-source, mobile-first reading companion for iOS and Android. Its central job is to make it easier to build a reading habit by helping people notice the time they spend with books.

The first release should feel private, quiet, and useful without an account. It is not a social network, a book store, or a replacement for an e-reader.

## Product decisions

- **Platforms:** Installed iOS and Android app, built with Expo and React Native. A small website can later host the privacy policy, project information, and support pages. A PWA is not the primary product.
- **Audience:** Public app, with a private beta before general release.
- **First-release price:** Free.
- **Core measure:** Reading time.
- **Account:** Optional and deferred. Local use should not require signup.
- **Privacy:** The first release stores books and reading history on the device. No analytics or advertising are in scope.
- **License:** MIT.
- **Book entry:** Manual entry first. Goodreads CSV import follows the first release.
- **Sync:** A later milestone may sync library data and completed sessions for signed-in users. A live timer remains on the device where it was started.
- **Data portability:** Add export before or alongside account sync.

## First-release experience

### Today

- See reading time for today.
- Start, pause, resume, and finish a session.
- Recover an in-progress session after closing and reopening the app.
- See the book currently being read and a clear next action.

### Library

- Add a book by title and optionally author.
- Mark a book as Reading, Want to read, or Finished.
- Browse and filter the personal library.
- See accumulated reading time for each book.

### Stats

- Review reading time by day, week, and month.
- Count elapsed time from stored session segments. Split time across local calendar-day boundaries so a session spanning midnight is attributed correctly.
- Do not require a goal or streak to make the feature useful.

## Data and timer model

The app is local-first and uses SQLite. A book is stored independently from its reading sessions. A session may contain multiple timed segments: pausing closes the current segment, and resuming starts another. This makes elapsed time recoverable and allows it to be grouped by local date without relying on a UI timer.

An unfinished session is limited to one per installation. Its running state and start time are persisted; elapsed time is derived from timestamps rather than a counter that stops when the app is backgrounded. The interface should make it easy to pause or finish a session that was left running.

Future sync should use stable IDs, idempotent writes, and an explicit conflict policy. The initial client must not imply that an active timer can move between devices.

## Out of scope for the first release

- Goodreads import
- Public profiles, follows, reviews, or social feeds
- Ratings and journaling
- Paid plans or subscriptions
- Push reminders, widgets, or watch apps
- Book-catalog search or cover-image sourcing
- Cross-device live timer handoff
- Web app or PWA parity

These can be reconsidered after the local reading loop is useful and reliable.

## Building phases

### Phase 1 — Foundation

Set up the public repository, MIT license, Expo project, visual system, SQLite schema, and navigation. Keep decisions documented and easy for contributors to follow.

### Phase 2 — Offline reading loop

Build manual book entry, library browsing, session start/pause/resume/finish, and persistence through app restarts. Verify on iOS and Android simulators.

### Phase 3 — Personal value and resilience

Add day/week/month summaries, per-book reading time, local date-boundary handling, accessibility, empty states, error recovery, and JSON export/import. Validate timezone changes and interrupted sessions.

### Phase 4 — Private beta

Distribute iOS TestFlight and Android internal builds. Observe whether people can create a book, start a session, return later, and understand their stats. Fix data-loss and timer confusion before adding breadth.

### Phase 5 — Sync and release

Only if beta users need it, implement optional sign-in and sync for the library and completed sessions, with row-level access controls and documented conflict behavior. Publish a privacy policy and support page, then prepare store listings and production builds.

## Risks and open decisions

- Timer intent is ambiguous when a session is left running for many hours. The app needs an obvious recovery and correction flow before release.
- Calendar-day aggregation must handle daylight-saving transitions and timezone changes.
- Reading time is useful without goals; goals and streaks may create pressure and should be validated with beta users.
- Sync adds account, security, privacy, and support costs. It should not delay validating the offline app.
- Store distribution needs proper app icons, screenshots, privacy disclosures, and signed builds. These are release work, not prerequisites for building the first local screens.

## First build milestone

A person can add a book, start a session, pause or finish it, close and reopen the app without losing the session, and see their reading time on Today, Library, and Stats — with airplane mode enabled.
