# Contributing to Lire

Thanks for helping make Lire better. Focused issues and small, reviewable pull requests are especially useful.

## Before you start

- Check existing issues and pull requests before starting overlapping work.
- For a substantial feature, open an issue or discussion first so the product scope can be agreed on.
- Keep changes focused on reading, library management, reliability, accessibility, or privacy.
- Do not add analytics, advertising, public reader profiles, or third-party data sharing without an explicit product decision.

## Development

The current product source is in apps/web and uses Django.

~~~sh
cd apps/web
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
~~~

Local development uses SQLite. Hosted reader data must use PostgreSQL. For local administrative access, create a superuser with python manage.py createsuperuser.

## Pull requests

Include a short description of the user-facing change and how you reviewed it. Note any model or migration changes. Never include real personal reading data, credentials, signing keys, environment files, or database backups in a pull request.
