import csv
import io
import re
from datetime import date, datetime, time, timedelta
from typing import Any

from django.utils import timezone

from .models import ReadingSession, ReadingSegment


def segment_seconds(segment: ReadingSegment, now=None) -> int:
    now = now or timezone.now()
    end = segment.ended_at or now
    if end <= segment.started_at:
        return 0
    return int((end - segment.started_at).total_seconds())


def session_seconds(session: ReadingSession, now=None) -> int:
    now = now or timezone.now()
    return sum(segment_seconds(segment, now) for segment in session.segments.all())


def format_duration(seconds: int) -> str:
    minutes = max(0, int(seconds)) // 60
    hours, remainder = divmod(minutes, 60)
    if hours:
        return f"{hours} hr {remainder} min"
    return f"{minutes} min"


def local_midnight(day: date):
    return timezone.make_aware(datetime.combine(day, time.min), timezone.get_current_timezone())


def segment_seconds_on_day(segment: ReadingSegment, day: date, now=None) -> int:
    now = now or timezone.now()
    start = max(segment.started_at, local_midnight(day))
    end = min(segment.ended_at or now, local_midnight(day + timedelta(days=1)))
    if end <= start:
        return 0
    return int((end - start).total_seconds())


def parse_goodreads_date(value: str):
    value = (value or "").strip()
    if not value:
        return None
    for fmt in ("%Y/%m/%d", "%Y-%m-%d", "%m/%d/%Y", "%m-%d-%Y"):
        try:
            parsed = datetime.strptime(value, fmt).date()
            return timezone.make_aware(
                datetime.combine(parsed, time(hour=12)),
                timezone.get_current_timezone(),
            )
        except ValueError:
            continue
    return None


def normalize_isbn(value: str | None) -> str:
    normalized = re.sub(r"[^0-9Xx]", "", value or "").upper()
    return normalized if len(normalized) in (10, 13) else ""


def normalize_identity(title: str, author: str | None) -> tuple[str, str]:
    normalize = lambda text: " ".join((text or "").casefold().split())
    return normalize(title), normalize(author or "")


def _csv_cell(row: dict[str, str], *names: str) -> str:
    for name in names:
        value = row.get(name)
        if value is not None:
            return value.strip()
    return ""


def _integer(value: str, *, minimum: int, maximum: int | None = None):
    try:
        parsed = int(value.strip())
    except (TypeError, ValueError):
        return None
    if parsed < minimum or (maximum is not None and parsed > maximum):
        return None
    return parsed


def parse_goodreads_csv(contents: bytes) -> tuple[list[dict[str, Any]], int]:
    if len(contents) > 5 * 1024 * 1024:
        raise ValueError("This Goodreads export is larger than Lire can import.")
    try:
        text = contents.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise ValueError("Lire could not read this file as UTF-8. Export the CSV again from Goodreads.") from exc

    reader = csv.DictReader(io.StringIO(text, newline=""))
    if not reader.fieldnames:
        raise ValueError("This CSV does not contain a header row.")
    headers = {header.lstrip("\ufeff").strip().casefold() for header in reader.fieldnames}
    if "title" not in headers:
        raise ValueError("This does not look like a Goodreads library export. The Title column is missing.")

    current_isbns = set()
    existing_identities = set()
    parsed: list[dict[str, Any]] = []
    skipped = 0

    for row_number, raw_row in enumerate(reader, start=2):
        row = {
            (key or "").lstrip("\ufeff").strip().casefold(): value or ""
            for key, value in raw_row.items()
        }
        title = _csv_cell(row, "title")
        if not title:
            skipped += 1
            continue
        if len(parsed) >= 5000:
            raise ValueError("This import has more than 5,000 books. Split the export into smaller files.")

        author = _csv_cell(row, "author")[:240]
        finished_at = parse_goodreads_date(_csv_cell(row, "date read", "date finished"))
        started_at = parse_goodreads_date(_csv_cell(row, "date started"))
        shelf = _csv_cell(row, "exclusive shelf").casefold().replace("_", "-").replace(" ", "-")
        shelves = _csv_cell(row, "bookshelves").casefold()
        if shelf in ("currently-reading", "reading"):
            status = "reading"
        elif shelf in ("paused", "on-hold", "currently-paused"):
            status = "paused"
        elif shelf in ("read", "finished") or finished_at:
            status = "finished"
        elif any(name in shelves for name in ("currently-reading", "reading")):
            status = "reading"
        elif any(name in shelves for name in ("paused", "on-hold")):
            status = "paused"
        else:
            status = "want_to_read"

        isbn = normalize_isbn(_csv_cell(row, "isbn13", "isbn"))
        page_count = _integer(_csv_cell(row, "number of pages", "pages"), minimum=1, maximum=2_147_483_647)
        rating = _integer(_csv_cell(row, "my rating", "rating"), minimum=1, maximum=5)
        year = _integer(_csv_cell(row, "original publication year"), minimum=1000, maximum=9999)
        identity = normalize_identity(title, author)
        duplicate = "isbn" if isbn and isbn in current_isbns else ""
        if not duplicate and identity in existing_identities:
            duplicate = "title-author"
        if not duplicate and (isbn in current_isbns if isbn else False):
            duplicate = "same-file"

        # Keep the first copy's identity so later rows from this export are identified.
        if isbn:
            current_isbns.add(isbn)
        if identity != ("", ""):
            existing_identities.add(identity)

        parsed.append({
            "row": row_number,
            "title": title[:240],
            "author": author,
            "status": status,
            "isbn": isbn,
            "page_count": page_count,
            "current_page": page_count if status == "finished" and page_count else 0,
            "rating": rating,
            "notes": _csv_cell(row, "my review", "review")[:10000],
            "published_year": year,
            "started_at": started_at.isoformat() if started_at else None,
            "finished_at": finished_at.isoformat() if finished_at else None,
            "duplicate_match": duplicate,
        })
    return parsed, skipped


def split_segment_by_day(segment: ReadingSegment, now=None) -> list[tuple[date, int]]:
    now = now or timezone.now()
    end = segment.ended_at or now
    if end <= segment.started_at:
        return []
    local_start = timezone.localtime(segment.started_at).date()
    local_end = timezone.localtime(end - timedelta(microseconds=1)).date()
    results = []
    day = local_start
    while day <= local_end:
        seconds = segment_seconds_on_day(segment, day, now)
        if seconds:
            results.append((day, seconds))
        day += timedelta(days=1)
    return results
