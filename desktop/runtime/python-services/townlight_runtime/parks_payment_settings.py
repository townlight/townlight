"""Profile-scoped Stripe payment settings with encrypted credentials.

Only public, non-secret settings are exposed.  The Stripe secret key is stored
as Fernet ciphertext and is never returned by the public API or included in
exception messages.
"""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

_SETTINGS_RELATIVE_PATH = Path("config") / "secrets" / "parks-payments.json"
_ALLOWED_PAYLOAD_FIELDS = {"enabled", "secret_key", "clear_secret"}
_ALLOWED_RECORD_FIELDS = {"version", "enabled", "secret_ciphertext", "mode"}
_SAFE_ERROR = "Parks payment settings are unavailable."


class ParksPaymentSettingsError(Exception):
    """Raised when parks payment settings cannot be read or written."""


def _error() -> ParksPaymentSettingsError:
    return ParksPaymentSettingsError(_SAFE_ERROR)


def _secret_mode(value: str) -> str:
    """Validate a Stripe secret key and return its mode, without echoing it."""
    if not isinstance(value, str):
        raise _error()
    if not 20 <= len(value) <= 512:
        raise _error()
    if value.startswith("sk_test_"):
        mode = "test"
    elif value.startswith("sk_live_"):
        mode = "live"
    else:
        raise _error()
    for character in value:
        if character.isspace() or ord(character) < 32 or ord(character) == 127:
            raise _error()
    return mode


def _validate_record(record: dict[str, Any]) -> dict[str, Any]:
    """Validate stored fields without exposing ciphertext or plaintext."""
    if not isinstance(record, dict) or set(record) - _ALLOWED_RECORD_FIELDS:
        raise _error()
    try:
        version = record["version"]
        enabled = record["enabled"]
    except (KeyError, TypeError, AttributeError) as exc:
        raise _error() from exc
    if type(version) is not int or version != 1:
        raise _error()
    if type(enabled) is not bool:
        raise _error()

    ciphertext = record.get("secret_ciphertext")
    mode = record.get("mode")
    if ciphertext is None:
        if mode is not None:
            raise _error()
    else:
        if not isinstance(ciphertext, str) or not ciphertext:
            raise _error()
        if mode not in ("test", "live"):
            raise _error()
    return {
        "version": 1,
        "enabled": enabled,
        "secret_ciphertext": ciphertext,
        "mode": mode,
    }


class ParksPaymentSettingsStore:
    """Read and write the profile-scoped Stripe payment configuration."""

    def __init__(
        self,
        profile_root: str | os.PathLike[str],
        key_provider: Callable[[], bytes],
    ) -> None:
        if not callable(key_provider):
            raise _error()
        self._profile_root = Path(profile_root)
        self._key_provider = key_provider

    @property
    def path(self) -> Path:
        return self._profile_root / _SETTINGS_RELATIVE_PATH

    def _fernet(self) -> Fernet:
        try:
            key = self._key_provider()
        except Exception as exc:
            raise _error() from exc
        if not isinstance(key, bytes):
            raise _error()
        try:
            return Fernet(key)
        except (ValueError, TypeError) as exc:
            raise _error() from exc

    def _validate_paths(self) -> None:
        """Reject symlinked settings paths or parents inside the profile."""
        current = self._profile_root
        if current.exists() and current.is_symlink():
            raise _error()
        for part in _SETTINGS_RELATIVE_PATH.parts:
            current = current / part
            try:
                if current.is_symlink():
                    raise _error()
            except OSError as exc:
                raise _error() from exc

    def _load(self) -> dict[str, Any] | None:
        self._validate_paths()
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
        return _validate_record(record)

    def _decrypt_secret(self, record: dict[str, Any]) -> str | None:
        ciphertext = record["secret_ciphertext"]
        if ciphertext is None:
            return None
        try:
            plaintext = self._fernet().decrypt(ciphertext.encode("ascii"))
            secret_key = plaintext.decode("utf-8")
        except (InvalidToken, ValueError, TypeError, UnicodeError) as exc:
            raise _error() from exc
        if _secret_mode(secret_key) != record["mode"]:
            raise _error()
        return secret_key

    @staticmethod
    def _public(record: dict[str, Any]) -> dict[str, Any]:
        return {
            "configured": True,
            "enabled": record["enabled"],
            "provider": "stripe",
            "mode": record["mode"],
            "secret_configured": record["secret_ciphertext"] is not None,
            "currency": "USD",
        }

    @staticmethod
    def _unconfigured() -> dict[str, Any]:
        return {
            "configured": False,
            "enabled": False,
            "provider": "stripe",
            "mode": None,
            "secret_configured": False,
            "currency": "USD",
        }

    def public_settings(self) -> dict[str, Any]:
        """Return safe settings; malformed stored data raises a generic error."""
        record = self._load()
        return self._unconfigured() if record is None else self._public(record)

    def save(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Validate and atomically persist settings, encrypting a new secret."""
        if not isinstance(payload, dict) or set(payload) - _ALLOWED_PAYLOAD_FIELDS:
            raise _error()
        try:
            enabled = payload["enabled"]
        except KeyError as exc:
            raise _error() from exc
        if type(enabled) is not bool:
            raise _error()

        secret_supplied = "secret_key" in payload
        secret_key = payload.get("secret_key")
        if secret_supplied and not isinstance(secret_key, str):
            raise _error()
        clear_secret = payload.get("clear_secret", False)
        if type(clear_secret) is not bool:
            raise _error()
        if clear_secret and secret_supplied and secret_key != "":
            raise _error()

        existing = self._load()
        existing_ciphertext = (
            existing["secret_ciphertext"] if existing is not None else None
        )
        existing_mode = existing["mode"] if existing is not None else None

        if secret_supplied and secret_key:
            new_mode = _secret_mode(secret_key)
            ciphertext = self._fernet().encrypt(secret_key.encode("utf-8")).decode(
                "ascii"
            )
            mode = new_mode
        elif clear_secret:
            ciphertext = None
            mode = None
        else:
            ciphertext = existing_ciphertext
            mode = existing_mode

        record = {
            "version": 1,
            "enabled": enabled,
            "secret_ciphertext": ciphertext,
            "mode": mode,
        }
        if enabled:
            if ciphertext is None:
                raise _error()
            self._decrypt_secret(record)

        self._write(record)
        return self._public(record)

    def _write(self, record: dict[str, Any]) -> None:
        self._validate_paths()
        directory = self.path.parent
        temp_name: str | None = None
        try:
            directory.mkdir(parents=True, exist_ok=True)
            self._validate_paths()
            data = json.dumps(
                record, sort_keys=True, separators=(",", ":")
            ).encode("utf-8")
            fd, temp_name = tempfile.mkstemp(
                prefix=".parks-payments-", suffix=".tmp", dir=directory
            )
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.replace(temp_name, self.path)
                temp_name = None
            finally:
                if temp_name is not None:
                    try:
                        os.unlink(temp_name)
                    except OSError:
                        pass
        except OSError as exc:
            raise _error() from exc

    def transport(self) -> Any | None:
        """Build a Stripe transport, or return None when disabled/unconfigured."""
        record = self._load()
        if (
            record is None
            or not record["enabled"]
            or record["secret_ciphertext"] is None
        ):
            return None
        secret_key = self._decrypt_secret(record)
        if secret_key is None:
            raise _error()
        from townlight_parks.stripe_transport import StripeTransport

        return StripeTransport(secret_key)
