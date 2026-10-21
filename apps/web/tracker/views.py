import json
import uuid
from collections import defaultdict
from datetime import date, timedelta
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.views.decorators.http import require_GET, require_POST, require_http_methods

from .forms import (
    AccountDeleteForm,
    BackupRestoreForm,
    BookForm,
    GoodreadsUploadForm,
    ProfileForm,
    ProgressForm,
    RegisterForm,
    SessionCorrectionForm,
)
from .models import Book, ImportDraft, ReadingSegment, ReadingSession
from .services import (
    format_duration,
    normalize_identity,
    normalize_isbn,
    parse_goodreads_csv,
    segment_seconds,
    segment_seconds_on_day,
    session_seconds,
    split_segment_by_day,
)

User = get_user_model()


def _owned_book(request, book_id):
    return get_object_or_404(Book, pk=book_id, owner=request.user)


def _book_form_context(form, is_edit=False, book=None):
    return {
        "form": form,
        "is_edit": is_edit,
        "book": book,
        "page_title": "Edit book" if is_edit else "Add a book",
    }


def _now():
    return timezone.now()


def _today_seconds(user, today=None):
    today = today or timezone.localtime(_now()).date()
    segments = ReadingSegment.objects.filter(session__owner=user).select_related("session")
    now = _now()
    return sum(segment_seconds_on_day(segment, today, now) for segment in segments)


@require_GET
def health(request):
    return HttpResponse("ok", content_type="text/plain")


def register(request):
    if request.user.is_authenticated:
        return redirect("today")
    form = RegisterForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        user = form.save()
        login(request, user)
        messages.success(request, "Your private Lire library is ready.")
        return redirect("today")
    return render(request, "registration/register.html", {"form": form})


@login_required
@require_GET
def today(request):
    now = _now()
    local_today = timezone.localtime(now).date()
    active_session = (
        ReadingSession.objects.filter(owner=request.user, status__in=["running", "paused"])
        .select_related("book")
        .prefetch_related("segments")
        .first()
    )
    active_seconds = session_seconds(active_session, now) if active_session else 0
    open_segment = None
    if active_session and active_session.status == ReadingSession.Status.RUNNING:
        open_segment = active_session.segments.filter(ended_at__isnull=True).first()

    books = Book.objects.filter(owner=request.user)
    start_choices = books.filter(
        status__in=[Book.Status.READING, Book.Status.WANT_TO_READ, Book.Status.PAUSED]
    ).order_by("-updated_at", "title")
    recent_books = books.order_by("-updated_at", "title")[:4]
    return render(
        request,
        "tracker/today.html",
        {
            "today_date": local_today,
            "active_session": active_session,
            "active_seconds": active_seconds,
            "open_segment": open_segment,
            "today_seconds": _today_seconds(request.user, local_today),
            "rendered_at": now.isoformat(),
            "start_choices": start_choices,
            "recent_books": recent_books,
            "reading_count": books.filter(status=Book.Status.READING).count(),
            "library_count": books.count(),
        },
    )


@login_required
@require_GET
def library(request):
    query = request.GET.get("q", "").strip()[:120]
    status = request.GET.get("shelf", "").strip()
    layout = "tiles" if request.GET.get("layout") == "tiles" else "list"
    books = Book.objects.filter(owner=request.user)
    if query:
        books = books.filter(title__icontains=query) | Book.objects.filter(
            owner=request.user, author__icontains=query
        ) | Book.objects.filter(owner=request.user, isbn__icontains=query)
    if status in Book.Status.values:
        books = books.filter(status=status)
    books = books.order_by(
        "-updated_at", "title"
    ).distinct()
    counts = {
        value: Book.objects.filter(owner=request.user, status=value).count()
        for value, _label in Book.Status.choices
    }
    return render(
        request,
        "tracker/library.html",
        {
            "books": books,
            "query": query,
            "selected_shelf": status,
            "layout": layout,
            "counts": counts,
            "total_books": Book.objects.filter(owner=request.user).count(),
        },
    )


@login_required
@require_http_methods(["GET", "POST"])
def book_add(request):
    form = BookForm(request.POST or None)
    requested_status = request.GET.get("status", "")
    if request.method == "GET" and requested_status in Book.Status.values:
        form.initial["status"] = requested_status
    if request.method == "POST" and form.is_valid():
        book = form.save(commit=False)
        book.owner = request.user
        now = _now()
        if book.status == Book.Status.READING and not book.started_at:
            book.started_at = now
        if book.status == Book.Status.FINISHED:
            book.finished_at = book.finished_at or now
            if book.page_count:
                book.current_page = book.page_count
        book.save()
        request.session["added_book_id"] = str(book.pk)
        messages.success(request, "Added to your library.")
        return redirect("book-detail", book_id=book.pk)
    return render(request, "tracker/book_form.html", _book_form_context(form))


@login_required
@require_http_methods(["GET", "POST"])
def book_edit(request, book_id):
    book = _owned_book(request, book_id)
    form = BookForm(request.POST or None, instance=book)
    if request.method == "POST" and form.is_valid():
        updated = form.save(commit=False)
        now = _now()
        has_open_session = ReadingSession.objects.filter(
            owner=request.user,
            book=book,
            status__in=[ReadingSession.Status.RUNNING, ReadingSession.Status.PAUSED],
        ).exists()
        if has_open_session and updated.status != Book.Status.READING:
            form.add_error("status", "Pause or finish the active timer before moving this book.")
        else:
            if book.status == Book.Status.FINISHED and updated.status == Book.Status.READING:
                updated.current_page = 0
                updated.finished_at = None
                updated.started_at = now
            elif updated.status == Book.Status.READING and not updated.started_at:
                updated.started_at = now
            if updated.status == Book.Status.FINISHED:
                updated.finished_at = updated.finished_at or now
                if updated.page_count:
                    updated.current_page = updated.page_count
            elif book.status == Book.Status.FINISHED:
                updated.finished_at = None
            updated.save()
            messages.success(request, "Book details saved.")
            return redirect("book-detail", book_id=updated.pk)
    return render(
        request,
        "tracker/book_form.html",
        _book_form_context(form, is_edit=True, book=book),
    )


@login_required
@require_GET
def book_detail(request, book_id):
    book = _owned_book(request, book_id)
    book_just_added = request.session.pop("added_book_id", None) == str(book.pk)
    global_active_session = ReadingSession.objects.filter(
        owner=request.user,
        status__in=[ReadingSession.Status.RUNNING, ReadingSession.Status.PAUSED],
    ).select_related("book").first()
    active_session = global_active_session if global_active_session and global_active_session.book_id == book.pk else None
    sessions = list(
        book.reading_sessions.filter(owner=request.user)
        .prefetch_related("segments")
        .order_by("-started_at")[:40]
    )
    now = _now()
    for session in sessions:
        session.seconds = session_seconds(session, now)
        session.correction_form = SessionCorrectionForm(
            initial={"total_minutes": round(session.seconds / 60)}
        )
    return render(
        request,
        "tracker/book_detail.html",
        {
            "book": book,
            "book_just_added": book_just_added,
            "active_session": active_session,
            "global_active_session": global_active_session,
            "status_choices": Book.Status.choices,
            "rendered_at": now.isoformat(),
            "sessions": sessions,
            "progress_form": ProgressForm(
                initial={"page_count": book.page_count, "current_page": book.current_page}
            ),
            "active_seconds": session_seconds(active_session, now) if active_session else 0,
        },
    )


@login_required
@require_POST
def book_progress(request, book_id):
    book = _owned_book(request, book_id)
    form = ProgressForm(request.POST)
    if not form.is_valid():
        for errors in form.errors.values():
            for error in errors:
                messages.error(request, error)
        return redirect("book-detail", book_id=book.pk)
    page_count = form.cleaned_data["page_count"]
    current_page = form.cleaned_data["current_page"]
    if book.status == Book.Status.FINISHED and page_count:
        current_page = page_count
    book.page_count = page_count
    book.current_page = current_page
    book.save(update_fields=["page_count", "current_page", "updated_at"])
    messages.success(request, "Reading progress saved.")
    return redirect("book-detail", book_id=book.pk)


@login_required
@require_POST
def book_status(request, book_id):
    book = _owned_book(request, book_id)
    status = request.POST.get("status")
    if status not in Book.Status.values:
        messages.error(request, "Choose a valid shelf.")
        return redirect("book-detail", book_id=book.pk)
    if status != Book.Status.READING and ReadingSession.objects.filter(
        owner=request.user,
        book=book,
        status__in=[ReadingSession.Status.RUNNING, ReadingSession.Status.PAUSED],
    ).exists():
        messages.error(request, "Pause or finish the active timer before moving this book.")
        return redirect("book-detail", book_id=book.pk)
    now = _now()
    if status == Book.Status.READING:
        if book.status == Book.Status.FINISHED:
            book.current_page = 0
            book.finished_at = None
            book.started_at = now
        elif not book.started_at:
            book.started_at = now
    elif status == Book.Status.FINISHED:
        if book.page_count:
            book.current_page = book.page_count
        book.finished_at = book.finished_at or now
    elif book.status == Book.Status.FINISHED:
        book.finished_at = None
    book.status = status
    book.save()
    messages.success(request, f"Moved to {book.get_status_display()}.")
    return redirect("book-detail", book_id=book.pk)


@login_required
@require_http_methods(["GET", "POST"])
def book_delete(request, book_id):
    book = _owned_book(request, book_id)
    if request.method == "POST":
        title = book.title
        book.delete()
        messages.success(request, f"Removed “{title}” from your library.")
        return redirect("library")
    return render(request, "tracker/book_delete.html", {"book": book})


@login_required
@require_POST
def session_start(request):
    book = get_object_or_404(Book, pk=request.POST.get("book_id"), owner=request.user)
    now = _now()
    try:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            if ReadingSession.objects.filter(
                owner=request.user,
                status__in=[ReadingSession.Status.RUNNING, ReadingSession.Status.PAUSED],
            ).exists():
                messages.error(request, "Finish or pause your current reading session first.")
                return redirect("today")
            book = Book.objects.select_for_update().get(pk=book.pk, owner=request.user)
            if book.status == Book.Status.FINISHED:
                book.current_page = 0
                book.finished_at = None
                book.started_at = now
            elif not book.started_at:
                book.started_at = now
            book.status = Book.Status.READING
            book.save()
            session = ReadingSession.objects.create(
                owner=request.user,
                book=book,
                status=ReadingSession.Status.RUNNING,
                started_at=now,
            )
            ReadingSegment.objects.create(session=session, started_at=now)
    except IntegrityError:
        messages.error(request, "Another reading session is already active.")
        return redirect("today")
    messages.success(request, "Timer started.")
    return redirect("today")


@login_required
@require_POST
def session_pause(request, session_id):
    now = _now()
    with transaction.atomic():
        session = get_object_or_404(
            ReadingSession.objects.select_for_update(),
            pk=session_id,
            owner=request.user,
            status=ReadingSession.Status.RUNNING,
        )
        segment = session.segments.filter(ended_at__isnull=True).order_by("-started_at").first()
        if not segment:
            messages.error(request, "This timer could not be paused because its open segment is missing.")
            return redirect("today")
        segment.ended_at = now
        segment.save(update_fields=["ended_at", "updated_at"])
        session.status = ReadingSession.Status.PAUSED
        session.save(update_fields=["status", "updated_at"])
    messages.info(request, "Timer paused.")
    return redirect("today")


@login_required
@require_POST
def session_resume(request, session_id):
    now = _now()
    try:
        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)
            session = get_object_or_404(
                ReadingSession.objects.select_for_update(),
                pk=session_id,
                owner=request.user,
                status=ReadingSession.Status.PAUSED,
            )
            if ReadingSession.objects.filter(
                owner=request.user,
                status__in=[ReadingSession.Status.RUNNING, ReadingSession.Status.PAUSED],
            ).exclude(pk=session.pk).exists():
                messages.error(request, "Finish your other open timer before resuming this one.")
                return redirect("today")
            session.status = ReadingSession.Status.RUNNING
            session.save(update_fields=["status", "updated_at"])
            ReadingSegment.objects.create(session=session, started_at=now)
    except IntegrityError:
        messages.error(request, "Another reading session is already active.")
        return redirect("today")
    messages.success(request, "Timer resumed.")
    return redirect("today")


@login_required
@require_POST
def session_finish(request, session_id):
    now = _now()
    with transaction.atomic():
        session = get_object_or_404(
            ReadingSession.objects.select_for_update(),
            pk=session_id,
            owner=request.user,
            status__in=[ReadingSession.Status.RUNNING, ReadingSession.Status.PAUSED],
        )
        if session.status == ReadingSession.Status.RUNNING:
            segment = session.segments.filter(ended_at__isnull=True).order_by("-started_at").first()
            if segment:
                segment.ended_at = now
                segment.save(update_fields=["ended_at", "updated_at"])
        session.status = ReadingSession.Status.COMPLETED
        session.completed_at = now
        session.save(update_fields=["status", "completed_at", "updated_at"])
    messages.success(request, "Reading session saved.")
    return redirect("book-detail", book_id=session.book_id)


@login_required
@require_POST
def session_correct(request, session_id):
    session = get_object_or_404(
        ReadingSession.objects.filter(owner=request.user).select_related("book").prefetch_related("segments"),
        pk=session_id,
    )
    form = SessionCorrectionForm(request.POST)
    if not form.is_valid():
        messages.error(request, "Enter a whole number of minutes.")
        return redirect("book-detail", book_id=session.book_id)
    if session.status == ReadingSession.Status.RUNNING:
        messages.error(request, "Pause or finish the timer before correcting its duration.")
        return redirect("book-detail", book_id=session.book_id)

    target_seconds = form.cleaned_data["total_minutes"] * 60
    now = _now()
    segments = list(session.segments.order_by("started_at", "id"))
    if not segments:
        messages.error(request, "This session has no saved reading time to correct.")
        return redirect("book-detail", book_id=session.book_id)
    prior_seconds = sum(segment_seconds(segment, now) for segment in segments[:-1])
    last_segment = segments[-1]
    corrected_end = last_segment.started_at + timedelta(seconds=target_seconds - prior_seconds)
    if target_seconds < prior_seconds or corrected_end > now or corrected_end < last_segment.started_at:
        messages.error(request, "That total is outside the time range saved for this session.")
        return redirect("book-detail", book_id=session.book_id)
    last_segment.ended_at = corrected_end
    last_segment.save(update_fields=["ended_at", "updated_at"])
    messages.success(request, "Session duration updated.")
    return redirect("book-detail", book_id=session.book_id)


@login_required
@require_GET
def stats(request):
    now = _now()
    today_date = timezone.localtime(now).date()
    week_start = today_date - timedelta(days=today_date.weekday())
    month_start = today_date.replace(day=1)
    first_chart_day = today_date - timedelta(days=13)
    daily_totals = defaultdict(int)
    book_totals = defaultdict(int)
    segments = list(
        ReadingSegment.objects.filter(session__owner=request.user)
        .select_related("session", "session__book")
    )
    for segment in segments:
        for day, seconds in split_segment_by_day(segment, now):
            if day > today_date:
                continue
            daily_totals[day] += seconds
            if day >= month_start:
                book_totals[segment.session.book_id] += seconds

    all_books = {
        book.pk: book
        for book in Book.objects.filter(owner=request.user)
    }
    by_book = [
        {"book": all_books[book_id], "seconds": seconds}
        for book_id, seconds in book_totals.items()
        if book_id in all_books
    ]
    by_book.sort(key=lambda item: item["seconds"], reverse=True)
    chart = [
        {"date": day, "seconds": daily_totals.get(day, 0)}
        for day in (first_chart_day + timedelta(days=index) for index in range(14))
    ]
    maximum = max((item["seconds"] for item in chart), default=0)
    for item in chart:
        item["height"] = max(5, round(item["seconds"] * 100 / maximum)) if maximum else 5
    weekly_seconds = sum(seconds for day, seconds in daily_totals.items() if week_start <= day <= today_date)
    monthly_seconds = sum(seconds for day, seconds in daily_totals.items() if month_start <= day <= today_date)
    reading_days = sum(1 for seconds in daily_totals.values() if seconds > 0)
    completed_count = ReadingSession.objects.filter(
        owner=request.user,
        status=ReadingSession.Status.COMPLETED,
        completed_at__date__gte=month_start,
        completed_at__date__lte=today_date,
    ).count()
    return render(
        request,
        "tracker/stats.html",
        {
            "today_seconds": daily_totals.get(today_date, 0),
            "weekly_seconds": weekly_seconds,
            "monthly_seconds": monthly_seconds,
            "reading_days": reading_days,
            "completed_count": completed_count,
            "chart": chart,
            "by_book": by_book[:8],
            "month_label": today_date.strftime("%B %Y"),
            "week_label": f"{week_start.strftime('%b %d')} – {today_date.strftime('%b %d')}",
            "format_duration": format_duration,
        },
    )


@login_required
@require_GET
def catalog_search(request):
    query = request.GET.get("q", "").strip()[:120]
    if len(query) < 2:
        return JsonResponse({"results": []})
    params = urlencode(
        {
            "title": query,
            "fields": "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn",
            "limit": 12,
        }
    )
    api_request = Request(
        f"https://openlibrary.org/search.json?{params}",
        headers={"User-Agent": "Lire reading tracker (open-source project)"},
    )
    try:
        with urlopen(api_request, timeout=7) as response:
            payload = json.loads(response.read(1_500_000).decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse(
            {"results": [], "error": "Open Library is unavailable right now. You can still add the book manually."},
            status=502,
        )
    if not isinstance(payload, dict):
        return JsonResponse({"results": [], "error": "Open Library returned an unexpected response."}, status=502)
    results = []
    for item in payload.get("docs", []):
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        cover_id = item.get("cover_i")
        cover_url = (
            f"https://covers.openlibrary.org/b/id/{int(cover_id)}-M.jpg"
            if isinstance(cover_id, int) and cover_id > 0
            else ""
        )
        isbns = item.get("isbn") or []
        authors = item.get("author_name") or []
        if not isinstance(authors, list):
            authors = []
        results.append(
            {
                "title": title[:240],
                "author": ", ".join(str(author) for author in authors)[:240],
                "catalog_id": str(item.get("key") or "")[:160],
                "isbn": normalize_isbn(isbns[0]) if isbns else "",
                "published_year": item.get("first_publish_year"),
                "page_count": item.get("number_of_pages_median"),
                "cover_url": cover_url,
            }
        )
    return JsonResponse({"results": results})


@login_required
@require_http_methods(["GET", "POST"])
def goodreads_import(request):
    if request.method == "POST":
        form = GoodreadsUploadForm(request.POST, request.FILES)
        if form.is_valid():
            try:
                uploaded = form.cleaned_data["csv_file"]
                contents = b"".join(uploaded.chunks())
                parsed, skipped = parse_goodreads_csv(contents)
            except ValueError as exc:
                form.add_error("csv_file", str(exc))
            else:
                existing = list(Book.objects.filter(owner=request.user).only("title", "author", "isbn"))
                existing_isbns = {
                    value for value in (normalize_isbn(book.isbn) for book in existing) if value
                }
                existing_identities = {
                    normalize_identity(book.title, book.author) for book in existing
                }
                seen_isbns = set()
                seen_identities = set()
                for item in parsed:
                    isbn = item["isbn"]
                    identity = normalize_identity(item["title"], item["author"])
                    if isbn and isbn in existing_isbns:
                        item["duplicate_match"] = "isbn"
                    elif identity in existing_identities:
                        item["duplicate_match"] = "title-author"
                    elif (isbn and isbn in seen_isbns) or identity in seen_identities:
                        item["duplicate_match"] = "same-file"
                    if isbn:
                        seen_isbns.add(isbn)
                    seen_identities.add(identity)
                ImportDraft.objects.filter(
                    owner=request.user,
                    created_at__lt=_now() - timedelta(days=1),
                ).delete()
                draft = ImportDraft.objects.create(
                    owner=request.user,
                    books=parsed,
                    skipped_count=skipped,
                )
                return redirect("goodreads-preview", draft_id=draft.pk)
    else:
        form = GoodreadsUploadForm()
    return render(request, "tracker/goodreads_import.html", {"form": form})


@login_required
@require_http_methods(["GET", "POST"])
def goodreads_preview(request, draft_id):
    draft = get_object_or_404(ImportDraft, pk=draft_id, owner=request.user)
    books = draft.books
    if request.method == "POST":
        include_duplicates = request.POST.get("include_duplicates") == "yes"
        imported_count = 0
        with transaction.atomic():
            for item in books:
                if item.get("duplicate_match") and not include_duplicates:
                    continue
                started_at = parse_datetime(item.get("started_at") or "")
                finished_at = parse_datetime(item.get("finished_at") or "")
                status = item.get("status")
                if status not in Book.Status.values:
                    status = Book.Status.WANT_TO_READ
                page_count = item.get("page_count")
                if not isinstance(page_count, int) or page_count < 1:
                    page_count = None
                current_page = page_count if status == Book.Status.FINISHED and page_count else 0
                Book.objects.create(
                    owner=request.user,
                    title=str(item.get("title", ""))[:240],
                    author=str(item.get("author", ""))[:240],
                    status=status,
                    isbn=str(item.get("isbn", ""))[:32],
                    page_count=page_count,
                    current_page=current_page,
                    rating=item.get("rating") if item.get("rating") in range(1, 6) else None,
                    notes=str(item.get("notes", ""))[:10000],
                    published_year=item.get("published_year"),
                    started_at=started_at,
                    finished_at=finished_at,
                )
                imported_count += 1
            draft.delete()
        messages.success(request, f"Imported {imported_count} books.")
        return redirect("library")
    return render(
        request,
        "tracker/goodreads_preview.html",
        {
            "draft": draft,
            "books": books[:100],
            "total_count": len(books),
            "duplicate_count": sum(1 for item in books if item.get("duplicate_match")),
        },
    )


@login_required
@require_GET
def profile(request):
    return render(request, "tracker/profile.html", {"email": request.user.email})


@login_required
@require_http_methods(["GET", "POST"])
def profile_edit(request):
    form = ProfileForm(request.POST or None, instance=request.user)
    if request.method == "POST" and form.is_valid():
        form.save()
        messages.success(request, "Account details saved.")
        return redirect("profile")
    return render(request, "tracker/profile_edit.html", {"form": form})


@login_required
@require_POST
def account_delete(request):
    form = AccountDeleteForm(request.POST)
    user = request.user
    if not form.is_valid() or not user.check_password(form.cleaned_data["password"]):
        messages.error(request, "The password did not match. Your account is unchanged.")
        return redirect("profile")
    with transaction.atomic():
        logout(request)
        user.delete()
    messages.success(request, "Your Lire account and reading data have been deleted.")
    return redirect("login")


@login_required
@require_GET
def backup_page(request):
    return render(request, "tracker/backup.html", {"form": BackupRestoreForm()})


def _iso(value):
    return value.isoformat() if value else None


@login_required
@require_GET
def backup_export(request):
    exported_at = _now()
    books = list(Book.objects.filter(owner=request.user).order_by("created_at", "id"))
    sessions = list(
        ReadingSession.objects.filter(owner=request.user)
        .select_related("book")
        .order_by("started_at", "id")
    )
    segments = list(
        ReadingSegment.objects.filter(session__owner=request.user)
        .select_related("session")
        .order_by("started_at", "id")
    )
    running_ids = {
        str(session.pk)
        for session in sessions
        if session.status == ReadingSession.Status.RUNNING
    }
    body = {
        "format": "lire-backup",
        "version": 3,
        "exportedAt": exported_at.isoformat(),
        "books": [
            {
                "id": str(book.pk),
                "title": book.title,
                "author": book.author or None,
                "status": book.status,
                "page_count": book.page_count,
                "current_page": book.current_page,
                "catalog_id": book.catalog_id or None,
                "isbn": book.isbn or None,
                "cover_url": book.cover_url or None,
                "published_year": book.published_year,
                "started_at": _iso(book.started_at),
                "finished_at": _iso(book.finished_at),
                "rating": book.rating,
                "notes": book.notes or None,
                "created_at": _iso(book.created_at),
                "updated_at": _iso(book.updated_at),
            }
            for book in books
        ],
        "sessions": [
            {
                "id": str(session.pk),
                "book_id": str(session.book_id),
                "status": "paused" if session.status == ReadingSession.Status.RUNNING else session.status,
                "started_at": _iso(session.started_at),
                "completed_at": _iso(session.completed_at),
                "updated_at": _iso(exported_at if session.status == ReadingSession.Status.RUNNING else session.updated_at),
            }
            for session in sessions
        ],
        "segments": [
            {
                "id": str(segment.pk),
                "session_id": str(segment.session_id),
                "started_at": _iso(segment.started_at),
                "ended_at": _iso(exported_at if segment.ended_at is None and str(segment.session_id) in running_ids else segment.ended_at),
                "updated_at": _iso(exported_at if segment.ended_at is None and str(segment.session_id) in running_ids else segment.updated_at),
            }
            for segment in segments
        ],
    }
    response = HttpResponse(
        json.dumps(body, ensure_ascii=False, indent=2),
        content_type="application/json",
    )
    response["Content-Disposition"] = 'attachment; filename="lire-backup.json"'
    return response


def _backup_datetime(value, allow_none=False):
    if value is None and allow_none:
        return None
    if not isinstance(value, str):
        raise ValueError
    parsed = parse_datetime(value)
    if not parsed:
        raise ValueError
    if timezone.is_naive(parsed):
        parsed = timezone.make_aware(parsed, timezone.get_current_timezone())
    return parsed


def _backup_uuid(value):
    if not isinstance(value, str):
        raise ValueError
    return uuid.UUID(value)


def _safe_backup_cover(value):
    if value in (None, ""):
        return ""
    if not isinstance(value, str) or not value.startswith(("https://", "http://")):
        raise ValueError("A book in this backup has an invalid cover URL.")
    return value[:1000]


def _validate_backup(contents):
    try:
        raw = json.loads(contents)
    except (TypeError, json.JSONDecodeError, RecursionError) as exc:
        raise ValueError("This file is not valid JSON.") from exc
    if not isinstance(raw, dict) or raw.get("format") != "lire-backup" or raw.get("version") not in (1, 2, 3):
        raise ValueError("This is not a Lire backup supported by this version.")
    exported_at = _backup_datetime(raw.get("exportedAt"))
    if not all(isinstance(raw.get(key), list) for key in ("books", "sessions", "segments")):
        raise ValueError("This backup is missing its library or reading history.")

    books = []
    book_ids = set()
    for item in raw["books"]:
        if not isinstance(item, dict) or not isinstance(item.get("title"), str) or not item["title"].strip():
            raise ValueError("A book in this backup is incomplete.")
        book_id = _backup_uuid(item.get("id"))
        if book_id in book_ids:
            raise ValueError("This backup contains duplicate book IDs.")
        book_ids.add(book_id)
        version = raw["version"]
        page_count = item.get("page_count") if version >= 2 else None
        current_page = item.get("current_page", 0) if version >= 2 else 0
        if page_count is not None and (not isinstance(page_count, int) or isinstance(page_count, bool) or page_count < 1 or page_count > 2_147_483_647):
            raise ValueError("A book has an invalid total page count.")
        if not isinstance(current_page, int) or isinstance(current_page, bool) or current_page < 0 or current_page > 2_147_483_647 or (page_count and current_page > page_count):
            raise ValueError("A book has invalid reading progress.")
        allowed_statuses = {"reading", "want_to_read", "finished"} | ({"paused"} if version >= 3 else set())
        status = item.get("status")
        if status not in allowed_statuses:
            raise ValueError("A book has an invalid shelf.")
        rating = item.get("rating") if version >= 3 else None
        if rating is not None and (not isinstance(rating, int) or isinstance(rating, bool) or not 1 <= rating <= 5):
            raise ValueError("A book has an invalid rating.")
        books.append({
            "id": book_id,
            "title": item["title"].strip()[:240],
            "author": item.get("author") if isinstance(item.get("author"), str) else "",
            "status": status,
            "page_count": page_count,
            "current_page": page_count if status == "finished" and page_count else current_page,
            "catalog_id": item.get("catalog_id") if version >= 3 and isinstance(item.get("catalog_id"), str) else "",
            "isbn": item.get("isbn") if version >= 3 and isinstance(item.get("isbn"), str) else "",
            "cover_url": _safe_backup_cover(item.get("cover_url")) if version >= 3 else "",
            "published_year": item.get("published_year") if version >= 3 and isinstance(item.get("published_year"), int) and not isinstance(item.get("published_year"), bool) and 1000 <= item.get("published_year") <= 9999 else None,
            "started_at": _backup_datetime(item.get("started_at"), allow_none=True) if version >= 3 else None,
            "finished_at": _backup_datetime(item.get("finished_at"), allow_none=True) if version >= 3 else None,
            "rating": rating,
            "notes": item.get("notes") if version >= 3 and isinstance(item.get("notes"), str) else "",
            "created_at": _backup_datetime(item.get("created_at")),
            "updated_at": _backup_datetime(item.get("updated_at")),
        })

    sessions = []
    session_ids = set()
    open_count = 0
    for item in raw["sessions"]:
        if not isinstance(item, dict):
            raise ValueError("A reading session in this backup is incomplete.")
        session_id = _backup_uuid(item.get("id"))
        book_id = _backup_uuid(item.get("book_id"))
        status = item.get("status")
        if session_id in session_ids or book_id not in book_ids or status not in {"running", "paused", "completed"}:
            raise ValueError("A reading session in this backup is invalid.")
        session_ids.add(session_id)
        started_at = _backup_datetime(item.get("started_at"))
        completed_at = _backup_datetime(item.get("completed_at"), allow_none=True)
        if (status == "completed") != (completed_at is not None):
            raise ValueError("A reading session has inconsistent completion details.")
        if status != "completed":
            open_count += 1
        sessions.append({
            "id": session_id,
            "book_id": book_id,
            "status": status,
            "started_at": started_at,
            "completed_at": completed_at,
            "updated_at": _backup_datetime(item.get("updated_at") or item.get("completed_at") or item.get("started_at")),
        })
    if open_count > 1:
        raise ValueError("This backup contains more than one unfinished timer.")

    segments = []
    segment_ids = set()
    session_map = {session["id"]: session for session in sessions}
    segments_by_session = defaultdict(list)
    for item in raw["segments"]:
        if not isinstance(item, dict):
            raise ValueError("A reading segment in this backup is incomplete.")
        segment_id = _backup_uuid(item.get("id"))
        session_id = _backup_uuid(item.get("session_id"))
        if segment_id in segment_ids or session_id not in session_map:
            raise ValueError("A reading segment refers to an unknown session.")
        segment_ids.add(segment_id)
        started_at = _backup_datetime(item.get("started_at"))
        ended_at = _backup_datetime(item.get("ended_at"), allow_none=True)
        if ended_at and ended_at < started_at:
            raise ValueError("A reading segment ends before it begins.")
        segment = {
            "id": segment_id,
            "session_id": session_id,
            "started_at": started_at,
            "ended_at": ended_at,
            "updated_at": _backup_datetime(item.get("updated_at") or item.get("ended_at") or item.get("started_at")),
        }
        segments.append(segment)
        segments_by_session[session_id].append(segment)

    for session in sessions:
        items = sorted(segments_by_session[session["id"]], key=lambda part: (part["started_at"], str(part["id"])))
        if not items or items[0]["started_at"] != session["started_at"]:
            raise ValueError("A reading session is missing its first time segment.")
        if session["status"] == "running":
            if sum(1 for item in items if item["ended_at"] is None) != 1:
                raise ValueError("A running timer must have exactly one open segment.")
        elif any(item["ended_at"] is None for item in items):
            raise ValueError("A paused or completed timer cannot have an open segment.")

    # An export is a snapshot: turn any running timer into a paused timer at export time.
    for session in sessions:
        if session["status"] == "running":
            session["status"] = "paused"
            session["updated_at"] = exported_at
    for segment in segments:
        if segment["ended_at"] is None:
            segment["ended_at"] = exported_at
            segment["updated_at"] = exported_at
    return books, sessions, segments


@login_required
@require_http_methods(["GET", "POST"])
def backup_restore(request):
    form = BackupRestoreForm(request.POST or None, request.FILES or None)
    if request.method == "POST" and form.is_valid():
        uploaded = form.cleaned_data["backup_file"]
        contents = b"".join(uploaded.chunks())
        try:
            books, sessions, segments = _validate_backup(contents.decode("utf-8-sig"))
        except (UnicodeDecodeError, ValueError, TypeError, KeyError, OverflowError) as exc:
            form.add_error("backup_file", str(exc) or "This backup could not be read.")
        else:
            with transaction.atomic():
                ReadingSession.objects.filter(owner=request.user).delete()
                Book.objects.filter(owner=request.user).delete()
                book_map = {}
                for item in books:
                    book = Book.objects.create(owner=request.user, **item)
                    book_map[item["id"]] = book
                session_map = {}
                for item in sessions:
                    session = ReadingSession.objects.create(
                        owner=request.user,
                        book=book_map[item["book_id"]],
                        **{key: item[key] for key in ("id", "status", "started_at", "completed_at", "updated_at")},
                    )
                    session_map[item["id"]] = session
                for item in segments:
                    ReadingSegment.objects.create(
                        session=session_map[item["session_id"]],
                        **{key: item[key] for key in ("id", "started_at", "ended_at", "updated_at")},
                    )
            messages.success(request, f"Restored {len(books)} books and {len(sessions)} reading sessions.")
            return redirect("today")
    return render(request, "tracker/backup.html", {"form": form})
