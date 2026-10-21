from urllib.parse import unquote
from zoneinfo import ZoneInfo, available_timezones

from django.utils import timezone


class BrowserTimezoneMiddleware:
    """Use the browser's IANA timezone cookie for day-based reading totals."""

    def __init__(self, get_response):
        self.get_response = get_response
        self.known_zones = available_timezones()

    def __call__(self, request):
        zone_name = unquote(request.COOKIES.get("lire_timezone", ""))
        if zone_name in self.known_zones:
            timezone.activate(ZoneInfo(zone_name))
        else:
            timezone.deactivate()
        response = self.get_response(request)
        return response
