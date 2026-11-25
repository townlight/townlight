from __future__ import annotations

import json
import secrets
from pathlib import Path

import pytest
from cryptography.fernet import Fernet
from townlight_runtime.email_settings import EmailSettingsError, EmailSettingsStore

KEY = Fernet.generate_key()
PASSWORD = secrets.token_urlsafe(24)


def payload(**overrides):
    value = {
        "enabled": True,
        "host": "smtp.city.example",
        "port": 587,
        "sender": "alerts@city.example",
        "username": "relay-user",
        "password": PASSWORD,
    }
    value.update(overrides)
    return value


def make_store(tmp_path: Path, factory=None, key: bytes = KEY) -> EmailSettingsStore:
    return EmailSettingsStore(tmp_path, key, transport_factory=factory)


def test_save_returns_public_settings_and_never_stores_raw_password(tmp_path: Path):
    store = make_store(tmp_path)
    result = store.save(payload())

    assert result == {
        "configured": True,
        "enabled": True,
        "host": "smtp.city.example",
        "port": 587,
        "sender": "alerts@city.example",
        "username": "relay-user",
        "password_present": True,
    }
    assert "password" not in result
    assert "password_ciphertext" not in result
    raw = store.path.read_bytes()
    assert PASSWORD.encode() not in raw
    assert b"password_ciphertext" in raw
    assert store.read() == result


def test_preserve_update_clear_and_username_change_rules(tmp_path: Path):
    calls = []

    def factory(host, port, sender, credentials, use_tls=False):
        calls.append((host, port, sender, credentials, use_tls))
        return object()

    store = make_store(tmp_path, factory)
    store.save(payload())

    preserved = store.save({k: v for k, v in payload().items() if k != "password"})
    assert preserved["password_present"] is True
    store.transport()
    assert calls[-1][3] == ("relay-user", PASSWORD)

    store.save(payload(password="replacement"))
    store.transport()
    assert calls[-1][3] == ("relay-user", "replacement")

    with pytest.raises(EmailSettingsError):
        store.save({k: v for k, v in payload(username="new-user").items() if k != "password"})

    changed = store.save(payload(username="new-user", password="new-secret"))
    assert changed["password_present"] is True

    cleared = store.save(
        {k: v for k, v in payload().items() if k != "password"} | {"clear_password": True}
    )
    assert cleared["password_present"] is False
    assert store.transport() is not None
    assert calls[-1][3] is None


def test_empty_username_needs_no_credentials(tmp_path: Path):
    calls = []
    store = make_store(
        tmp_path,
        lambda *args, **kwargs: calls.append((args, kwargs)) or object(),
    )
    result = store.save({k: v for k, v in payload(username="").items() if k != "password"})
    assert result["username"] == ""
    assert result["password_present"] is False
    store.transport()
    assert calls[-1][0][3] is None


def test_invalid_payloads_are_rejected_without_writing(tmp_path: Path):
    store = make_store(tmp_path)
    for bad in (
        payload(port=0),
        payload(port=65536),
        payload(port=True),
        payload(sender="not-an-email"),
        payload(host=""),
        payload(host="x" * 256),
        payload(username=None),
        payload(password=None),
        payload(password="x" * 2049),
        payload(clear_password="yes"),
        payload(clear_password=True),
        payload(unknown="field"),
    ):
        with pytest.raises(EmailSettingsError):
            store.save(bad)
    assert not store.path.exists()


def test_missing_and_disabled_transport_is_none(tmp_path: Path):
    store = make_store(tmp_path)
    assert store.public_settings() == {
        "configured": False,
        "enabled": False,
        "host": None,
        "port": None,
        "sender": None,
        "username": "",
        "password_present": False,
    }
    assert store.transport() is None
    store.save(payload(enabled=False))
    assert store.transport() is None


def test_transport_factory_receives_exact_decrypted_credentials(tmp_path: Path):
    calls = []

    def factory(host, port, sender, credentials, use_tls=False):
        calls.append((host, port, sender, credentials, use_tls))
        return "transport"

    store = make_store(tmp_path, factory)
    store.save(payload())
    assert store.transport() == "transport"
    assert calls == [
        ("smtp.city.example", 587, "alerts@city.example", ("relay-user", PASSWORD), True)
    ]


@pytest.mark.parametrize("corruption", ["json", "ciphertext", "wrong-key", "types"])
def test_corrupt_settings_fail_closed_with_generic_error(tmp_path: Path, corruption: str):
    store = make_store(tmp_path)
    store.save(payload())
    if corruption == "json":
        store.path.write_bytes(b"{not-json")
    elif corruption == "ciphertext":
        data = json.loads(store.path.read_text())
        data["password_ciphertext"] = "not-a-token"
        store.path.write_text(json.dumps(data))
    elif corruption == "wrong-key":
        store = make_store(tmp_path, key=Fernet.generate_key())
    else:
        data = json.loads(store.path.read_text())
        data["port"] = True
        store.path.write_text(json.dumps(data))

    for call in (store.read, store.public_settings, store.transport):
        with pytest.raises(EmailSettingsError) as exc:
            call()
        assert PASSWORD not in str(exc.value)
        assert "not-a-token" not in str(exc.value)
