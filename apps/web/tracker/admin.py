from django.contrib import admin

from .models import Book, ImportDraft, ReadingSegment, ReadingSession


class ReadingSegmentInline(admin.TabularInline):
    model = ReadingSegment
    extra = 0


@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "owner", "status", "current_page", "page_count")
    list_filter = ("status",)
    search_fields = ("title", "author", "isbn", "owner__username")
    readonly_fields = ("id", "created_at", "updated_at")


@admin.register(ReadingSession)
class ReadingSessionAdmin(admin.ModelAdmin):
    list_display = ("book", "owner", "status", "started_at", "completed_at")
    list_filter = ("status",)
    search_fields = ("book__title", "owner__username")
    readonly_fields = ("id", "created_at", "updated_at")
    inlines = [ReadingSegmentInline]


admin.site.register(ImportDraft)
