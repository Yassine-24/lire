from django import template

from tracker.services import format_duration

register = template.Library()


@register.filter
def duration(value):
    try:
        return format_duration(int(value or 0))
    except (TypeError, ValueError):
        return "0 min"


@register.filter
def progress(book):
    return book.progress_percent
