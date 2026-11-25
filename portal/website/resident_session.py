# SPDX-License-Identifier: AGPL-3.0-only
"""Encrypted server-session vault and create/recovery submission helpers.

Only one session value is used: ``resident_311_vault``.  It always holds a
Fernet ciphertext produced with the explicit resident-inbox key.  Plaintext
tokens and pending create identities never touch the browser session.
"""
import hmac
import json
import re
import secrets
import uuid

from .resident_inbox import _fernet, enqueue, read_owned

VAULT_KEY = "resident_311_vault"
PENDING_LIMIT = 50
_TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{32,128}")
_TRACKING_RE = re.compile(
    r"(?:TL311-([a-f0-9]{32})|([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-"
    r"[a-f0-9]{4}-[a-f0-9]{12}))",
    re.IGNORECASE,
)


class ResidentSessionError(Exception):
    detail = "Resident session unavailable"


class ResidentSessionRejected(ResidentSessionError):
    detail = "Invalid resident session request"


class ResidentSessionNotFound(ResidentSessionError):
    detail = "Resident record not found"


def _cipher():
    try:
        return _fernet()
    except Exception:
        raise ResidentSessionError from None


def _command_id(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, AttributeError, TypeError):
        raise ResidentSessionRejected from None


def _token(value):
    if not isinstance(value, str) or not _TOKEN_RE.fullmatch(value):
        raise ResidentSessionRejected
    return value


def _ensure_session(session):
    key = getattr(session, "session_key", None)
    if not key:
        create = getattr(session, "create", None)
        if create is None:
            raise ResidentSessionError
        create()
        key = session.session_key
    if not key:
        raise ResidentSessionError
    return key


def _load(session):
    raw = session.get(VAULT_KEY) if hasattr(session, "get") else None
    if raw in (None, ""):
        return {"credentials": {}, "pending": {}}
    try:
        plaintext = _cipher().decrypt(str(raw).encode("ascii")).decode("utf-8")
        data = json.loads(plaintext)
    except Exception:
        raise ResidentSessionError from None
    if not isinstance(data, dict):
        raise ResidentSessionError
    credentials = data.get("credentials", {})
    pending = data.get("pending", {})
    if not isinstance(credentials, dict) or not isinstance(pending, dict):
        raise ResidentSessionError
    return {"credentials": dict(credentials), "pending": dict(pending)}


def _store(session, vault):
    _ensure_session(session)
    try:
        body = json.dumps(
            vault, sort_keys=False, separators=(",", ":"), ensure_ascii=False
        ).encode("utf-8")
        session[VAULT_KEY] = _cipher().encrypt(body).decode("ascii")
    except Exception:
        raise ResidentSessionError from None


def _add_pending(vault, command_id, token):
    vault["pending"][command_id] = token
    if len(vault["pending"]) > PENDING_LIMIT:
        for stale in list(vault["pending"])[:-PENDING_LIMIT]:
            del vault["pending"][stale]


def normalize_tracking(value):
    """Return the canonical ``TL311-<32 hex>`` tracking identity."""
    text = value.strip() if isinstance(value, str) else ""
    match = _TRACKING_RE.fullmatch(text)
    if not match:
        raise ResidentSessionRejected
    try:
        digits = match.group(1) or uuid.UUID(text).hex
    except (ValueError, AttributeError, TypeError):
        raise ResidentSessionRejected from None
    return "TL311-" + digits.lower()


def save_credential(session, request_id, token):
    """Persist the current token for a request, rotating any previous value."""
    request_id = _command_id(request_id)
    token = _token(token)
    vault = _load(session)
    vault["credentials"][request_id] = token
    _store(session, vault)
    return request_id


def credential(session, request_id):
    """Return the currently stored token for a request, or ``None``."""
    request_id = _command_id(request_id)
    value = _load(session)["credentials"].get(request_id)
    return value if isinstance(value, str) else None


def lookup(session, token):
    """Return the request id currently holding ``token``, or ``None``."""
    token = _token(token)
    for request_id, stored in _load(session)["credentials"].items():
        if isinstance(stored, str) and hmac.compare_digest(stored, token):
            return request_id
    return None


def pending_token(session, command_id):
    """Return the encrypted-vault pending token for a command, if retained."""
    command_id = _command_id(command_id)
    value = _load(session)["pending"].get(command_id)
    return value if isinstance(value, str) else None


def submit(session, operation, payload, command_id):
    """Queue one resident command under the real Django session identity."""
    command_id = _command_id(command_id)
    session_key = _ensure_session(session)
    row = enqueue(session_key, operation, payload, command_id)
    return str(row.id)


def create_request(session, *, category, description, location,
                   contact_name="", email="", phone="", command_id):
    """Queue a create with a token stable across retries of ``command_id``."""
    command_id = _command_id(command_id)
    vault = _load(session)
    token = vault["pending"].get(command_id)
    if not isinstance(token, str):
        token = secrets.token_urlsafe(32)
        _add_pending(vault, command_id, token)
        _store(session, vault)
    payload = {
        "category": str(category),
        "description": str(description),
        "location": str(location),
        "contact": {
            "name": str(contact_name or ""),
            "email": str(email or ""),
            "phone": str(phone or ""),
        },
        "resident_token": token,
    }
    return submit(session, "create_request", payload, command_id)


def status(session, command_id):
    """Read a command only through the session that owns it."""
    command_id = _command_id(command_id)
    session_key = getattr(session, "session_key", None)
    if not session_key:
        raise ResidentSessionNotFound
    return read_owned(session_key, command_id)


def mark_successful(session, command_id):
    """Map a completed create result's request id to its pending token.

    Nothing is mapped until the inbox reports ``completed``; failed or still
    queued commands keep their pending identity for an idempotent retry.
    """
    command_id = _command_id(command_id)
    completed = status(session, command_id)
    if completed.get("state") != "completed":
        return None
    result = completed.get("result")
    if not isinstance(result, dict):
        return None
    try:
        request_id = _command_id(result.get("id"))
    except ResidentSessionRejected:
        return None
    vault = _load(session)
    token = vault["pending"].get(command_id)
    if not isinstance(token, str):
        return None
    vault["credentials"][request_id] = token
    _store(session, vault)
    return request_id


def begin_recovery(session, tracking, email, command_id):
    """Queue a recovery start with a normalized TL311 tracking identity."""
    return submit(
        session,
        "begin_recovery",
        {"tracking": normalize_tracking(tracking), "email": str(email or "")},
        _command_id(command_id),
    )


def complete_recovery(session, challenge_id, code, command_id, new_token=None):
    """Queue redemption with a replacement token stable per command."""
    command_id = _command_id(command_id)
    challenge_id = _command_id(challenge_id)
    if not isinstance(code, str) or not re.fullmatch(r"\d{6}", code):
        raise ResidentSessionRejected
    vault = _load(session)
    token = vault["pending"].get(command_id)
    if not isinstance(token, str):
        token = _token(new_token) if new_token is not None else secrets.token_urlsafe(32)
        _add_pending(vault, command_id, token)
        _store(session, vault)
    return submit(
        session,
        "complete_recovery",
        {"challenge_id": challenge_id, "code": code, "new_token": token},
        command_id,
    )


def mark_recovered(session, command_id):
    """Rotate the request credential after a completed recovery command."""
    command_id = _command_id(command_id)
    completed = status(session, command_id)
    if completed.get("state") != "completed":
        return None
    result = completed.get("result")
    if not isinstance(result, dict) or result.get("recovered") is not True:
        return None
    request = result.get("request")
    if not isinstance(request, dict):
        return None
    try:
        request_id = _command_id(request.get("id"))
    except ResidentSessionRejected:
        return None
    vault = _load(session)
    token = vault["pending"].get(command_id)
    if not isinstance(token, str):
        return None
    vault["credentials"][request_id] = token
    _store(session, vault)
    return request_id


__all__ = [
    "PENDING_LIMIT",
    "ResidentSessionError",
    "ResidentSessionNotFound",
    "ResidentSessionRejected",
    "VAULT_KEY",
    "begin_recovery",
    "complete_recovery",
    "create_request",
    "credential",
    "lookup",
    "mark_recovered",
    "mark_successful",
    "normalize_tracking",
    "pending_token",
    "save_credential",
    "status",
    "submit",
]
