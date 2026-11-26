# SPDX-License-Identifier: AGPL-3.0-only
"""Private Windows outbound resident-command pump for Townlight 311.

The pump talks only to the fixed private portal endpoints.  It never accepts a
URL from a claimed command, never logs payloads, and treats the service
credential as an existing publisher concern (``publisher_queue.publisher_config``).
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import re
import sqlite3
import ssl
import threading
import uuid
from urllib.parse import urlsplit

import httpx
from sqlalchemy.exc import SQLAlchemyError
from townlight_311.commands import _RESIDENT_OPERATIONS as RESIDENT_OPERATIONS
from townlight_311.store import Conflict, InvalidInput, NotFound, Unauthorized

from .publisher_queue import publisher_config

LOG = logging.getLogger(__name__)

CATALOG_PATH = "/townlight/v1/resident/catalog/"
CLAIM_PATH = "/townlight/v1/resident/claim/"
ACK_PATH = "/townlight/v1/resident/ack/"

RESIDENT_OPERATIONS = set(RESIDENT_OPERATIONS) | {
    "comms_subscribe",
    "comms_confirm",
    "comms_preferences",
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
}

MAX_RESPONSE_BYTES = 150 * 1024**2
MAX_COMMANDS = 10
REQUEST_TIMEOUT_SECONDS = 30
POLL_SECONDS = 5

_HASH64 = re.compile(r"[0-9a-f]{64}\Z")
_DOMAIN_ERRORS = (
    (InvalidInput, 422, "Invalid resident command"),
    (Unauthorized, 403, "Resident command not authorized"),
    (NotFound, 404, "Resident command not found"),
    (Conflict, 409, "Resident command conflict"),
)
_UNAVAILABLE_ERRORS = (OSError, sqlite3.Error, SQLAlchemyError, httpx.HTTPError)


class ResidentCommandUnavailable(Exception):
    """The private portal or its configuration is temporarily unavailable."""


def _canonical_bytes(value):
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")


def _canonical_sha256(value):
    return hashlib.sha256(_canonical_bytes(value)).hexdigest()


def _trusted_origin(origin):
    if not isinstance(origin, str) or not origin:
        raise ResidentCommandUnavailable("trusted portal origin required")
    try:
        parsed = urlsplit(origin)
    except ValueError as exc:
        raise ResidentCommandUnavailable("trusted portal origin required") from exc
    loopback = parsed.scheme == "http" and parsed.hostname in ("127.0.0.1", "::1")
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
        or (parsed.scheme != "https" and not loopback)
    ):
        raise ResidentCommandUnavailable("trusted portal origin required")
    return origin.rstrip("/")


def _valid_uuid(value):
    if not isinstance(value, str):
        return None
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError, TypeError):
        return None
    return str(parsed)


def _hash64(value):
    return isinstance(value, str) and _HASH64.fullmatch(value) is not None


def _bounded_response(response):
    total = 0
    chunks = []
    for chunk in response.iter_bytes():
        total += len(chunk)
        if total > MAX_RESPONSE_BYTES:
            raise ResidentCommandUnavailable("resident command response too large")
        chunks.append(chunk)
    return b"".join(chunks)


def _post_json(client, path, token, body, *, parse=True):
    """POST one fixed path using only the existing publisher credential."""
    headers = {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
    }
    try:
        with client.stream("POST", path, content=body, headers=headers) as response:
            if response.status_code != 200:
                raise ResidentCommandUnavailable(
                    "resident command portal is unavailable"
                )
            content = _bounded_response(response)
    except (httpx.HTTPError, OSError) as exc:
        raise ResidentCommandUnavailable(
            "resident command portal is unavailable"
        ) from exc
    if not parse:
        return None
    try:
        return json.loads(content)
    except (TypeError, ValueError, UnicodeError) as exc:
        raise ResidentCommandUnavailable(
            "resident command portal returned an invalid response"
        ) from exc


def _validate_command(raw):
    """Return validated command fields, or ``None`` to leave the lease alone."""
    if not isinstance(raw, dict):
        return None
    command_id = _valid_uuid(raw.get("id"))
    lease_id = _valid_uuid(raw.get("lease_id"))
    owner = raw.get("owner_session_digest64")
    claimed_hash = raw.get("payload_sha256")
    operation = raw.get("operation")
    payload = raw.get("payload")
    if (
        command_id is None
        or lease_id is None
        or not _hash64(owner)
        or not _hash64(claimed_hash)
    ):
        return None
    try:
        actual_hash = _canonical_sha256(payload)
    except (TypeError, ValueError):
        return None
    if not hmac.compare_digest(actual_hash, claimed_hash):
        # A fingerprint mismatch means the portal and worker disagree about the
        # request that was enqueued.  Do not run it and do not acknowledge it.
        return None
    return command_id, lease_id, owner, claimed_hash, operation, payload


class ResidentCommandPump:
    def __init__(
        self,
        repository,
        *,
        config=publisher_config,
        client_factory=httpx.Client,
    ):
        self.repository = repository
        self._config = config
        self._client_factory = client_factory
        self._warning_active = False

    def _configured(self):
        origin, token = self._config()
        origin = _trusted_origin(origin)
        if not isinstance(token, str) or not token:
            # There is deliberately no credential fallback.
            raise ResidentCommandUnavailable(
                "resident command portal is unavailable"
            )
        return origin, token

    def _catalog_body(self):
        categories = self.repository.categories()
        visible = [
            {
                "code": row["code"],
                "name": row["name"],
                "department": row["department"],
            }
            for row in categories
        ]
        return _canonical_bytes(
            {
                "categories": visible,
                "sha256": _canonical_sha256(visible),
            }
        )

    def _claim(self, client, token):
        content = _post_json(client, CLAIM_PATH, token, b"{}")
        if not isinstance(content, dict) or not isinstance(
            content.get("commands"), list
        ):
            raise ResidentCommandUnavailable(
                "resident command portal returned an invalid response"
            )
        commands = content["commands"]
        if len(commands) > MAX_COMMANDS:
            # Never silently discard leases when the portal exceeds the agreed
            # batch limit; leave the whole claim unacknowledged instead.
            raise ResidentCommandUnavailable(
                "resident command portal returned too many commands"
            )
        return commands

    def _ack(self, client, token, body):
        try:
            _post_json(client, ACK_PATH, token, _canonical_bytes(body), parse=False)
        except (ResidentCommandUnavailable, ValueError, TypeError):
            return False
        return True

    def _ack_domain_error(
        self, client, token, command_id, lease_id, owner, payload_sha, status
    ):
        detail = next(message for error, code, message in _DOMAIN_ERRORS if code == status)
        return self._ack(
            client,
            token,
            {
                "id": command_id,
                "lease_id": lease_id,
                "owner_session_digest64": owner,
                "payload_sha256": payload_sha,
                "result": {"status": status, "detail": detail},
                "failed": True,
            },
        )

    def run_once(self):
        """Claim and process at most one batch, returning non-PII counts."""
        origin, token = self._configured()
        summary = {
            "claimed": 0,
            "executed": 0,
            "acked": 0,
            "failed": 0,
            "skipped": 0,
            "unavailable": 0,
        }
        with self._client_factory(
            base_url=origin,
            trust_env=False,
            follow_redirects=False,
            timeout=REQUEST_TIMEOUT_SECONDS,
            verify=ssl.create_default_context(),
        ) as client:
            _post_json(client, CATALOG_PATH, token, self._catalog_body())
            commands = self._claim(client, token)
            summary["claimed"] = len(commands)

            for raw in commands:
                validated = _validate_command(raw)
                if validated is None:
                    summary["skipped"] += 1
                    continue
                command_id, lease_id, owner, payload_sha, operation, payload = validated

                if (
                    not isinstance(operation, str)
                    or operation not in RESIDENT_OPERATIONS
                    or not isinstance(payload, dict)
                ):
                    if self._ack_domain_error(
                        client, token, command_id, lease_id, owner, payload_sha, 422
                    ):
                        summary["failed"] += 1
                    else:
                        summary["unavailable"] += 1
                        break
                    continue

                try:
                    result = self.repository.execute_resident_command(
                        command_id, operation, payload
                    )
                except InvalidInput:
                    status = 422
                except Unauthorized:
                    status = 403
                except NotFound:
                    status = 404
                except Conflict:
                    status = 409
                except _UNAVAILABLE_ERRORS:
                    # Unexpected database or OS failure: leave this lease for
                    # the portal to expire and retry.  Never acknowledge it.
                    summary["unavailable"] += 1
                    break
                else:
                    summary["executed"] += 1
                    if self._ack(
                        client,
                        token,
                        {
                            "id": command_id,
                            "lease_id": lease_id,
                            "owner_session_digest64": owner,
                            "payload_sha256": payload_sha,
                            "result": result,
                            "failed": False,
                        },
                    ):
                        summary["acked"] += 1
                    else:
                        summary["unavailable"] += 1
                        break
                    continue

                if self._ack_domain_error(
                    client, token, command_id, lease_id, owner, payload_sha, status
                ):
                    summary["failed"] += 1
                else:
                    summary["unavailable"] += 1
                    break

        return summary

    def run(self, stop: threading.Event):
        """Product worker loop: one bounded batch, then wait five seconds."""
        while not stop.is_set():
            try:
                self.run_once()
            except Exception:  # noqa: BLE001 - generic warning hides internals
                if not self._warning_active:
                    LOG.warning(
                        "Townlight resident command pump is unavailable; will retry"
                    )
                    self._warning_active = True
            else:
                self._warning_active = False
            stop.wait(POLL_SECONDS)


__all__ = ["ResidentCommandPump", "ResidentCommandUnavailable"]
