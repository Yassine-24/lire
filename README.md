# Lire

A personal reading tracker for your library, reading progress, and time spent reading.

**Try it:** [lirebooks.netlify.app](https://lirebooks.netlify.app)

The Python app lives in `apps/web` and is built with Django.

## Features

- Book library with search, covers, page tracking, and Goodreads CSV import
- Reading timer, automatic completion at the last page, and reading stats
- Private accounts and JSON backup

## Run locally

Requires Python 3.13 or newer. From the repository root:

```sh
cd apps/web
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

Open <http://127.0.0.1:8000>. Local development uses SQLite.

## License

MIT. See [LICENSE](LICENSE).
