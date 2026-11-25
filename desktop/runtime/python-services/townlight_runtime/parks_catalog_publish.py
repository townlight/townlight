# SPDX-License-Identifier: AGPL-3.0-only
"""Publish the current public parks catalog to the trusted Townlight portal."""
from __future__ import annotations

import logging
import sqlite3
import threading

import httpx
from sqlalchemy.exc import SQLAlchemyError
from townlight_311.store import Conflict, InvalidInput, NotFound, Unauthorized

from .publisher_queue import publisher_config
from .resident_commands import (
    ResidentCommandUnavailable,
    _canonical_bytes,
    _canonical_sha256,
    _post_json,
    _trusted_origin,
)

LOG = logging.getLogger(__name__)

CATALOG_PATH = "/townlight/v1/parks/catalog/"
REQUEST_TIMEOUT_SECONDS = 30
PUBLISH_INTERVAL_SECONDS = 60
MAX_CATALOG_BYTES = 2 * 1024**2

_KNOWN_ERRORS = (
    ValueError,
    TypeError,
    UnicodeError,
    OSError,
    sqlite3.Error,
    SQLAlchemyError,
    httpx.HTTPError,
    ResidentCommandUnavailable,
    InvalidInput,
    Unauthorized,
    NotFound,
    Conflict,
)


class ParksCatalogPublisher:
    """Publish an explicit, freshly built public catalog on every tick."""

    def __init__(
        self,
        repo,
        *,
        config=publisher_config,
        client_factory=httpx.Client,
    ):
        self._repo = repo
        self._config = config
        self._client_factory = client_factory
        self._warning_active = False

    def _configured(self):
        origin, token = self._config()
        origin = _trusted_origin(origin)
        if not isinstance(token, str) or not token:
            # Use only the existing publisher credential; there is no fallback.
            raise ResidentCommandUnavailable("parks catalog portal is unavailable")
        return origin, token

    def _body(self):
        catalog = self._repo.public_catalog()
        body = _canonical_bytes(
            {
                "catalog": catalog,
                "sha256": _canonical_sha256(catalog),
            }
        )
        if len(body) > MAX_CATALOG_BYTES:
            raise ValueError("parks catalog exceeds the local size limit")
        return body

    def _warn_once(self):
        if not self._warning_active:
            LOG.warning("Townlight parks catalog publisher is unavailable; will retry")
            self._warning_active = True

    def tick(self) -> bool:
        """Publish once, returning whether the portal accepted the catalog."""
        try:
            origin, token = self._configured()
            body = self._body()
            with self._client_factory(
                base_url=origin,
                follow_redirects=False,
                trust_env=False,
                timeout=REQUEST_TIMEOUT_SECONDS,
            ) as client:
                _post_json(client, CATALOG_PATH, token, body, parse=False)
        except _KNOWN_ERRORS:
            self._warn_once()
            return False
        self._warning_active = False
        return True

    def run(self, stop: threading.Event):
        """Publish current public state every minute until asked to stop."""
        while not stop.is_set():
            self.tick()
            stop.wait(PUBLISH_INTERVAL_SECONDS)


__all__ = ["ParksCatalogPublisher"]
