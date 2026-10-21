import uuid

import django.core.validators
import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True

    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Book",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("title", models.CharField(max_length=240)),
                ("author", models.CharField(blank=True, max_length=240)),
                ("status", models.CharField(choices=[("reading", "Reading"), ("want_to_read", "Want to read"), ("finished", "Finished"), ("paused", "Paused")], default="want_to_read", max_length=20)),
                ("page_count", models.PositiveIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(2147483647)])),
                ("current_page", models.PositiveIntegerField(default=0, validators=[django.core.validators.MaxValueValidator(2147483647)])),
                ("catalog_id", models.CharField(blank=True, max_length=160)),
                ("isbn", models.CharField(blank=True, max_length=32)),
                ("cover_url", models.URLField(blank=True, max_length=1000)),
                ("published_year", models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1000), django.core.validators.MaxValueValidator(9999)])),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("rating", models.PositiveSmallIntegerField(blank=True, null=True, validators=[django.core.validators.MinValueValidator(1), django.core.validators.MaxValueValidator(5)])),
                ("notes", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="books", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-updated_at", "title"]},
        ),
        migrations.CreateModel(
            name="ReadingSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("status", models.CharField(choices=[("running", "Running"), ("paused", "Paused"), ("completed", "Completed")], max_length=16)),
                ("started_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("book", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reading_sessions", to="tracker.book")),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="reading_sessions", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-started_at"]},
        ),
        migrations.CreateModel(
            name="ReadingSegment",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("started_at", models.DateTimeField()),
                ("ended_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("session", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="segments", to="tracker.readingsession")),
            ],
            options={"ordering": ["started_at", "id"]},
        ),
        migrations.CreateModel(
            name="ImportDraft",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("books", models.JSONField(default=list)),
                ("skipped_count", models.PositiveIntegerField(default=0)),
                ("created_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="import_drafts", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.AddConstraint(
            model_name="book",
            constraint=models.CheckConstraint(condition=models.Q(("page_count__isnull", True), ("current_page__lte", models.F("page_count")), _connector="OR"), name="book_current_page_not_over_total"),
        ),
        migrations.AddConstraint(
            model_name="book",
            constraint=models.CheckConstraint(condition=models.Q(("rating__isnull", True), ("rating__gte", 1), ("rating__lte", 5), _connector="OR"), name="book_rating_between_one_and_five"),
        ),
        migrations.AddConstraint(
            model_name="readingsession",
            constraint=models.UniqueConstraint(condition=models.Q(("status__in", ["running", "paused"])), fields=("owner",), name="one_open_reading_session_per_owner"),
        ),
        migrations.AddConstraint(
            model_name="readingsession",
            constraint=models.CheckConstraint(condition=models.Q(models.Q(("status", "completed"), ("completed_at__isnull", False)), models.Q(("status__in", ["running", "paused"]), ("completed_at__isnull", True)), _connector="OR"), name="reading_session_completion_matches_status"),
        ),
        migrations.AddConstraint(
            model_name="readingsegment",
            constraint=models.CheckConstraint(condition=models.Q(("ended_at__isnull", True), ("ended_at__gte", models.F("started_at")), _connector="OR"), name="reading_segment_end_after_start"),
        ),
        migrations.AddIndex(model_name="book", index=models.Index(fields=["owner", "status", "-updated_at"], name="book_owner_status_idx")),
        migrations.AddIndex(model_name="book", index=models.Index(fields=["owner", "title"], name="book_owner_title_idx")),
        migrations.AddIndex(model_name="readingsession", index=models.Index(fields=["owner", "status", "-started_at"], name="session_owner_status_idx")),
        migrations.AddIndex(model_name="readingsession", index=models.Index(fields=["book", "-started_at"], name="session_book_start_idx")),
        migrations.AddIndex(model_name="readingsegment", index=models.Index(fields=["session", "started_at"], name="segment_session_start_idx")),
    ]
