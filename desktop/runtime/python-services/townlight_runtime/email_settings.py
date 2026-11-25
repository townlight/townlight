"""Shared SMTP notification settings with encrypted credentials.

Only public settings are returned to callers. The stored password is Fernet
ciphertext and is never exposed by the public API or exception messages.
"""

from __future__ import annotations

import json
import os
import re
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

_SETTINGS_RELATIVE_PATH = Path("config") / "secrets" / "notification-email.json"
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_ALLOWED_FIELDS = {
    "enabled", "host", "port", "sender", "username", "password", "clear_password",
}
_SAFE_ERROR = "Notification email settings are unavailable."


class EmailSettingsError(Exception):
    """Raised when notification email settings cannot be read or written."""


def _error() -> EmailSettingsError:
    return EmailSettingsError(_SAFE_ERROR)


def _valid_email(value: str) -> bool:
    return len(value) <= 254 and bool(_EMAIL_RE.fullmatch(value))


def _validate_record(record: dict[str, Any]) -> dict[str, Any]:
    """Validate a stored record without exposing any secret material."""
    try:
        enabled = record["enabled"]
        host = record["host"]
        port = record["port"]
        sender = record["sender"]
        username = record.get("username", "")
        ciphertext = record.get("password_ciphertext")
    except (KeyError, TypeError, AttributeError) as exc:
        raise _error() from exc
    if type(enabled) is not bool:
        raise _error()
    if not isinstance(host, str) or not host or len(host) > 255 or host.strip() != host:
        raise _error()
    if type(port) is not int or not 1 <= port <= 65535:
        raise _error()
    if not isinstance(sender, str) or not _valid_email(sender):
        raise _error()
    if not isinstance(username, str) or len(username) > 320:
        raise _error()
    if ciphertext is not None and not isinstance(ciphertext, str):
        raise _error()
    return {
        "enabled": enabled, "host": host, "port": port, "sender": sender,
        "username": username, "password_ciphertext": ciphertext,
    }


class EmailSettingsStore:
    """Read and write the profile-scoped SMTP notification configuration."""

    def __init__(
        self,
        profile_root: str | os.PathLike[str],
        encryption_key: bytes,
        transport_factory: Callable[..., Any] | None = None,
    ) -> None:
        self._profile_root = Path(profile_root)
        self._encryption_key = encryption_key
        self._transport_factory = transport_factory

    @property
    def path(self) -> Path:
        return self._profile_root / _SETTINGS_RELATIVE_PATH

    def _fernet(self) -> Fernet:
        if not isinstance(self._encryption_key, bytes):
            raise _error()
        try:
            return Fernet(self._encryption_key)
        except (ValueError, TypeError) as exc:
            raise _error() from exc

    def _load(self) -> dict[str, Any] | None:
        try:
            raw = self.path.read_bytes()
        except FileNotFoundError:
            return None
        except OSError as exc:
            raise _error() from exc
        try:
            record = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError) as exc:
            raise _error() from exc
        if not isinstance(record, dict):
            raise _error()
        record = _validate_record(record)
        self._decrypt_password(record)
        return record

    def _decrypt_password(self, record: dict[str, Any]) -> str | None:
        ciphertext = record["password_ciphertext"]
        if ciphertext is None:
            return None
        try:
            plaintext = self._fernet().decrypt(ciphertext.encode("ascii"))
            return plaintext.decode("utf-8")
        except (InvalidToken, ValueError, TypeError, UnicodeError) as exc:
            raise _error() from exc

    @staticmethod
    def _public(record: dict[str, Any]) -> dict[str, Any]:
        return {
            "configured": True,
            "enabled": record["enabled"],
            "host": record["host"],
            "port": record["port"],
            "sender": record["sender"],
            "username": record["username"],
            "password_present": record["password_ciphertext"] is not None,
        }

    @staticmethod
    def _unconfigured() -> dict[str, Any]:
        return {
            "configured": False, "enabled": False, "host": None, "port": None,
            "sender": None, "username": "", "password_present": False,
        }

    def read(self) -> dict[str, Any]:
        """Return public settings, raising a safe error when missing/invalid."""
        record = self._load()
        if record is None:
            raise _error()
        return self._public(record)

    def public_settings(self) -> dict[str, Any]:
        """Return public settings; a missing configuration is unconfigured."""
        record = self._load()
        return self._unconfigured() if record is None else self._public(record)

    def save(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Validate and atomically persist settings, encrypting the password."""
        if not isinstance(payload, dict) or set(payload) - _ALLOWED_FIELDS:
            raise _error()
        try:
            enabled = payload["enabled"]
            host = payload["host"]
            port = payload["port"]
            sender = payload["sender"]
        except KeyError as exc:
            raise _error() from exc
        if type(enabled) is not bool:
            raise _error()
        if not isinstance(host, str) or not host or len(host) > 255 or host.strip() != host:
            raise _error()
        if type(port) is not int or not 1 <= port <= 65535:
            raise _error()
        if not isinstance(sender, str) or not _valid_email(sender):
            raise _error()

        username = payload.get("username", "")
        if not isinstance(username, str) or len(username) > 320:
            raise _error()
        password_supplied = "password" in payload
        password = payload.get("password")
        if password_supplied and (not isinstance(password, str) or len(password) > 2048):
            raise _error()
        clear_password = payload.get("clear_password", False)
        if type(clear_password) is not bool:
            raise _error()
        if clear_password and password_supplied:
            raise _error()

        existing = self._load()
        if password_supplied:
            ciphertext = self._fernet().encrypt(password.encode("utf-8")).decode("ascii")
        elif clear_password or (existing is None and not username):
            ciphertext = None
        elif existing is not None and username == existing["username"]:
            ciphertext = existing["password_ciphertext"]
        else:
            raise _error()

        record = {
            "version": 1, "enabled": enabled, "host": host, "port": port,
            "sender": sender, "username": username, "password_ciphertext": ciphertext,
        }
        self._write(record)
        return self._public(record)

    def _write(self, record: dict[str, Any]) -> None:
        directory = self.path.parent
        try:
            directory.mkdir(parents=True, exist_ok=True)
            data = json.dumps(record, sort_keys=True, separators=(",", ":")).encode("utf-8")
            fd, temp_name = tempfile.mkstemp(
                prefix=".notification-email-", suffix=".tmp", dir=directory
            )
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_name, self.path)
            except BaseException:
                try:
                    os.unlink(temp_name)
                except OSError:
                    pass
                raise
        except OSError as exc:
            raise _error() from exc

    def transport(self) -> Any | None:
        """Build an SMTP transport, or return None when disabled or missing."""
        record = self._load()
        if record is None or not record["enabled"]:
            return None
        password = self._decrypt_password(record)
        credentials = (
            (record["username"], password)
            if record["username"] and password is not None else None
        )
        factory = self._transport_factory
        if factory is None:
            from townlight_311.notifications import SMTPTransport
            factory = SMTPTransport
        return factory(
            record["host"], record["port"], record["sender"], credentials,
            use_tls=True,
        )
