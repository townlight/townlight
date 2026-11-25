"""Bounded email delivery loop for queued Parks notifications."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

import sqlalchemy as sa
from townlight_311.notifications import (
    InvalidRecipientError,
    RejectionError,
    SafeRetryError,
    UncertainDeliveryError,
)
from townlight_parks.store import Conflict, InvalidInput, NotFound

from .email_settings import EmailSettingsError

_LOG = logging.getLogger(__name__)
_MAX_PER_TICK = 10
_POLL_SECONDS = 5

_ERROR_MESSAGES = {
    "settings": "Parks email delivery settings failure",
    "storage": "Parks email delivery storage failure",
    "transport": "Parks email delivery transport failure",
    "domain": "Parks email delivery domain failure",
}


class ParksEmailDelivery:
    """Queue and deliver a bounded batch of Parks emails."""

    def __init__(
        self,
        repo: Any,
        email_store: Any,
        *,
        key: Any,
        public_origin: str,
    ) -> None:
        self._repo = repo
        self._email_store = email_store
        self._key = key
        self._public_origin = public_origin
        self._logged_errors: set[str] = set()

    def _finish(self, claim: dict[str, Any], outcome: str) -> None:
        self._repo.finish_notification(
            claim["id"],
            claim["claim_token"],
            outcome,
        )

    def tick(self, stop: Any = None) -> int:
        """Process at most ten already-decrypted claims."""
        if stop is not None and stop.is_set():
            return 0
        transport = self._email_store.transport()
        if transport is None:
            return 0

        self._repo.queue_notification_events(
            key=self._key,
            portal_base_url=self._public_origin,
            limit=50,
        )

        processed = 0
        while processed < _MAX_PER_TICK:
            if stop is not None and stop.is_set():
                break
            claim = self._repo.claim_notification(key=self._key)
            if claim is None:
                break
            processed += 1

            try:
                message = EmailMessage()
                message["To"] = claim["recipient"]
                message["From"] = transport.sender
                message["Subject"] = claim["subject"]
                message["Message-ID"] = claim["message_id"]
                message.set_content(claim["body"])
            except (KeyError, TypeError, ValueError, UnicodeError):
                # No transport attempt was made.
                self._finish(claim, "failed")
                continue

            try:
                transport.send(message)
            except InvalidRecipientError:
                self._finish(claim, "failed")
            except SafeRetryError:
                self._finish(claim, "retry")
            except RejectionError as exc:
                self._finish(claim, "retry" if exc.retryable else "failed")
            except UncertainDeliveryError:
                self._finish(claim, "uncertain")
            except Exception:  # noqa: BLE001
                # Delivery may have succeeded before the failure surfaced.
                # Unexpected transport exceptions must not cause unsafe duplicate retry.
                self._finish(claim, "uncertain")
            else:
                # "sent" records SMTP acceptance, not end-user delivery.
                self._finish(claim, "sent")

        return processed

    @staticmethod
    def _error_category(exc: BaseException) -> str | None:
        if isinstance(exc, EmailSettingsError):
            return "settings"
        if isinstance(exc, sa.exc.SQLAlchemyError):
            return "storage"
        if isinstance(exc, (smtplib.SMTPException, OSError)):
            return "transport"
        if isinstance(exc, (InvalidInput, NotFound, Conflict)):
            return "domain"
        return None

    def _record_error(self, category: str) -> None:
        if category in self._logged_errors:
            return
        self._logged_errors.add(category)
        _LOG.warning("%s", _ERROR_MESSAGES[category])

    def run(self, stop: Any) -> None:
        """Run one bounded tick per poll until stop is set."""
        while not stop.is_set():
            try:
                self.tick(stop)
            except (
                EmailSettingsError,
                smtplib.SMTPException,
                OSError,
                sa.exc.SQLAlchemyError,
                InvalidInput,
                NotFound,
                Conflict,
            ) as exc:
                category = self._error_category(exc)
                if category is not None:
                    self._record_error(category)
            if stop.wait(_POLL_SECONDS):
                break


__all__ = ["ParksEmailDelivery"]
