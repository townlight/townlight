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


def test_local_defaults_city_core_provides_code_db(monkeypatch):
    import os

    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("TOWNLIGHT_PRODUCT_PROFILE", "city-core")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://synthetic@127.0.0.1:25432/code",
    )
    monkeypatch.setenv("CIVICCODE_SOURCE_REGISTRY_DB_URL", "memory")

    services._set_local_defaults()

    assert (
        os.environ["CIVICCODE_SOURCE_REGISTRY_DB_URL"]
        == "postgresql+psycopg2://synthetic@127.0.0.1:25432/code"
    )


@pytest.mark.parametrize("profile", ["records-beta", "meetings-beta"])
def test_local_defaults_non_city_core_skips_code_db(monkeypatch, profile):
    import os

    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("TOWNLIGHT_PRODUCT_PROFILE", profile)
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://synthetic@127.0.0.1:25432/code",
    )
    monkeypatch.delenv("CIVICCODE_SOURCE_REGISTRY_DB_URL", raising=False)

    services._set_local_defaults()

    assert "CIVICCODE_SOURCE_REGISTRY_DB_URL" not in os.environ


@pytest.mark.parametrize("code_schema_ok", [False, True])
def test_ready_reflects_code_schema_status(monkeypatch, tmp_path, code_schema_ok):
    monkeypatch.setenv("TESTING", "1")
    monkeypatch.setenv("CIVICSUITE_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("TOWNLIGHT_PRODUCT_PROFILE", "city-core")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://user:pass@localhost:5432/civicsuite_test",
    )
    monkeypatch.setattr(
        services,
        "_domain_database_status",
        lambda: {"ok": True, "reason": "domain-schema-ready"},
    )

    import civicsuite_runtime.meetings_bridge as meetings_bridge

    monkeypatch.setattr(meetings_bridge, "readiness", lambda: True)
    monkeypatch.setattr(
        services,
        "_code_database_status",
        lambda: {
            "ok": code_schema_ok,
            "reason": (
                "code-schema-ready"
                if code_schema_ok
                else "code-schema-unavailable"
            ),
        },
    )

    app = services.create_runtime_app(domain_enabled=True)

    from fastapi.testclient import TestClient

    with TestClient(app) as client:
        response = client.get("/ready")
        denied = client.post(
            "/desktop/v1/meetings/meetings",
            json={
                "title": "Synthetic",
                "scheduled_start": "2026-10-20T18:00:00-06:00",
                "location": "Synthetic room",
            },
        )
        assert denied.status_code == 401
        for path in (
            "/desktop/v1/code/workspace",
            "/desktop/v1/code/sources",
            "/desktop/v1/code/search?q=synthetic",
            "/desktop/v1/code/citation?section_number=1.01",
        ):
            assert client.get(path).status_code == 401

    expected_status = 200 if code_schema_ok else 503
    expected_reason = "code-schema-ready" if code_schema_ok else "code-schema-unavailable"
    assert response.status_code == expected_status
    assert response.json()["reason"] == expected_reason



def test_code_database_status_missing_registry_url(monkeypatch):
    import os

    monkeypatch.delenv("CIVICCODE_SOURCE_REGISTRY_DB_URL", raising=False)
    assert "CIVICCODE_SOURCE_REGISTRY_DB_URL" not in os.environ

    status = services._code_database_status()
    assert status["ok"] is False
    assert status["reason"] == "code-schema-unavailable"


def test_public_code_source_refusal(monkeypatch):
    from types import SimpleNamespace
    import civicsuite_runtime.code_public as p

    monkeypatch.setattr(
        p.code,
        "SECTION_STORE",
        SimpleNamespace(lookup_section=lambda *args, **kwargs: {"version": {"source_id": "secret-source"}}),
    )

    class _FakeSourceStore:
        def get(self, *args, **kwargs):
            return SimpleNamespace(public_visible=False, is_official=True, status="active")

    monkeypatch.setattr(p.code, "_get_source_store", lambda *args, **kwargs: _FakeSourceStore())
    result = p.public_citation("1.01")
    assert result["status"] == "refused"
    assert result["citation"] is None
    assert "secret-source" not in str(result)


def test_public_code_missing_refusal(monkeypatch):
    from types import SimpleNamespace
    import civicsuite_runtime.code_public as p

    def lookup(*args, **kwargs):
        raise p.code.SectionLifecycleError("RESTRICTED BODY", "RESTRICTED FIX")

    monkeypatch.setattr(p.code, "SECTION_STORE", SimpleNamespace(lookup_section=lookup))
    result = p.public_citation("9.99")
    assert result["status"] == "refused"
    assert "RESTRICTED" not in str(result)
