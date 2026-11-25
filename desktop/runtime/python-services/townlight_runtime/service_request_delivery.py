"""Finite daemon loop for delivering queued service-request notifications.

The delivery loop reloads SMTP settings once per tick so configuration changes
take effect without restarting the process. A disabled or missing email
configuration performs no database work at all.
"""

from __future__ import annotations

import logging
import smtplib
from collections.abc import Callable
from typing import Any

import sqlalchemy as sa

from .email_settings import EmailSettingsError

_LOG = logging.getLogger(__name__)
_MAX_PER_TICK = 10
_POLL_SECONDS = 5

_ERROR_MESSAGES = {
    "smtp": "Service request delivery SMTP failure",
    "database": "Service request delivery database failure",
    "os": "Service request delivery operating system failure",
    "settings": "Service request delivery settings failure",
}


class ServiceRequestDelivery:
    """Poll notification settings and run a bounded batch of deliveries."""

    def __init__(
        self,
        repo: Any,
        email_store: Any,
        *,
        worker_factory: Callable[..., Any] | None = None,
    ) -> None:
        self._repo = repo
        self._email_store = email_store
        if worker_factory is None:
            from townlight_311.notifications import NotificationWorker

            worker_factory = NotificationWorker
        self._worker_factory = worker_factory
        self._logged_errors: set[str] = set()

    def tick(self, stop: Any = None) -> int:
        """Process at most ten due notifications, reloading settings first."""
        if stop is not None and stop.is_set():
            return 0
        transport = self._email_store.transport()
        if transport is None:
            return 0
        worker = self._worker_factory(
            self._repo.engine,
            transport,
            recovery_key=self._repo.recovery_key,
        )
        processed = 0
        while processed < _MAX_PER_TICK:
            if stop is not None and stop.is_set():
                break
            if worker.process_one() is None:
                break
            processed += 1
        return processed

    @staticmethod
    def _error_category(exc: BaseException) -> str | None:
        if isinstance(exc, EmailSettingsError):
            return "settings"
        if isinstance(exc, smtplib.SMTPException):
            return "smtp"
        if isinstance(exc, sa.exc.SQLAlchemyError):
            return "database"
        if isinstance(exc, OSError):
            return "os"
        return None

    def _record_error(self, category: str) -> None:
        if category in self._logged_errors:
            return
        self._logged_errors.add(category)
        _LOG.warning("%s", _ERROR_MESSAGES[category])

    def run(self, stop: Any) -> None:
        """Run until the stop event is set; one bounded batch per poll."""
        while not stop.is_set():
            try:
                self.tick(stop)
            except (EmailSettingsError, smtplib.SMTPException, OSError, sa.exc.SQLAlchemyError) as exc:
                category = self._error_category(exc)
                if category is not None:
                    self._record_error(category)
            if stop.wait(_POLL_SECONDS):
                break


__all__ = ["ServiceRequestDelivery"]
