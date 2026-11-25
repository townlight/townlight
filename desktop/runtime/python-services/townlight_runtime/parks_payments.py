"""Bounded unattended worker for durable Parks payment intents.

The worker only asks the repository to submit provider-authoritative intents.
It never changes paid/refunded state itself and never synthesizes provider
responses.  Failed intents remain durable in the repository and are retried
with a bounded per-instance backoff.
"""

from __future__ import annotations

import logging
import time

import httpx
from sqlalchemy.exc import SQLAlchemyError
from townlight_parks.store import Conflict, InvalidInput, NotFound
from townlight_parks.stripe_transport import PaymentProviderError

from .parks_payment_settings import ParksPaymentSettingsError

logger = logging.getLogger(__name__)

_ACTOR = "system:parks-payments"
_INITIAL_BACKOFF = 60.0
_MAX_BACKOFF = 900.0
_INTERVAL = 15.0
_WORK_ERRORS = (
    PaymentProviderError,
    Conflict,
    InvalidInput,
    NotFound,
    SQLAlchemyError,
    OSError,
    httpx.HTTPError,
)


class ParksPayments:
    """Run finite payment submission passes with in-memory retry backoff."""

    def __init__(self, repo, settings_store):
        self._repo = repo
        self._settings_store = settings_store
        self._backoff: dict[tuple[str, object], tuple[float, float]] = {}

    def tick(self, stop=None) -> int:
        """Submit one bounded batch of checkout and refund intents."""
        transport = self._load_transport()
        if transport is None:
            return 0
        processed = self._drain(
            "checkout",
            self._repo.checkout_pending,
            self._repo.checkout_submit,
            transport,
            stop,
        )
        processed += self._drain(
            "refund",
            self._repo.refund_pending,
            self._repo.refund_submit,
            transport,
            stop,
        )
        return processed

    def run(self, stop) -> None:
        """Poll until stop is set; no watcher or background task is started."""
        while not stop.is_set():
            self.tick(stop)
            stop.wait(_INTERVAL)

    def _load_transport(self):
        try:
            return self._settings_store.transport()
        except (ParksPaymentSettingsError, OSError):
            logger.warning("parks payments: settings unavailable")
            return None

    def _drain(self, kind, pending, submit, transport, stop) -> int:
        if stop is not None and stop.is_set():
            return 0
        try:
            rows = pending(limit=10)
        except _WORK_ERRORS:
            logger.warning("parks payments: %s pending query failed", kind)
            return 0

        succeeded = 0
        for row in rows:
            if stop is not None and stop.is_set():
                break
            key = (kind, row["id"])
            retry_at = self._backoff.get(key)
            if retry_at is not None and time.monotonic() < retry_at[0]:
                continue
            try:
                submit(row["id"], _ACTOR, transport)
            except _WORK_ERRORS:
                self._failed(key)
                logger.warning("parks payments: %s submission failed", kind)
                continue
            self._backoff.pop(key, None)
            succeeded += 1
        return succeeded

    def _failed(self, key: tuple[str, object]) -> None:
        previous = self._backoff.get(key)
        delay = _INITIAL_BACKOFF if previous is None else min(
            previous[1] * 2.0, _MAX_BACKOFF
        )
        self._backoff[key] = (time.monotonic() + delay, delay)
