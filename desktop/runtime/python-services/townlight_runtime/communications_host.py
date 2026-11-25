# SPDX-License-Identifier: AGPL-3.0-only
"""Bounded host loop for preparation, email delivery, and reconciliation."""

from __future__ import annotations

import logging
from typing import Any

from .communications_email import CommunicationsEmailDelivery
from .communications_publisher import CommunicationsPublisher
from .communications_subscription_email import CommunicationsSubscriptionEmail

_LOG = logging.getLogger(__name__)

_MAX_PREPARE = 5
_POLL_SECONDS = 5
_RECONCILE_LIMIT = 20
_TERMINAL = frozenset({"delivered", "withdrawn", "rejected", "superseded"})


class CommunicationsHost:
    """Run one bounded preparation/email/reconciliation tick per poll."""

    def __init__(
        self,
        repo: Any,
        queue: Any,
        email_store: Any,
        public_origin: str,
        profile_root: Any,
        *,
        recovery_key: Any,
    ) -> None:
        self.repo = repo
        self.queue = queue
        self.publisher = CommunicationsPublisher(repo, queue, public_origin, profile_root)
        self.subscription_email = CommunicationsSubscriptionEmail(repo, email_store, recovery_key)
        self._logged_error = False

    def _website_ack(self, job: dict[str, Any]) -> dict[str, Any] | None:
        """Return the queue-derived receipt, or None for email-only jobs."""
        stored = job.get("website_receipt")
        if not stored:
            return None
        expected_seq = stored.get("queue_sequence")
        expected_url = stored.get("url")
        action = str(job.get("action", "")).lower()

        match = None
        newer = False
        for entry in self.queue.status(str(job["article_id"])) or ():
            if entry.get("kind") != "article":
                continue
            seq = entry.get("sequence")
            if seq is None or expected_seq is None:
                continue
            if seq == expected_seq:
                match = entry
            elif seq > expected_seq:
                newer = True

        if match is not None:
            status = match.get("state")
            if status == "delivered":
                ack_status = "withdrawn" if action == "withdraw" else "delivered"
            elif status in ("rejected", "superseded"):
                ack_status = status
            else:
                ack_status = "queued"
        elif newer:
            # A newer queue entry exists but must not be attributed to the older one.
            ack_status = "superseded"
        else:
            ack_status = "queued"

        return {
            "status": ack_status,
            "url": expected_url,
            "queue_sequence": expected_seq,
        }

    def _reconcile(self, job: dict[str, Any]) -> bool:
        job_id = job["id"]
        ack = self._website_ack(job)
        if ack is None:
            return bool(self.repo.reconcile_publication(job_id))
        result = self.repo.reconcile_publication(job_id, website_receipt=ack)
        if isinstance(result, bool):
            return result
        return ack["status"] in _TERMINAL

    def tick(self, stop: Any = None) -> dict[str, int]:
        prepared = 0
        for _ in range(_MAX_PREPARE):
            if stop is not None and stop.is_set():
                break
            if self.publisher.prepare_one() is None:
                break
            prepared += 1

        subscription_processed = self.subscription_email.tick(stop)

        reconciled = 0
        for job in self.repo.queued_publications(limit=_RECONCILE_LIMIT):
            if stop is not None and stop.is_set():
                break
            if self._reconcile(job):
                reconciled += 1

        return {
            "prepared": prepared,
            "subscription_processed": subscription_processed,
            "reconciled": reconciled,
        }

    def run(self, stop: Any) -> None:
        """Run one bounded tick per poll until stop is set."""
        while not stop.is_set():
            try:
                self.tick(stop)
            except Exception as exc:  # classify expected storage/config/transport only
                if CommunicationsEmailDelivery._error_category(exc) is None:
                    raise
                if not self._logged_error:
                    self._logged_error = True
                    _LOG.warning("Communications host tick failed")
            if stop.wait(_POLL_SECONDS):
                break


__all__ = ["CommunicationsHost"]
