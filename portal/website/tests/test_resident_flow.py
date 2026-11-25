# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import uuid

import httpx
import pytest
from cryptography.fernet import Fernet
from django.core.wsgi import get_wsgi_application
from django.utils import timezone
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

import townlight_311.store
from townlight_311.workflow import ServiceRequestRepository
from website.models import ServiceRequestCatalog
from townlight_runtime.resident_commands import ResidentCommandPump
from website.resident_inbox import acknowledge_command, claim_commands

pytestmark = pytest.mark.django_db

_MISSING = object()


@pytest.fixture(autouse=True)
def resident_key(tmp_path, monkeypatch):
    key = tmp_path / "resident.key"
    key.write_bytes(Fernet.generate_key())
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", str(key))
    monkeypatch.delenv("TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", raising=False)
    return key


@pytest.fixture
def repository():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    repo = ServiceRequestRepository(engine)
    repo.save_category("roads", "Roads", "Works", True, "admin")
    try:
        yield repo
    finally:
        engine.dispose()


def _find(value, *keys):
    if isinstance(value, dict):
        for key in keys:
            if key in value:
                return value[key]
        for nested in value.values():
            found = _find(nested, *keys)
            if found is not _MISSING:
                return found
    elif isinstance(value, (list, tuple)):
        for nested in value:
            found = _find(nested, *keys)
            if found is not _MISSING:
                return found
    return _MISSING


def _execute_and_ack(repo, session_key, item):
    result = repo.execute_resident_command(
        item["id"], item["operation"], item["payload"]
    )
    result = townlight_311.store.json_safe(result)
    acknowledge_command(
        session_key,
        item["id"],
        item["lease_id"],
        item["payload_sha256"],
        result,
        False,
    )
    return result


def test_resident_request_happy_path(client, repository, settings):
    settings.DEBUG = True
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    ServiceRequestCatalog.objects.create(
        pk=311,
        categories=[
            {"code": "roads", "name": "Roads", "department": "Works"}
        ],
        digest="0" * 64,
        updated_at=timezone.now(),
    )

    command_id = uuid.uuid4()
    response = client.post(
        "/service-requests/",
        {
            "command_id": str(command_id),
            "category": "roads",
            "description": "pothole",
            "location": "MainSt",
            "email": "resident@example.com",
        },
    )
    assert response.status_code == 200
    assert response.context["mode"] == "pending"

    session_key = client.session.session_key
    assert session_key

    create_items = claim_commands(session_key)
    assert create_items
    create_item = create_items[0]
    create_result = _execute_and_ack(repository, session_key, create_item)

    request_id = _find(create_result, "request_id", "id")
    assert request_id is not _MISSING and request_id
    request_id = str(request_id)

    tracking = _find(create_result, "tracking", "tracking_id")
    assert tracking is not _MISSING and tracking

    token = create_item["payload"]["resident_token"]

    command_page = client.get(f"/service-requests/commands/{create_item['id']}/")
    assert command_page.status_code == 200
    command_body = command_page.content.decode()
    command_body_lower = command_body.lower()
    assert "TL311" in command_body
    assert str(tracking) in command_body
    assert token in command_body

    resident = repository.get_resident(request_id, token)
    assert resident["description"] == "pothole"
    assert resident["location"] == "MainSt"

    request_page = client.get(f"/service-requests/requests/{request_id}/")
    assert request_page.status_code == 302
    redirect_target = request_page["Location"]
    assert redirect_target.startswith("/service-requests/commands/")

    read_items = claim_commands(session_key)
    assert read_items
    read_item = read_items[0]
    read_result = _execute_and_ack(repository, session_key, read_item)

    state = _find(read_result, "state")
    assert state is not _MISSING and state

    final_page = client.get(redirect_target, follow=False)
    assert final_page.status_code == 200
    final_body = final_page.content.decode().lower()
    assert "pothole" in final_body
    assert str(state).lower() in final_body


def test_resident_pump_private_route_contract(
    client, repository, resident_key, settings, tmp_path, monkeypatch
):
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    token = "Z" * 43
    digest_file = tmp_path / "publisher-token.sha256"
    digest_file.write_text(hashlib.sha256(token.encode()).hexdigest())
    monkeypatch.setenv(
        "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE", str(digest_file)
    )

    def factory(**kwargs):
        return httpx.Client(
            transport=httpx.WSGITransport(get_wsgi_application()),
            **kwargs,
        )

    pump = ResidentCommandPump(
        repository,
        config=lambda: ("https://testserver", token),
        client_factory=factory,
    )

    pump.run_once()

    command_id = uuid.uuid4()
    response = client.post(
        "/service-requests/",
        {
            "command_id": str(command_id),
            "category": "roads",
            "description": "pumpfixture",
            "location": "Main",
            "email": "resident@example.com",
        },
    )
    assert response.status_code == 200
    assert response.context["mode"] == "pending"

    stats = pump.run_once()
    assert _find(stats, "claimed") == 1
    assert _find(stats, "executed") == 1
    assert _find(stats, "acked") == 1

    command_page = client.get(f"/service-requests/commands/{command_id}/")
    assert command_page.status_code == 200
    body = command_page.content.decode()
    body_lower = body.lower()
    assert "TL311" in body
    assert "tracking" in body_lower
    assert "token" in body_lower