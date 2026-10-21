import uuid

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class Book(models.Model):
    class Status(models.TextChoices):
        READING = "reading", "Reading"
        WANT_TO_READ = "want_to_read", "Want to read"
        FINISHED = "finished", "Finished"
        PAUSED = "paused", "Paused"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="books"
    )
    title = models.CharField(max_length=240)
    author = models.CharField(max_length=240, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.WANT_TO_READ)
    page_count = models.PositiveIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(2_147_483_647)]
    )
    current_page = models.PositiveIntegerField(
        default=0, validators=[MaxValueValidator(2_147_483_647)]
    )
    catalog_id = models.CharField(max_length=160, blank=True)
    isbn = models.CharField(max_length=32, blank=True)
    cover_url = models.URLField(max_length=1000, blank=True)
    published_year = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1000), MaxValueValidator(9999)]
    )
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    rating = models.PositiveSmallIntegerField(
        null=True, blank=True, validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "title"]
        constraints = [
            models.CheckConstraint(
                condition=Q(page_count__isnull=True) | Q(current_page__lte=models.F("page_count")),
                name="book_current_page_not_over_total",
            ),
            models.CheckConstraint(
                condition=Q(rating__isnull=True) | Q(rating__gte=1, rating__lte=5),
                name="book_rating_between_one_and_five",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "status", "-updated_at"], name="book_owner_status_idx"),
            models.Index(fields=["owner", "title"], name="book_owner_title_idx"),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def progress_percent(self) -> int:
        if self.status == self.Status.FINISHED:
            return 100
        if not self.page_count:
            return 0
        return min(100, round(self.current_page * 100 / self.page_count))


class ReadingSession(models.Model):
    class Status(models.TextChoices):
        RUNNING = "running", "Running"
        PAUSED = "paused", "Paused"
        COMPLETED = "completed", "Completed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_sessions"
    )
    book = models.ForeignKey(
        Book, on_delete=models.CASCADE, related_name="reading_sessions"
    )
    status = models.CharField(max_length=16, choices=Status.choices)
    started_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-started_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["owner"],
                condition=Q(status__in=["running", "paused"]),
                name="one_open_reading_session_per_owner",
            ),
            models.CheckConstraint(
                condition=(
                    Q(status="completed", completed_at__isnull=False)
                    | (Q(status__in=["running", "paused"]) & Q(completed_at__isnull=True))
                ),
                name="reading_session_completion_matches_status",
            ),
        ]
        indexes = [
            models.Index(fields=["owner", "status", "-started_at"], name="session_owner_status_idx"),
            models.Index(fields=["book", "-started_at"], name="session_book_start_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.book.title} · {self.get_status_display()}"


class ReadingSegment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        ReadingSession, on_delete=models.CASCADE, related_name="segments"
    )
    started_at = models.DateTimeField()
    ended_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["started_at", "id"]
        constraints = [
            models.CheckConstraint(
                condition=Q(ended_at__isnull=True) | Q(ended_at__gte=models.F("started_at")),
                name="reading_segment_end_after_start",
            ),
        ]
        indexes = [models.Index(fields=["session", "started_at"], name="segment_session_start_idx")]

    def __str__(self) -> str:
        return f"Reading segment for {self.session_id}"


class ImportDraft(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="import_drafts"
    )
    books = models.JSONField(default=list)
    skipped_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(default=timezone.now)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Goodreads import for {self.owner}"
