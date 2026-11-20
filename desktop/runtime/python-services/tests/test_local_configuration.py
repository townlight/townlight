"""A direct launch cannot silently select shared database credentials."""
import pytest

from townlight_runtime.services import _set_local_defaults


def test_database_url_is_required_without_exposing_credentials(monkeypatch):
    monkeypatch.setenv("TESTING", "1")
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError, match="DATABASE_URL must be configured"):
        _set_local_defaults()
    assert "DATABASE_URL" not in __import__("os").environ


def test_explicit_supervisor_database_url_is_preserved(monkeypatch):
    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("TOWNLIGHT_PRODUCT_PROFILE", "records-beta")
    url = "postgresql+asyncpg://operator:synthetic-only@127.0.0.1:15432/townlight"
    monkeypatch.setenv("DATABASE_URL", url)
    _set_local_defaults()
    assert __import__("os").environ["DATABASE_URL"] == url
