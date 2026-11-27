"""Host bridge between Utilities workflow replies and Townlight 311.

The bridge is deliberately the only place where the Utilities workflow touches
311 storage.  It accepts only a host-injected principal object, authorizes the
named staff roles, reads the minimum request projection, and posts one public
comment through the existing 311 discussion path so the existing notification
outbox row is created in the same transaction.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from collections.abc import Mapping
from typing import Any

import sqlalchemy as sa
from sqlalchemy.exc import IntegrityError
from townlight_311.models import command_receipts
from townlight_311.store import (
    Conflict,
    InvalidInput,
    json_safe,
    required_text,
    utcnow,
)

_ALLOWED_ROLES = frozenset({"utilities-clerk", "city-staff", "local-admin"})
_OPERATION = "utilities_reply"
_MAX_MESSAGE = 10000


def _authorize(principal: object) -> str:
    """Return the trusted actor id after host-principal authorization.

    A mapping is never a principal: it is rejected before any repository call
    so request JSON can never impersonate a staff identity.
    """
    if principal is None or isinstance(principal, Mapping):
        raise PermissionError("host-injected UtilityPrincipal required")

    actor_id = getattr(principal, "actor_id", None)
    roles = getattr(principal, "roles", None)
    if not isinstance(actor_id, str) or not actor_id.strip():
        raise PermissionError("blank actor_id denied")
    if isinstance(roles, str) or roles is None:
        raise PermissionError("staff roles required")

    try:
        role_set = frozenset(roles)
    except TypeError as exc:
        raise PermissionError("staff roles required") from exc
    if not role_set or not all(isinstance(role, str) for role in role_set):
        raise PermissionError("staff roles required")
    if "resident" in role_set:
        raise PermissionError("resident role has no staff reply access")
    if not role_set.issubset(_ALLOWED_ROLES):
        raise PermissionError("unauthorized role")
    return actor_id.strip()


def _request_id(value: Any) -> str:
    return required_text(value, 36)


def _idempotency_key(value: Any) -> str:
    if not isinstance(value, str) or len(value) != 36:
        raise InvalidInput("idempotency_key must be a UUID36")
    try:
        parsed = uuid.UUID(value)
    except (AttributeError, ValueError) as exc:
        raise InvalidInput("idempotency_key must be a UUID36") from exc
    if str(parsed) != value:
        raise InvalidInput("idempotency_key must be a canonical lowercase UUID36")
    return value


def _citations(value: Any) -> tuple[str, ...]:
    if not isinstance(value, tuple):
        raise InvalidInput("citations must be a tuple of strings")
    citations = []
    for citation in value:
        citations.append(required_text(citation, 2000))
    return tuple(citations)


def _message(body: str, citations: tuple[str, ...]) -> str:
    if not citations:
        return body
    lines = "\n".join(f"- {citation}" for citation in citations)
    return f"{body}\n\nCitations:\n{lines}"


def _fingerprint(
    actor_id: str,
    request_id: str,
    body: str,
    citations: tuple[str, ...],
) -> str:
    payload = {
        "actor_id": actor_id,
        "request_id": request_id,
        "body": body,
        "citations": list(citations),
    }
    canonical = json.dumps(
        {"operation": _OPERATION, "payload": payload},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class UtilitiesRequestBridge:
    """Host adapter implementing the Utilities ``RequestBridge`` protocol."""

    def __init__(self, repository: Any):
        self.repository = repository

    def read_request(self, principal: object, request_id: str) -> dict:
        """Return only the stable request and resident-tracker references."""
        _authorize(principal)
        request_id = _request_id(request_id)

        request = self.repository.get_staff(request_id)
        if not isinstance(request, dict):
            raise TypeError("311 repository returned an invalid request")
        if request.get("id") != request_id:
            raise RuntimeError("311 repository request identity mismatch")

        tracking = request.get("tracking")
        if not isinstance(tracking, str) or not tracking.strip():
            raise RuntimeError("311 request has no resident tracker")
        return {
            "request_id": request_id,
            "resident_id": tracking.strip(),
        }

    def post_reply(
        self,
        principal: object,
        request_id: str,
        body: str,
        citations: tuple[str, ...],
        idempotency_key: str,
    ) -> dict:
        """Post one public reply and its existing 311 notification atomically."""
        actor_id = _authorize(principal)
        request_id = _request_id(request_id)
        body_text = required_text(body, _MAX_MESSAGE)
        citation_tuple = _citations(citations)
        key = _idempotency_key(idempotency_key)
        message = _message(body_text, citation_tuple)
        required_text(message, _MAX_MESSAGE)
        fingerprint = _fingerprint(actor_id, request_id, body_text, citation_tuple)

        try:
            # The placeholder receipt, comment/event, and existing notification
            # outbox row commit together.  Nested repository reads and writes
            # reuse this bound connection.
            with self.repository._bind_transaction() as conn:
                conn.execute(
                    sa.insert(command_receipts).values(
                        command_id=key,
                        fingerprint=fingerprint,
                        result={},
                        created_at=utcnow(),
                    )
                )

                before = self.repository.get_staff(request_id)
                if not isinstance(before, dict):
                    raise TypeError("311 repository returned an invalid request")
                revision = before.get("revision")
                if (
                    isinstance(revision, bool)
                    or not isinstance(revision, int)
                    or revision <= 0
                ):
                    raise RuntimeError("311 request has no usable revision")
                prior_event_ids = {
                    event.get("id")
                    for event in before.get("events", [])
                    if isinstance(event, dict)
                }

                updated = self.repository.add_comment(
                    request_id,
                    revision,
                    actor_id,
                    message,
                    True,
                )
                if not isinstance(updated, dict):
                    raise TypeError("311 repository returned an invalid update")

                comment_id = None
                for event in updated.get("events", []):
                    if not isinstance(event, dict):
                        continue
                    if event.get("id") in prior_event_ids:
                        continue
                    if event.get("kind") != "comment":
                        continue
                    if event.get("public") is not True:
                        continue
                    if event.get("actor") != actor_id:
                        continue
                    if event.get("message") != message:
                        continue
                    if comment_id is not None:
                        raise RuntimeError("311 repository created multiple comments")
                    comment_id = event.get("id")
                if not isinstance(comment_id, str) or not comment_id:
                    raise RuntimeError("311 repository did not return the comment event")

                new_revision = updated.get("revision")
                if (
                    isinstance(new_revision, bool)
                    or not isinstance(new_revision, int)
                    or new_revision <= 0
                ):
                    raise RuntimeError("311 repository returned an invalid revision")

                result = {
                    "request_id": request_id,
                    "comment_id": comment_id,
                    "idempotency_key": key,
                    "revision": new_revision,
                }
                conn.execute(
                    sa.update(command_receipts)
                    .where(command_receipts.c.command_id == key)
                    .values(result=json_safe(result))
                )
                return result
        except IntegrityError:
            # The losing writer rolls back its placeholder and observes the
            # durable receipt outside that transaction.
            with self.repository._transaction() as conn:
                existing = conn.execute(
                    sa.select(command_receipts).where(
                        command_receipts.c.command_id == key
                    )
                ).mappings().first()
            if existing is None:
                raise
            if not hmac.compare_digest(existing["fingerprint"], fingerprint):
                raise Conflict(
                    "idempotency key reused with a different reply payload"
                )
            return json_safe(existing["result"])


__all__ = ["UtilitiesRequestBridge"]
