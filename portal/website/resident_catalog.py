# SPDX-License-Identifier: AGPL-3.0-only
"""Publisher-only cache of the public 311 service-request catalogue.

The catalogue contains only public routing labels.  It is never derived from
resident submissions and it is read back as the same small, non-secret
projection that the publisher supplied.
"""
import hashlib
import hmac
import json
import re
from datetime import timedelta

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import ServiceRequestCatalog
from .resident_inbox import _fernet, _private_denied

CATALOG_ID = 311
MAX_REQUEST_BYTES = 256 * 1024
MAX_CATEGORIES = 500
MAX_AGE = timedelta(hours=24)
SHA256 = re.compile(r"[0-9a-f]{64}")
FIELDS = (("code", 64), ("name", 255), ("department", 255))
FIELD_NAMES = {name for name, _ in FIELDS}


class CatalogRejected(Exception):
    """The publisher supplied an invalid catalogue."""


class CatalogDigestConflict(CatalogRejected):
    """The supplied digest does not match the canonical categories."""


def _canonical(categories):
    try:
        return json.dumps(
            categories,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise CatalogRejected("Invalid catalogue") from exc


def _validate(data):
    if not isinstance(data, dict) or set(data) != {"categories", "sha256"}:
        raise CatalogRejected("Invalid catalogue fields")
    categories = data["categories"]
    digest = data["sha256"]
    if not isinstance(categories, list) or len(categories) > MAX_CATEGORIES:
        raise CatalogRejected("Invalid catalogue categories")
    if not isinstance(digest, str) or not SHA256.fullmatch(digest):
        raise CatalogRejected("Invalid catalogue digest")
    normalized = []
    seen = set()
    for item in categories:
        if not isinstance(item, dict) or set(item) != FIELD_NAMES:
            raise CatalogRejected("Invalid catalogue category fields")
        row = {}
        for name, maximum in FIELDS:
            value = item[name]
            if not isinstance(value, str):
                raise CatalogRejected("Invalid catalogue category")
            value = value.strip()
            if not value or len(value) > maximum:
                raise CatalogRejected("Invalid catalogue category")
            row[name] = value
        if row["code"] in seen:
            raise CatalogRejected("Duplicate catalogue code")
        seen.add(row["code"])
        normalized.append(row)
    if not hmac.compare_digest(hashlib.sha256(_canonical(normalized)).hexdigest(), digest):
        raise CatalogDigestConflict("Catalogue digest mismatch")
    return normalized, digest


def _public_categories(value):
    if not isinstance(value, list):
        return None
    result = []
    for item in value:
        if not isinstance(item, dict) or set(item) != FIELD_NAMES:
            return None
        row = {}
        for name, maximum in FIELDS:
            value = item[name]
            if not isinstance(value, str):
                return None
            value = value.strip()
            if not value or len(value) > maximum:
                return None
            row[name] = value
        result.append(row)
    return result


def read_catalog():
    """Return the cached public catalogue, or an explicitly unavailable one."""
    row = ServiceRequestCatalog.objects.filter(pk=CATALOG_ID).first()
    if row is None:
        return {
            "categories": [],
            "digest": "",
            "updated_at": None,
            "available": False,
        }
    categories = _public_categories(row.categories)
    updated_at = row.updated_at
    available = (
        categories is not None
        and updated_at is not None
        and timezone.now() - updated_at < MAX_AGE
    )
    return {
        "categories": categories if available else [],
        "digest": row.digest or "",
        "updated_at": updated_at.isoformat() if updated_at is not None else None,
        "available": available,
    }


def _request_json(request):
    if len(request.body) > MAX_REQUEST_BYTES:
        raise CatalogRejected("Catalogue request too large")
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeError) as exc:
        raise CatalogRejected("Invalid JSON request") from exc
    return data


@csrf_exempt
@require_POST
def receive_catalog(request):
    """Accept one publisher-signed public catalogue and replace it atomically."""
    denied = _private_denied(request)
    if denied is not None:
        return denied
    try:
        _fernet()
        categories, digest = _validate(_request_json(request))
        now = timezone.now()
        with transaction.atomic():
            row, _ = ServiceRequestCatalog.objects.select_for_update().get_or_create(
                pk=CATALOG_ID,
                defaults={"categories": [], "digest": "", "updated_at": now},
            )
            row.categories = categories
            row.digest = digest
            row.updated_at = now
            row.save(update_fields=("categories", "digest", "updated_at"))
    except CatalogDigestConflict:
        return JsonResponse({"detail": "Catalogue digest mismatch"}, status=409)
    except CatalogRejected as exc:
        return JsonResponse({"detail": str(exc)}, status=422)
    except Exception:  # noqa: BLE001 - generic 503 must hide keys and storage internals
        return JsonResponse({"detail": "Service catalogue unavailable"}, status=503)
    return JsonResponse({
        "digest": digest,
        "categories": len(categories),
        "updated_at": now.isoformat(),
    })
