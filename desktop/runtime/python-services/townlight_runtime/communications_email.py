"""Bounded email delivery loop for queued communications notifications."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

import sqlalchemy as sa
from cryptography.fernet import Fernet
from townlight_311.notifications import (
    InvalidRecipientError,
    RejectionError,
    SafeRetryError,
    UncertainDeliveryError,
)

from .email_settings import EmailSettingsError

_LOG = logging.getLogger(__name__)
_MAX_PER_TICK = 10
_POLL_SECONDS = 5

_ERROR_MESSAGES = {
    "storage": "Communications email delivery storage failure",
    "settings": "Communications email delivery settings failure",
    "transport": "Communications email delivery transport failure",
}


class CommunicationsEmailDelivery:
    """Claim and deliver a bounded batch of queued communications emails."""

    def __init__(self, repo: Any, email_store: Any) -> None:
        self._repo = repo
        self._email_store = email_store
        self._logged_errors: set[str] = set()

    def _finish(self, claim: dict[str, Any], outcome: str) -> None:
        self._repo.finish_email(
            claim["id"],
            claim["claim_token"],
            outcome,
        )

    def tick(self, stop: Any = None) -> int:
        """Process at most ten claims after loading the transport once."""
        if stop is not None and stop.is_set():
            return 0

        transport = self._email_store.transport()
        if transport is None:
            return 0

        processed = 0
        while processed < _MAX_PER_TICK:
            if stop is not None and stop.is_set():
                break

            claim = self._repo.claim_email()
            if claim is None:
                break
            processed += 1

            try:
                body = claim["body"]
                if body.startswith("fernet:"):
                    try:
                        body = Fernet(self._repo.recovery_key).decrypt(
                            body[len("fernet:") :].encode("ascii")
                        ).decode("utf-8")
                    except Exception:  # noqa: BLE001 - unexpected failure marks failed; no blind retry
                        # No transport attempt was made; token/body must not be logged.
                        self._finish(claim, "failed")
                        continue

                message = EmailMessage()
                message["To"] = claim["recipient"]
                message["From"] = transport.sender
                message["Subject"] = claim["subject"]
                message["Message-ID"] = claim["message_id"]
                message.set_content(body)
                transport.send(message)
            except InvalidRecipientError:
                self._finish(claim, "failed")
            except SafeRetryError:
                self._finish(claim, "retry")
            except RejectionError as exc:
                self._finish(claim, "retry" if exc.retryable else "failed")
            except UncertainDeliveryError:
                self._finish(claim, "uncertain")
            except Exception:  # noqa: BLE001 - unexpected failure marks uncertain; no blind retry
                # Any failure after the claim may have reached SMTP.
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
            ) as exc:
                category = self._error_category(exc)
                if category is not None:
                    self._record_error(category)
            if stop.wait(_POLL_SECONDS):
                break


__all__ = ["CommunicationsEmailDelivery"]
