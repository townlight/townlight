"""Exact staff-route policy for the desktop Parks proxy.

The proxy uses this module before forwarding a request.  Every route below is
an explicit method/path pair.  No URL is derived from caller input beyond the
canonical UUID and fixed enum segments that the Parks API itself declares.
"""

from __future__ import annotations

import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from re import Pattern
from urllib.parse import parse_qsl

_UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_UUID_RE = re.compile(rf"\A{_UUID}\Z")
_INT_RE = re.compile(r"\A[0-9]+\Z")
_BAD_PERCENT_RE = re.compile(r"%(?![0-9a-fA-F]{2})")

_CATALOG_KIND = r"(?:resource|program)"
_RECORD_KIND = r"(?:resource|program|booking|registration)"
_NOTIFICATION_KIND = r"(?:booking|registration)"

_STAFF_ROOT = "/desktop/v1/parks"
_DATA_ROOT = "/desktop/v1/municipal-staff/data/parks"


_QueryCheck = Callable[[str], bool]


@dataclass(frozen=True)
class _Route:
    method: str
    pattern: Pattern[str]
    query: _QueryCheck | None


def _values(query: str, allowed: frozenset[str]) -> dict[str, str] | None:
    """Parse a query string into exact, duplicate-free allowed values."""
    if query == "":
        return {}
    if query.startswith("?") or "#" in query or _BAD_PERCENT_RE.search(query):
        return None
    try:
        pairs = parse_qsl(
            query,
            keep_blank_values=True,
            strict_parsing=True,
            encoding="utf-8",
            errors="strict",
        )
    except (UnicodeError, ValueError):
        return None

    parsed: dict[str, str] = {}
    for key, value in pairs:
        if key not in allowed or key in parsed:
            return None
        parsed[key] = value
    return parsed


def _bounded_int(value: str, minimum: int, maximum: int | None = None) -> bool:
    if _INT_RE.fullmatch(value) is None:
        return False
    try:
        number = int(value)
    except ValueError:
        return False
    if number < minimum:
        return False
    return maximum is None or number <= maximum


def _boolean(value: str) -> bool:
    return value == "true" or value == "false"


def _canonical_uuid(value: str) -> bool:
    return _UUID_RE.fullmatch(value) is not None


def _bounded_search(value: str) -> bool:
    return 1 <= len(value) <= 200


def _aware_iso(value: str) -> bool:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return False
    return parsed.tzinfo is not None and parsed.utcoffset() is not None


def _q_catalog_list(query: str) -> bool:
    values = _values(query, frozenset({"public_only", "limit", "offset"}))
    if values is None:
        return False
    if "public_only" in values and not _boolean(values["public_only"]):
        return False
    if "limit" in values and not _bounded_int(values["limit"], 1, 200):
        return False
    return not ("offset" in values and not _bounded_int(values["offset"], 0))


def _q_catalog_get(query: str) -> bool:
    values = _values(query, frozenset({"public_only"}))
    if values is None:
        return False
    return not ("public_only" in values and not _boolean(values["public_only"]))


def _q_household_search(query: str) -> bool:
    values = _values(query, frozenset({"search", "limit", "offset"}))
    if values is None:
        return False
    if "search" not in values or not _bounded_search(values["search"]):
        return False
    if "limit" in values and not _bounded_int(values["limit"], 1, 100):
        return False
    return not ("offset" in values and not _bounded_int(values["offset"], 0))


def _q_booking_list(query: str) -> bool:
    values = _values(
        query,
        frozenset({"resource_id", "household_id", "limit", "offset"}),
    )
    if values is None:
        return False
    for key in ("resource_id", "household_id"):
        if key in values and not _canonical_uuid(values[key]):
            return False
    if "limit" in values and not _bounded_int(values["limit"], 1, 200):
        return False
    return not ("offset" in values and not _bounded_int(values["offset"], 0))


def _q_availability(query: str) -> bool:
    values = _values(query, frozenset({"start", "end"}))
    if values is None:
        return False
    if "start" not in values or "end" not in values:
        return False
    return _aware_iso(values["start"]) and _aware_iso(values["end"])


def _q_session_list(query: str) -> bool:
    values = _values(
        query,
        frozenset({"program_id", "public_only", "limit", "offset"}),
    )
    if values is None:
        return False
    if "program_id" in values and not _canonical_uuid(values["program_id"]):
        return False
    if "public_only" in values and not _boolean(values["public_only"]):
        return False
    if "limit" in values and not _bounded_int(values["limit"], 1, 200):
        return False
    return not ("offset" in values and not _bounded_int(values["offset"], 0))


def _q_reconciliation(query: str) -> bool:
    values = _values(query, frozenset({"limit", "offset"}))
    if values is None:
        return False
    if "limit" in values and not _bounded_int(values["limit"], 1, 100):
        return False
    return not ("offset" in values and not _bounded_int(values["offset"], 0))


def _route(
    method: str,
    tail: str,
    query: _QueryCheck | None = None,
) -> _Route:
    return _Route(method, re.compile(rf"\A{tail}\Z"), query)


# Exact staff route tails beneath the fixed Parks root.
_STAFF_ROUTES: tuple[_Route, ...] = (
    # Catalog
    _route("GET", rf"/catalog/{_CATALOG_KIND}", _q_catalog_list),
    _route("POST", rf"/catalog/{_CATALOG_KIND}"),
    _route("GET", rf"/catalog/{_CATALOG_KIND}/{_UUID}", _q_catalog_get),
    _route("PUT", rf"/catalog/{_CATALOG_KIND}/{_UUID}"),
    # Resource closures
    _route("GET", rf"/resources/{_UUID}/closures"),
    _route("POST", rf"/resources/{_UUID}/closures"),
    _route("DELETE", rf"/resources/{_UUID}/closures/{_UUID}"),
    # Households and participants
    _route("POST", r"/households"),
    _route("GET", r"/households", _q_household_search),
    _route("GET", rf"/households/{_UUID}"),
    _route("GET", rf"/households/{_UUID}/participants"),
    _route("POST", r"/participants"),
    _route("PUT", rf"/participants/{_UUID}"),
    # Bookings and availability
    _route("GET", r"/bookings", _q_booking_list),
    _route("POST", r"/bookings"),
    _route("GET", rf"/bookings/{_UUID}"),
    _route("POST", rf"/bookings/{_UUID}/transition"),
    _route("POST", rf"/bookings/{_UUID}/reschedule"),
    _route("GET", rf"/resources/{_UUID}/availability", _q_availability),
    # Sessions and registrations
    _route("GET", r"/sessions", _q_session_list),
    _route("POST", r"/sessions"),
    _route("GET", rf"/sessions/{_UUID}"),
    _route("PUT", rf"/sessions/{_UUID}"),
    _route("GET", rf"/sessions/{_UUID}/roster"),
    _route("POST", r"/registrations"),
    _route("GET", rf"/registrations/{_UUID}"),
    _route("POST", rf"/registrations/{_UUID}/cancel"),
    _route("POST", rf"/registrations/{_UUID}/check-in"),
    _route("GET", rf"/households/{_UUID}/registrations"),
    # Finance, payments, reconciliation, checkout, notifications
    _route("GET", rf"/obligations/{_UUID}"),
    _route("GET", rf"/obligations/{_UUID}/receipt"),
    _route("POST", rf"/obligations/{_UUID}/offline-payment"),
    _route("POST", rf"/obligations/{_UUID}/offline-refund"),
    _route("GET", r"/reconciliation", _q_reconciliation),
    _route("POST", r"/refunds"),
    _route("GET", rf"/refunds/{_UUID}"),
    _route("GET", rf"/checkouts/{_UUID}"),
    _route("GET", rf"/notifications/{_NOTIFICATION_KIND}/{_UUID}"),
    _route("GET", r"/settings/payments"),
    _route("PUT", r"/settings/payments"),
    # Private archives and attachment metadata.  The attachment content
    # response is intentionally excluded; it has a separate binary forwarder.
    _route("POST", rf"/archives/{_RECORD_KIND}/{_UUID}/preview"),
    _route("POST", rf"/archives/{_RECORD_KIND}/{_UUID}/records"),
    _route("POST", rf"/attachments/{_RECORD_KIND}/{_UUID}"),
    _route("GET", rf"/attachments/{_RECORD_KIND}/{_UUID}"),
    _route("GET", r"/reports/aggregate"),
    # Maintenance links
    _route("POST", rf"/resources/{_UUID}/maintenance"),
    _route("GET", rf"/resources/{_UUID}/maintenance"),
    _route("GET", rf"/maintenance/{_UUID}"),
)


_DATA_ROUTES: tuple[_Route, ...] = (
    _route("GET", rf"{_DATA_ROOT}"),
    _route("GET", rf"{_DATA_ROOT}/revisions/{_UUID}"),
    _route("POST", rf"{_DATA_ROOT}/preview"),
    _route("POST", rf"{_DATA_ROOT}/publish"),
)


def _staff_relative_path(path: str) -> str | None:
    """Return the route tail beneath the exact Parks root."""
    if not path.startswith("/") or path.startswith("//"):
        return None
    if "?" in path or "#" in path:
        return None
    if path.startswith(_STAFF_ROOT + "/"):
        return path[len(_STAFF_ROOT):]
    return None


def _match_staff(method: str, path: str, query: str) -> bool:
    relative = _staff_relative_path(path)
    if relative is None:
        return False
    for route in _STAFF_ROUTES:
        if route.method != method or route.pattern.fullmatch(relative) is None:
            continue
        if route.query is None:
            return query == ""
        return route.query(query)
    return False


def _match_data(method: str, path: str, query: str) -> bool:
    for route in _DATA_ROUTES:
        if route.method != method or route.pattern.fullmatch(path) is None:
            continue
        if route.query is None:
            return query == ""
        return route.query(query)
    return False


def parks_route(method: str, path: str, query: str) -> bool:
    """Return true only for an exact supplied Parks staff route."""
    return _match_staff(method, path, query)


def parks_data_route(method: str, path: str, query: str) -> bool:
    """Return true only for an exact fixed Parks data route."""
    return _match_data(method, path, query)
