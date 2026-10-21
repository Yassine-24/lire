# Lire

Lire is a free, open-source reading tracker. Keep a personal library, record reading sessions, and see how you spend time with books.

The current product is a Django web app. An account is required; books, notes, progress, and reading history are stored on the server and scoped to the signed-in reader. Lire has no social feed, ads, or analytics.

## What is in the current build

- A Today page with a live circular clock for today’s reading time, one active session, and visible start, pause, resume, and finish controls.
- A private library with search, list or tile view, four shelves, Open Library lookup, cover art, and page totals.
- Book details with editable page progress, dates, private notes, ratings, per-book reading time, and session history. Reaching the last page marks the book finished automatically.
- Daily, weekly, and monthly reading summaries, a 14-day chart, and time by book.
- Goodreads CSV preview and import, with ISBN-first duplicate checks and an option to import another copy.
- JSON backup and restore. Restore accepts Lire backup versions 1–3, including backups from the earlier browser build.
- Account editing and deletion, plus ownership checks on reader data.
- Dark gray and deep orange responsive styling.

Open Library provides catalog metadata and cover images. Its page-count value is a catalog estimate; check it before saving. Lire does not invent reading-time sessions during Goodreads import.

## Run locally

Requires Python 3.13 or newer.

~~~sh
cd apps/web
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
~~~

Open <http://127.0.0.1:8000>. If your books are still in the earlier browser release, export its Lire JSON backup first and restore it here after creating an account. Local development uses SQLite. To create an admin user for the local Django admin, run python manage.py createsuperuser.

Set DJANGO_DEBUG=true, DJANGO_SECRET_KEY, and DJANGO_ALLOWED_HOSTS in your shell if you want to override the local defaults. The example deployment values are in apps/web/.env.example; Django does not load that file automatically.

## Deploy on Render

The repository includes a Render Blueprint in render.yaml. It defines a Python web service and a persistent PostgreSQL database. The service uses:

- Root directory: apps/web
- Build command: pip install -r requirements.txt && python manage.py collectstatic --no-input
- Pre-deploy command: python manage.py migrate
- Start command: python -m gunicorn lire_site.wsgi:application --bind 0.0.0.0:$PORT

The Blueprint selects paid Render compute for both the web service and database. Review the plan and current pricing in Render before applying it; no Render resources have been created by this repository change. Render’s free PostgreSQL databases expire after 30 days and do not include managed backups, so they are unsuitable for storing readers’ long-term libraries. See [Render’s free service limits](https://render.com/docs/free) and [Postgres recovery and backups](https://render.com/docs/postgresql-backups).

After deployment, add lirebooks.com and www.lirebooks.com as custom domains in Render and set the DNS records Render provides. The Blueprint already allows those host names. Confirm HTTPS, account creation, email/password sign-in, data isolation, imports, backups, and timer behavior before inviting readers.

## Data and privacy

- Each book, session, segment, and import draft belongs to one Django account. App queries always scope private data to the signed-in owner.
- Production requires DATABASE_URL and DJANGO_SECRET_KEY; the app refuses to start without them. Do not commit secrets.
- Django’s CSRF protection, password hashing, HTTPS redirects, secure cookies, and static-file middleware are configured for deployment.
- The browser’s IANA timezone is used to split reading time across local calendar days.
- Catalog searches are sent from the Lire server to Open Library. Cover images load from Open Library with a same-origin referrer policy.
- Account deletion cascades to that reader’s books and reading history. A JSON backup can be downloaded first.

Account email verification, password recovery, and login-attempt throttling are not implemented yet. Add and validate those before treating the account system as a public production service.

## Project docs

- [Product plan and building phases](docs/product-plan.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT. See LICENSE.
