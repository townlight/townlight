"""Contract tests for the embedded Townlight product-profile boundary."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

RUNTIME_ROOT = (
    Path(__file__).resolve().parents[1]
    / "desktop"
    / "runtime"
    / "python-services"
)
sys.path.insert(0, str(RUNTIME_ROOT))

from civicsuite_runtime import services


def test_records_beta_is_the_default_embedded_runtime_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(services.PRODUCT_PROFILE_ENV, raising=False)

    profile = services._product_profile()
    assert profile == "records-beta"
    assert services._required_module_imports(profile) == [
        ("civiccore", "civiccore"),
        ("civicrecords-ai", "app.main"),
        ("civicnotice", "civicnotice.main"),
        ("civicaccess", "civicaccess.main"),
    ]


def test_city_core_is_an_explicit_compatibility_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(services.PRODUCT_PROFILE_ENV, "city-core")

    assert services._required_module_imports(services._product_profile()) == [
        ("civiccore", "civiccore"),
        ("civicrecords-ai", "app.main"),
        ("civicnotice", "civicnotice.main"),
        ("civicaccess", "civicaccess.main"),
        ("civicclerk", "civicclerk.main"),
        ("civiccode", "civiccode.main"),
    ]


def test_unknown_embedded_runtime_profile_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(services.PRODUCT_PROFILE_ENV, "not-a-product")

    with pytest.raises(RuntimeError, match="Unsupported Townlight product profile"):
        services._product_profile()


def test_meetings_profile_adds_meetings_without_enabling_code(monkeypatch):
    monkeypatch.setenv(services.PRODUCT_PROFILE_ENV, "meetings-beta")
    modules = services._required_module_imports(services._product_profile())
    assert modules == services.RECORDS_BETA_MODULE_IMPORTS + [("civicclerk", "civicclerk.main")]


def test_runtime_hosts_real_records_app_without_activating_writes(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("CIVICSUITE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv(services.PRODUCT_PROFILE_ENV, "records-beta")
    monkeypatch.setattr(services, "health_payload", lambda: {"status": "ok", "local_only": True})
    app = services.create_runtime_app()
    with TestClient(app) as client:
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["local_only"] is True
        # This is the real authenticated Records route, not a health-only host.
        denied = client.post("/desktop/v1/requests", json={
            "requester": "Synthetic Resident", "summary": "Synthetic request", "deadline": "2026-10-15"
        })
        assert denied.status_code == 401
        assert client.get("/ready").status_code == 503


def test_runtime_domain_readiness_is_not_an_import_health_result(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("CIVICSUITE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv(services.PRODUCT_PROFILE_ENV, "records-beta")
    monkeypatch.setattr(services, "health_payload", lambda: {"status": "ok", "local_only": True})
    monkeypatch.setattr(services, "_domain_database_status", lambda: {
        "ok": False, "reason": "synthetic-missing-domain-schema"
    })
    app = services.create_runtime_app(domain_enabled=True)
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        readiness = client.get("/ready")
        assert readiness.status_code == 503
        assert readiness.json()["status"] == "not-ready"


def test_native_runtime_refuses_non_loopback_bind(monkeypatch):
    monkeypatch.setenv("CIVICSUITE_RUNTIME_HOST", "0.0.0.0")
    with pytest.raises(RuntimeError, match="127.0.0.1 only"):
        services.main()
