# SPDX-License-Identifier: AGPL-3.0-only
"""Publisher-only cache of the public parks catalogue.

Only the public bridge projection is accepted and stored here.  Private
household, participant, contact, accommodation and attachment data never
belong in this cache.
"""
import hashlib
import hmac
import json
import re
import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import ParksCatalog
from .resident_inbox import _fernet, _private_denied

CATALOG_ID = 1
MAX_REQUEST_BYTES = 2 * 1024 * 1024
MAX_RESOURCES = 500
MAX_PROGRAMS = 500
MAX_SESSIONS = 2000
MAX_CLOSURES = 1000
MAX_AGE = timedelta(hours=24)
SHA256 = re.compile(r"[0-9a-f]{64}")
CLOCK = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
CURRENCY = re.compile(r"[A-Z]{3}")
DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}

CATALOG_KEYS = {"resources", "programs", "sessions", "closures"}
RESOURCE_KEYS = {
    "id", "revision", "name", "address", "timezone", "description",
    "amenities", "accessibility", "hours", "approval_required",
    "buffer_before_minutes", "buffer_after_minutes", "fee_cents",
    "deposit_cents", "currency",
}
PROGRAM_KEYS = {
    "id", "revision", "title", "description", "timezone", "min_age",
    "max_age", "eligibility_text", "accessibility",
}
SESSION_KEYS = {
    "id", "program_id", "revision", "starts_at", "ends_at", "capacity",
    "available_seats", "fee_cents", "currency", "state",
}
CLOSURE_KEYS = {"id", "resource_id", "starts_at", "ends_at"}

MAX_NAME = 200
MAX_ADDRESS = 1000
MAX_DESCRIPTION = 10000
MAX_ACCESSIBILITY = 5000
MAX_ELIGIBILITY = 5000
MAX_AMENITY = 200
MAX_AMENITIES = 100
MAX_TIMEZONE = 255
MAX_STATE = 64
MAX_REVISION = 2 ** 63 - 1
MAX_CAPACITY = 2 ** 31 - 1
MAX_MONEY = 100_000_000
MAX_BUFFER = 1440
MAX_AGE_YEARS = 120


class CatalogRejected(Exception):
    """The publisher supplied an invalid or incomplete catalogue."""


class CatalogDigestConflict(CatalogRejected):
    """The supplied digest does not match the canonical public catalogue."""


def _reject(message):
    raise CatalogRejected(message)


def _canonical(catalog):
    try:
        return json.dumps(
            catalog,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise CatalogRejected("Invalid catalogue") from exc


def _text(value, maximum, required=False):
    if not isinstance(value, str) or len(value) > maximum:
        _reject("Invalid catalogue text")
    if required and not value:
        _reject("Invalid catalogue text")
    return value


def _int(value, low, high):
    if isinstance(value, bool) or not isinstance(value, int):
        _reject("Invalid catalogue number")
    if not low <= value <= high:
        _reject("Invalid catalogue number")
    return value


def _money(value):
    return _int(value, 0, MAX_MONEY)


def _age(value):
    return None if value is None else _int(value, 0, MAX_AGE_YEARS)


def _identifier(value):
    if not isinstance(value, str) or len(value) > 36:
        _reject("Invalid catalogue identifier")
    try:
        return value, uuid.UUID(value)
    except (ValueError, AttributeError) as exc:
        raise CatalogRejected("Invalid catalogue identifier") from exc


def _timestamp(value):
    if not isinstance(value, str) or not value or len(value) > 40:
        _reject("Invalid catalogue timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise CatalogRejected("Invalid catalogue timestamp") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        _reject("Invalid catalogue timestamp")
    return value, parsed


def _timezone_name(value):
    _text(value, MAX_TIMEZONE, required=True)
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        _reject("Invalid catalogue timezone")
    return value


def _minutes(value, end):
    if end and value == "24:00":
        return 1440
    if not isinstance(value, str) or not CLOCK.fullmatch(value):
        _reject("Invalid catalogue hours")
    return int(value[:2]) * 60 + int(value[3:])


def _hours(value):
    if not isinstance(value, dict):
        _reject("Invalid catalogue hours")
    for day, windows in value.items():
        if day not in DAYS or not isinstance(windows, list) or len(windows) > 4:
            _reject("Invalid catalogue hours")
        previous = None
        for window in windows:
            if not isinstance(window, list) or len(window) != 2:
                _reject("Invalid catalogue hours")
            start = _minutes(window[0], False)
            stop = _minutes(window[1], True)
            if start >= stop or (previous is not None and start < previous):
                _reject("Invalid catalogue hours")
            previous = stop
    return value


def _amenities(value):
    if not isinstance(value, list) or len(value) > MAX_AMENITIES:
        _reject("Invalid catalogue amenities")
    for item in value:
        _text(item, MAX_AMENITY, required=True)
    return value


def _currency(value):
    if not isinstance(value, str) or not CURRENCY.fullmatch(value):
        _reject("Invalid catalogue currency")
    return value


def _array(data, name, maximum):
    value = data[name]
    if not isinstance(value, list) or len(value) > maximum:
        _reject("Invalid catalogue array")
    return value


def _resource(item, resources):
    if not isinstance(item, dict) or set(item) != RESOURCE_KEYS:
        _reject("Invalid catalogue resource fields")
    ident, parsed = _identifier(item["id"])
    if parsed in resources:
        _reject("Duplicate catalogue resource")
    resources.add(parsed)
    if not isinstance(item["approval_required"], bool):
        _reject("Invalid catalogue approval flag")
    return {
        "id": ident,
        "revision": _int(item["revision"], 1, MAX_REVISION),
        "name": _text(item["name"], MAX_NAME, required=True),
        "address": _text(item["address"], MAX_ADDRESS, required=True),
        "timezone": _timezone_name(item["timezone"]),
        "description": _text(item["description"], MAX_DESCRIPTION),
        "amenities": _amenities(item["amenities"]),
        "accessibility": _text(item["accessibility"], MAX_ACCESSIBILITY),
        "hours": _hours(item["hours"]),
        "approval_required": item["approval_required"],
        "buffer_before_minutes": _int(item["buffer_before_minutes"], 0, MAX_BUFFER),
        "buffer_after_minutes": _int(item["buffer_after_minutes"], 0, MAX_BUFFER),
        "fee_cents": _money(item["fee_cents"]),
        "deposit_cents": _money(item["deposit_cents"]),
        "currency": _currency(item["currency"]),
    }


def _program(item, programs):
    if not isinstance(item, dict) or set(item) != PROGRAM_KEYS:
        _reject("Invalid catalogue program fields")
    ident, parsed = _identifier(item["id"])
    if parsed in programs:
        _reject("Duplicate catalogue program")
    programs.add(parsed)
    age_min = _age(item["min_age"])
    age_max = _age(item["max_age"])
    if age_min is not None and age_max is not None and age_min > age_max:
        _reject("Invalid catalogue program ages")
    return {
        "id": ident,
        "revision": _int(item["revision"], 1, MAX_REVISION),
        "title": _text(item["title"], MAX_NAME, required=True),
        "description": _text(item["description"], MAX_DESCRIPTION),
        "timezone": _timezone_name(item["timezone"]),
        "min_age": age_min,
        "max_age": age_max,
        "eligibility_text": _text(item["eligibility_text"], MAX_ELIGIBILITY),
        "accessibility": _text(item["accessibility"], MAX_ACCESSIBILITY),
    }


def _session(item, sessions, programs):
    if not isinstance(item, dict) or set(item) != SESSION_KEYS:
        _reject("Invalid catalogue session fields")
    ident, parsed = _identifier(item["id"])
    if parsed in sessions:
        _reject("Duplicate catalogue session")
    sessions.add(parsed)
    program_id, program = _identifier(item["program_id"])
    if program not in programs:
        _reject("Unknown catalogue program")
    starts, start = _timestamp(item["starts_at"])
    ends, end = _timestamp(item["ends_at"])
    if end <= start:
        _reject("Invalid catalogue session range")
    capacity = _int(item["capacity"], 1, MAX_CAPACITY)
    available = _int(item["available_seats"], 0, capacity)
    return {
        "id": ident,
        "program_id": program_id,
        "revision": _int(item["revision"], 1, MAX_REVISION),
        "starts_at": starts,
        "ends_at": ends,
        "capacity": capacity,
        "available_seats": available,
        "fee_cents": _money(item["fee_cents"]),
        "currency": _currency(item["currency"]),
        "state": _text(item["state"], MAX_STATE),
    }


def _closure(item, closures, resources):
    if not isinstance(item, dict) or set(item) != CLOSURE_KEYS:
        _reject("Invalid catalogue closure fields")
    ident, parsed = _identifier(item["id"])
    if parsed in closures:
        _reject("Duplicate catalogue closure")
    closures.add(parsed)
    resource_id, resource = _identifier(item["resource_id"])
    if resource not in resources:
        _reject("Unknown catalogue resource")
    starts, start = _timestamp(item["starts_at"])
    ends, end = _timestamp(item["ends_at"])
    if end <= start:
        _reject("Invalid catalogue closure range")
    return {
        "id": ident,
        "resource_id": resource_id,
        "starts_at": starts,
        "ends_at": ends,
    }


def _validate(data):
    if not isinstance(data, dict) or set(data) != {"catalog", "sha256"}:
        _reject("Invalid catalogue fields")
    catalog = data["catalog"]
    digest = data["sha256"]
    if not isinstance(catalog, dict) or set(catalog) != CATALOG_KEYS:
        _reject("Invalid catalogue fields")
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        _reject("Invalid catalogue digest")

    resources = set()
    programs = set()
    sessions = set()
    closures = set()
    clean = {
        "resources": [
            _resource(item, resources)
            for item in _array(catalog, "resources", MAX_RESOURCES)
        ],
        "programs": [
            _program(item, programs)
            for item in _array(catalog, "programs", MAX_PROGRAMS)
        ],
        "sessions": [
            _session(item, sessions, programs)
            for item in _array(catalog, "sessions", MAX_SESSIONS)
        ],
        "closures": [
            _closure(item, closures, resources)
            for item in _array(catalog, "closures", MAX_CLOSURES)
        ],
    }
    if not hmac.compare_digest(
            hashlib.sha256(_canonical(clean)).hexdigest(), digest):
        raise CatalogDigestConflict("Catalogue digest mismatch")
    return clean, digest


def _empty():
    return {"resources": [], "programs": [], "sessions": [], "closures": []}


def _request_json(request):
    if len(request.body) > MAX_REQUEST_BYTES:
        _reject("Catalogue request too large")
    try:
        return json.loads(request.body)
    except (ValueError, UnicodeError) as exc:
        raise CatalogRejected("Invalid JSON request") from exc


@csrf_exempt
@require_POST
def receive_catalog(request):
    """Accept one publisher-signed public catalogue and replace it atomically."""
    denied = _private_denied(request)
    if denied is not None:
        return denied
    try:
        _fernet()
        catalog, digest = _validate(_request_json(request))
        with transaction.atomic():
            row, _ = ParksCatalog.objects.select_for_update().get_or_create(
                pk=CATALOG_ID,
                defaults={"catalog": _empty(), "sha256": "", "updated_at": timezone.now()},
            )
            row.catalog = catalog
            row.sha256 = digest
            row.updated_at = timezone.now()
            row.save(update_fields=("catalog", "sha256", "updated_at"))
            updated_at = row.updated_at
    except CatalogDigestConflict:
        return JsonResponse({"detail": "Catalogue digest mismatch"}, status=409)
    except CatalogRejected as exc:
        return JsonResponse({"detail": str(exc)}, status=422)
    except Exception:  # noqa: BLE001 - safe response hides storage internals
        return JsonResponse({"detail": "Parks catalogue unavailable"}, status=503)
    return JsonResponse({
        "sha256": digest,
        "counts": {name: len(catalog[name]) for name in CATALOG_KEYS},
        "updated_at": updated_at.isoformat(),
    })


def read_catalog(request=None):
    """Return the cached public catalogue dict, expiring it after 24 hours."""
    try:
        row = ParksCatalog.objects.filter(pk=CATALOG_ID).first()
    except Exception:  # noqa: BLE001 - never leak storage internals
        raise RuntimeError("Parks catalogue unavailable") from None
    if row is None:
        return {
            "catalog": _empty(), "sha256": "", "updated_at": None,
            "available": False,
        }
    updated_at = row.updated_at
    stamp = updated_at.isoformat() if updated_at is not None else None
    digest = row.sha256 if isinstance(row.sha256, str) else ""
    try:
        catalog, checked_digest = _validate({
            "catalog": row.catalog,
            "sha256": row.sha256,
        })
        fresh = (
            updated_at is not None
            and not timezone.is_naive(updated_at)
            and timezone.now() - updated_at <= MAX_AGE
        )
    except CatalogRejected:
        catalog, checked_digest, fresh = None, "", False
    if not fresh:
        return {
            "catalog": _empty(), "sha256": digest, "updated_at": stamp,
            "available": False,
        }
    return {
        "catalog": catalog,
        "sha256": checked_digest,
        "updated_at": stamp,
        "available": True,
    }
