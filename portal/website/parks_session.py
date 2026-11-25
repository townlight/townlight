# SPDX-License-Identifier: AGPL-3.0-only
"""Encrypted server-session helper for permitted parks commands."""
import json
import re
import uuid

from .resident_inbox import _fernet, enqueue, read_owned

VAULT_KEY = "resident_parks_vault"
PENDING_LIMIT = 50
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{32,128}\Z")
PARKS_OPERATIONS = frozenset({
    "parks_create_household",
    "parks_read_household",
    "parks_add_participant",
    "parks_update_participant",
    "parks_create_booking",
    "parks_cancel_booking",
    "parks_reschedule_booking",
    "parks_register",
    "parks_cancel_registration",
    "parks_availability",
    "parks_prepare_checkout",
    "parks_read_checkout",
})
_TOKENLESS = frozenset({"parks_create_household", "parks_availability"})


class ParksSessionError(Exception):
    detail = "Parks session unavailable"


class ParksSessionRejected(ParksSessionError):
    detail = "Invalid parks session request"


class ParksSessionNotFound(ParksSessionError):
    detail = "Parks record not found"


def _cipher():
    try:
        return _fernet()
    except Exception:
        raise ParksSessionError from None


def _token(value):
    if not isinstance(value, str) or not TOKEN_RE.fullmatch(value):
        raise ParksSessionRejected
    return value


def _uuid(value):
    if not isinstance(value, str):
        raise ParksSessionRejected
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        raise ParksSessionRejected from None
    if str(parsed) != value:
        raise ParksSessionRejected
    return value


def _ensure_session(session):
    key = getattr(session, "session_key", None)
    if not key:
        create = getattr(session, "create", None)
        if create is None:
            raise ParksSessionError
        create()
        key = session.session_key
    if not key:
        raise ParksSessionError
    return key


def _load(session):
    raw = session.get(VAULT_KEY) if hasattr(session, "get") else None
    if raw in (None, ""):
        return {"tracking_token": None, "household_id": None, "pending": {}}
    try:
        body = _cipher().decrypt(str(raw).encode("ascii")).decode("utf-8")
        data = json.loads(body)
    except Exception:
        raise ParksSessionError from None
    if not isinstance(data, dict):
        raise ParksSessionError
    token = data.get("tracking_token")
    household = data.get("household_id")
    pending = data.get("pending", {})
    if token is not None:
        _token(token)
    if household is not None:
        _uuid(household)
    if not isinstance(pending, dict):
        raise ParksSessionError
    return {"tracking_token": token, "household_id": household,
            "pending": dict(pending)}


def _store(session, vault):
    _ensure_session(session)
    try:
        body = json.dumps(vault, separators=(",", ":"),
                          ensure_ascii=False).encode("utf-8")
        session[VAULT_KEY] = _cipher().encrypt(body).decode("ascii")
    except Exception:
        raise ParksSessionError from None


def _pending(vault, command_id):
    vault["pending"][command_id] = None
    while len(vault["pending"]) > PENDING_LIMIT:
        del vault["pending"][next(iter(vault["pending"]))]


def save_credential(session, tracking_token, household_id=None):
    token = _token(tracking_token)
    household = _uuid(household_id) if household_id is not None else None
    vault = _load(session)
    vault["tracking_token"] = token
    vault["household_id"] = household
    _store(session, vault)


def credential(session):
    value = _load(session)["tracking_token"]
    return value if isinstance(value, str) else None


def household_id(session):
    value = _load(session)["household_id"]
    return value if isinstance(value, str) else None


def submit(session, operation, payload):
    if operation not in PARKS_OPERATIONS or not isinstance(payload, dict):
        raise ParksSessionRejected
    vault = _load(session)
    body = dict(payload)
    if "tracking_token" in body:
        raise ParksSessionRejected
    if operation not in _TOKENLESS:
        token = vault["tracking_token"]
        if not isinstance(token, str):
            raise ParksSessionRejected
        body["tracking_token"] = token
    key = _ensure_session(session)
    command_id = uuid.uuid4()
    row = enqueue(key, operation, body, command_id)
    stored = _uuid(str(row.id))
    _pending(vault, stored)
    _store(session, vault)
    return stored


def read(session, command_id):
    command_id = _uuid(command_id)
    session_key = getattr(session, "session_key", None)
    if not session_key:
        raise ParksSessionNotFound
    vault = _load(session)
    if command_id not in vault["pending"]:
        raise ParksSessionNotFound
    try:
        row = read_owned(session_key, command_id)
    except Exception:
        raise ParksSessionError from None
    if not isinstance(row, dict):
        raise ParksSessionError
    if (row.get("state") == "completed"
            and row.get("operation") == "parks_create_household"):
        result = row.get("result")
        if not isinstance(result, dict):
            raise ParksSessionError
        vault["tracking_token"] = _token(result.get("tracking_token"))
        vault["household_id"] = _uuid(result.get("id"))
        _store(session, vault)
    return row


__all__ = [
    "PARKS_OPERATIONS",
    "PENDING_LIMIT",
    "ParksSessionError",
    "ParksSessionNotFound",
    "ParksSessionRejected",
    "VAULT_KEY",
    "credential",
    "household_id",
    "read",
    "save_credential",
    "submit",
]
