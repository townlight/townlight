# SPDX-License-Identifier: AGPL-3.0-only
"""Durable, encrypted resident-command inbox for the 311 worker.

Public forms and URL wiring are intentionally out of scope.  The only HTTP
entry points here are the private worker claim/acknowledge views; ownership
lookups and enqueueing are ordinary service functions.
"""
import hashlib
import hmac
import json
import os
import re
import uuid
from datetime import timedelta
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from django.core.exceptions import DisallowedHost
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import ResidentCommand
from .publisher_receiver import service_allowed

MAX_PAYLOAD_BYTES = 14 * 1024**2
MAX_RESULT_BYTES = 14 * 1024**2
MAX_REQUEST_BYTES = 15 * 1024**2
LEASE_SECONDS = 120
CLAIM_LIMIT = 10
RATE_WINDOW = timedelta(hours=1)
SHA256 = re.compile(r"[0-9a-f]{64}")
LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "[::1]", "::1"}
LOOPBACK_REMOTES = {"127.0.0.1", "::1"}
OPERATIONS = {value for value, _ in ResidentCommand.OPERATIONS}


class ResidentInboxUnavailable(Exception):
    """The configured resident key or stored ciphertext is unavailable."""


class ResidentInboxRejected(Exception):
    status = 400
    detail = "Invalid resident command"

    def __init__(self, detail=None):
        if detail:
            self.detail = detail


class ResidentInboxConflict(ResidentInboxRejected):
    status = 409
    detail = "Resident command conflict"


class ResidentInboxNotFound(ResidentInboxRejected):
    status = 404
    detail = "Resident command not found"


class ResidentInboxTooLarge(ResidentInboxRejected):
    status = 413
    detail = "Resident command too large"


class ResidentInboxRateLimited(ResidentInboxRejected):
    status = 429
    detail = "Resident command rate limit exceeded"


def _canonical(value, too_large):
    try:
        body = json.dumps(value, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise ResidentInboxRejected("Invalid JSON") from exc
    if len(body) > too_large:
        raise ResidentInboxTooLarge
    return body


def _fernet():
    """Load an explicit absolute key file on every operation; no fallbacks."""
    configured = os.environ.get("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", "")
    if not configured:
        raise ResidentInboxUnavailable
    path = Path(configured)
    if not path.is_absolute():
        raise ResidentInboxUnavailable
    try:
        key = path.read_bytes().strip()
    except OSError as exc:
        raise ResidentInboxUnavailable from exc
    if not key:
        raise ResidentInboxUnavailable
    try:
        return Fernet(key)
    except (ValueError, TypeError) as exc:
        raise ResidentInboxUnavailable from exc


def _owner_digest(session_key):
    if not isinstance(session_key, str) or not session_key or len(session_key) > 4096:
        raise ResidentInboxRejected("Invalid owner session")
    return hashlib.sha256(session_key.encode("utf-8")).hexdigest()


def _command_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError) as exc:
        raise ResidentInboxRejected("Invalid command id") from exc


def _same(left, right):
    return hmac.compare_digest(str(left), str(right))


def _hour_limit():
    try:
        value = int(os.environ.get("TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", "100"))
    except ValueError:
        value = 100
    return max(10, min(100, value))


def _decrypt(cipher, value):
    try:
        return json.loads(cipher.decrypt(value.encode("ascii")).decode("utf-8"))
    except (InvalidToken, ValueError, UnicodeError) as exc:
        raise ResidentInboxUnavailable from exc


def enqueue(session_key, operation, payload, command_id):
    """Persist one encrypted command, idempotent on its caller-supplied id."""
    owner = _owner_digest(session_key)
    if operation not in OPERATIONS:
        raise ResidentInboxRejected("Unknown resident operation")
    command_id = _command_uuid(command_id)
    body = _canonical(payload, MAX_PAYLOAD_BYTES)
    digest = hashlib.sha256(body).hexdigest()
    cipher = _fernet()
    now = timezone.now()
    with transaction.atomic():
        existing = ResidentCommand.objects.select_for_update().filter(pk=command_id).first()
        if existing is not None:
            if (_same(existing.owner_session_digest64, owner)
                    and existing.operation == operation
                    and _same(existing.payload_sha256, digest)):
                return existing
            raise ResidentInboxConflict
        recent = ResidentCommand.objects.filter(
            owner_session_digest64=owner, created_at__gte=now - RATE_WINDOW,
        ).count()
        if recent >= _hour_limit():
            raise ResidentInboxRateLimited
        try:
            return ResidentCommand.objects.create(
                id=command_id,
                owner_session_digest64=owner,
                operation=operation,
                encrypted_payload=cipher.encrypt(body).decode("ascii"),
                payload_sha256=digest,
                state="queued",
            )
        except IntegrityError as exc:
            raise ResidentInboxConflict from exc


def read_owned(session_key, command_id):
    """Return a completed result only to the browser session that owns it."""
    owner = _owner_digest(session_key)
    command_id = _command_uuid(command_id)
    cipher = _fernet()
    row = ResidentCommand.objects.filter(pk=command_id).first()
    if row is None or not _same(row.owner_session_digest64, owner):
        raise ResidentInboxNotFound
    result = None
    if row.state in ("completed", "failed") and row.encrypted_result:
        result = _decrypt(cipher, row.encrypted_result)
    return {
        "id": str(row.id),
        "state": row.state,
        "operation": row.operation,
        "payload_sha256": row.payload_sha256,
        "result": result,
    }


def _claim_owner(owner=None, limit=CLAIM_LIMIT):
    try:
        limit = max(1, min(CLAIM_LIMIT, int(limit)))
    except (TypeError, ValueError) as exc:
        raise ResidentInboxRejected("Invalid claim limit") from exc
    cipher = _fernet()
    now = timezone.now()
    claimed = []
    with transaction.atomic():
        candidates_query = ResidentCommand.objects.select_for_update()
        if owner is not None:
            candidates_query = candidates_query.filter(owner_session_digest64=owner)
        candidates = list(
            candidates_query.filter(
                Q(state="queued") | Q(state="claimed", lease_until__lt=now)
            ).order_by("created_at", "id")[:limit]
        )
        for row in candidates:
            lease_id = uuid.uuid4()
            lease_until = now + timedelta(seconds=LEASE_SECONDS)
            changed = ResidentCommand.objects.filter(pk=row.pk).filter(
                Q(state="queued") | Q(state="claimed", lease_until__lt=now)
            ).update(
                state="claimed", lease_id=lease_id, lease_until=lease_until,
                updated_at=now,
            )
            if not changed:
                continue
            row.refresh_from_db()
            claimed.append({
                "id": str(row.id),
                "operation": row.operation,
                "payload": _decrypt(cipher, row.encrypted_payload),
                "payload_sha256": row.payload_sha256,
                "owner_session_digest64": row.owner_session_digest64,
                "lease_id": str(lease_id),
                "lease_until": lease_until.isoformat(),
            })
    return claimed


def claim_commands(session_key, limit=CLAIM_LIMIT):
    """Atomically lease up to ten queued or expired-claimed commands."""
    return _claim_owner(_owner_digest(session_key), limit)


def _acknowledge_owner(owner, command_id, lease_id, payload_sha256,
                       result, failed=False):
    command_id = _command_uuid(command_id)
    lease_id = _command_uuid(lease_id)
    if not isinstance(payload_sha256, str) or not SHA256.fullmatch(payload_sha256):
        raise ResidentInboxRejected("Invalid payload fingerprint")
    body = _canonical(result, MAX_RESULT_BYTES)
    cipher = _fernet()
    state = "failed" if failed else "completed"
    now = timezone.now()
    with transaction.atomic():
        row = ResidentCommand.objects.select_for_update().filter(pk=command_id).first()
        if row is None or not _same(row.owner_session_digest64, owner):
            raise ResidentInboxNotFound
        if (row.state != "claimed" or row.lease_id != lease_id
                or row.lease_until is None or row.lease_until <= now):
            raise ResidentInboxConflict("Lease is stale or expired")
        if not _same(row.payload_sha256, payload_sha256):
            raise ResidentInboxConflict("Payload fingerprint mismatch")
        changed = ResidentCommand.objects.filter(
            pk=command_id,
            owner_session_digest64=owner,
            state="claimed",
            lease_id=lease_id,
            lease_until__gt=now,
            payload_sha256=payload_sha256,
        ).update(
            state=state,
            encrypted_result=cipher.encrypt(body).decode("ascii"),
            lease_id=None,
            lease_until=None,
            updated_at=now,
        )
        if not changed:
            raise ResidentInboxConflict("Lease is stale or expired")
    return {"id": str(command_id), "state": state}


def acknowledge_command(session_key, command_id, lease_id, payload_sha256,
                        result, failed=False):
    """Complete a still-valid lease and persist the encrypted result."""
    return _acknowledge_owner(
        _owner_digest(session_key), command_id, lease_id, payload_sha256,
        result, failed,
    )


def _hostname(request):
    try:
        host = request.get_host().strip().lower()
    except DisallowedHost:
        return ""
    if host.startswith("["):
        end = host.find("]")
        if end != -1:
            return host[:end + 1]
    return host.split(":")[0]


def _private_denied(request):
    """Gate worker endpoints; never trust forwarding headers."""
    host = _hostname(request)
    loopback_host = host in LOOPBACK_HOSTS
    loopback_remote = request.META.get("REMOTE_ADDR", "") in LOOPBACK_REMOTES
    if not request.is_secure() and not (loopback_host and loopback_remote):
        return JsonResponse({"detail": "HTTPS required"}, status=403)
    if not host or not service_allowed(request):
        return JsonResponse({"detail": "Publisher authorization required"}, status=401)
    return None


def _json_body(request, maximum):
    raw = request.body
    if len(raw) > maximum:
        raise ResidentInboxTooLarge
    try:
        data = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise ResidentInboxRejected("Invalid JSON request") from exc
    if not isinstance(data, dict):
        raise ResidentInboxRejected("Invalid JSON request")
    return data


def _owner_from(data):
    key = data.get("session_key")
    if isinstance(key, str):
        return _owner_digest(key)
    digest = data.get("owner_session_digest64")
    if isinstance(digest, str) and SHA256.fullmatch(digest):
        return digest
    raise ResidentInboxRejected("Invalid owner session")


def _error(exc):
    if isinstance(exc, ResidentInboxRejected):
        return JsonResponse({"detail": exc.detail}, status=exc.status)
    return JsonResponse({"detail": "Resident inbox unavailable"}, status=503)


@csrf_exempt
@require_POST
def claim(request):
    guard = _private_denied(request)
    if guard is not None:
        return guard
    try:
        data = _json_body(request, 16 * 1024)
        if "session_key" in data or "owner_session_digest64" in data:
            owner = _owner_from(data)
        else:
            owner = None
        commands = _claim_owner(owner, CLAIM_LIMIT)
    except Exception as exc:  # noqa: BLE001 - generic 503 must hide internals
        return _error(exc)
    return JsonResponse({"commands": commands})


@csrf_exempt
@require_POST
def acknowledge(request):
    guard = _private_denied(request)
    if guard is not None:
        return guard
    try:
        data = _json_body(request, MAX_REQUEST_BYTES)
        if "result" not in data:
            raise ResidentInboxRejected("Result required")
        failed = data.get("failed", False)
        if not isinstance(failed, bool):
            raise ResidentInboxRejected("Invalid failed flag")
        failed = failed or data.get("outcome") == "failed"
        outcome = _acknowledge_owner(
            _owner_from(data),
            data.get("id"),
            data.get("lease_id"),
            data.get("payload_sha256"),
            data["result"],
            failed,
        )
    except Exception as exc:  # noqa: BLE001 - generic 503 must hide internals
        return _error(exc)
    return JsonResponse(outcome)
