from __future__ import annotations

import json

import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from townlight_runtime.email_settings import EmailSettingsStore
from townlight_runtime.service_request_operations import (
    router as service_request_operations_router,
)

pytest_plugins = ["test_service_requests_api"]

BASE = "/desktop/v1/service-requests"
PASSWORD = "actual-smtp-password"


@pytest.fixture
def operations_app_env(app_env, tmp_path):
    app_env.app.include_router(service_request_operations_router)  # type: ignore[arg-type]
    app_env.email_key = Fernet.generate_key()
    app_env.email_store = EmailSettingsStore(tmp_path, app_env.email_key)
    app_env.app.state.desktop_notification_email = app_env.email_store
    return app_env


def _settings_payload(**overrides):
    payload = {
        "enabled": True,
        "host": "smtp.example.test",
        "port": 587,
        "sender": "alerts@example.test",
        "username": "smtp-user",
        "password": PASSWORD,
    }
    payload.update(overrides)
    return payload


def test_admin_save_with_password_returns_only_password_present(operations_app_env):
    operations_app_env.install_actor(operations_app_env.admin, "local-admin")
    with TestClient(operations_app_env.app) as client:
        response = client.post(
            f"{BASE}/email-settings",
            json=_settings_payload(),
        )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "configured": True,
        "enabled": True,
        "host": "smtp.example.test",
        "port": 587,
        "sender": "alerts@example.test",
        "username": "smtp-user",
        "password_present": True,
    }
    assert PASSWORD not in response.text
    assert "password_ciphertext" not in response.text


def test_get_email_settings_redacts_password(operations_app_env):
    operations_app_env.install_actor(operations_app_env.admin, "local-admin")
    with TestClient(operations_app_env.app) as client:
        saved = client.post(
            f"{BASE}/email-settings",
            json=_settings_payload(),
        )
        assert saved.status_code == 200, saved.text

        response = client.get(f"{BASE}/email-settings")

    assert response.status_code == 200, response.text
    assert response.json()["password_present"] is True
    assert "password" not in response.json()
    assert "password_ciphertext" not in response.json()
    assert PASSWORD not in response.text


def test_save_without_password_retains_existing_password(operations_app_env):
    operations_app_env.install_actor(operations_app_env.admin, "local-admin")
    with TestClient(operations_app_env.app) as client:
        first = client.post(
            f"{BASE}/email-settings",
            json=_settings_payload(),
        )
        assert first.status_code == 200, first.text

        retained_payload = _settings_payload(host="smtp2.example.test")
        retained_payload.pop("password")
        second = client.post(
            f"{BASE}/email-settings",
            json=retained_payload,
        )

    assert second.status_code == 200, second.text
    assert second.json()["host"] == "smtp2.example.test"
    assert second.json()["password_present"] is True

    stored = json.loads(operations_app_env.email_store.path.read_text(encoding="utf-8"))
    retained = Fernet(operations_app_env.email_key).decrypt(
        stored["password_ciphertext"].encode("ascii")
    )
    assert retained.decode("utf-8") == PASSWORD


def test_non_admin_save_is_denied(operations_app_env):
    operations_app_env.install_actor(operations_app_env.staff, "city-staff")
    with TestClient(operations_app_env.app) as client:
        response = client.post(
            f"{BASE}/email-settings",
            json=_settings_payload(),
        )

    assert response.status_code == 403
    assert not operations_app_env.email_store.path.exists()


def test_missing_actor_save_is_denied(operations_app_env):
    with TestClient(operations_app_env.app) as client:
        response = client.post(
            f"{BASE}/email-settings",
            json=_settings_payload(),
        )

    assert response.status_code == 401
    assert not operations_app_env.email_store.path.exists()
