"""Bounded email delivery for a subscription communications queue."""

from __future__ import annotations

from email.message import EmailMessage
from typing import Any

from townlight_311.notifications import (
    InvalidRecipientError,
    RejectionError,
    SafeRetryError,
    UncertainDeliveryError,
)

_MAX_PER_TICK = 10


class CommunicationsSubscriptionEmail:
    """Claim and deliver subscription emails using one transport per tick."""

    def __init__(self, repo: Any, email_store: Any, key: Any) -> None:
        self._repo = repo
        self._email_store = email_store
        self._key = key

    def _finish(self, claim: dict[str, Any], outcome: str) -> None:
        self._repo.finish_subscription_email(
            claim["id"],
            claim["claim_token"],
            outcome,
        )

    def tick(self, stop: Any = None) -> int:
        """Deliver at most ten claimed subscription emails."""
        if stop is not None and stop.is_set():
            return 0

        transport = self._email_store.transport()
        if transport is None:
            return 0

        processed = 0
        while processed < _MAX_PER_TICK:
            if stop is not None and stop.is_set():
                break

            claim = self._repo.claim_subscription_email(key=self._key)
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
                # Any failure after claiming may have reached SMTP.
                self._finish(claim, "uncertain")
            else:
                self._finish(claim, "sent")

        return processed


__all__ = ["CommunicationsSubscriptionEmail"]
