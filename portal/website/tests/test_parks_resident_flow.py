# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import json
import re

import httpx
import pytest
from cryptography.fernet import Fernet
from django.core.wsgi import get_wsgi_application
from django.test import Client
from sqlalchemy import create_engine, select
from sqlalchemy.pool import StaticPool

import townlight_comms.migrations as comms_migrations
import townlight_parks.migrations as parks_migrations
from website import parks_session
from townlight_311.workflow import ServiceRequestRepository
from townlight_comms.workflow import CommunicationsRepository

from townlight_parks.workflow import ParksRepository

from townlight_parks.models import households
from townlight_runtime.resident_commands import ResidentCommandPump
from townlight_runtime.resident_dispatch import ResidentRepositoryDispatch

pytestmark = pytest.mark.django_db

HOUSEHOLD_URL = "/parks/household/new/"
EMAIL = "parks-household@example.org"


def _csrf(response):
    match = re.search(
        rb'name="csrfmiddlewaretoken" value="([^"]+)"', response.content
    )
    assert match, response.content[:500]
    return match.group(1).decode()


@pytest.fixture(autouse=True)
def resident_key(tmp_path, monkeypatch):
    key = tmp_path / "resident.key"
    key.write_bytes(Fernet.generate_key())
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", str(key))
    monkeypatch.delenv(
        "TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", raising=False
    )
    return key.read_bytes()


@pytest.fixture
def runtime(resident_key):
    service_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    comms_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    parks_engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    comms_migrations.upgrade(comms_engine)
    parks_migrations.upgrade(parks_engine)
    service_requests = ServiceRequestRepository(service_engine)
    service_requests.save_category("roads", "Roads", "Works", True, "admin")
    communications = CommunicationsRepository(comms_engine)
    parks = ParksRepository(parks_engine)
    dispatch = ResidentRepositoryDispatch(
        service_requests,
        communications,
        key=resident_key,
        public_origin="https://testserver",
        parks=parks,
    )
    try:
        yield parks_engine, dispatch
    finally:
        service_engine.dispose()
        comms_engine.dispose()
        parks_engine.dispose()


@pytest.fixture
def publisher(tmp_path, monkeypatch):
    token = "Z" * 43
    digest = tmp_path / "publisher-token.sha256"
    digest.write_text(hashlib.sha256(token.encode()).hexdigest())
    monkeypatch.setenv(
        "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE", str(digest)
    )
    return token


def test_resident_parks_household_flow_end_to_end(
    settings, runtime, publisher, resident_key
):
    parks_engine, dispatch = runtime
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    def factory(**kwargs):
        return httpx.Client(
            transport=httpx.WSGITransport(get_wsgi_application()), **kwargs
        )

    pump = ResidentCommandPump(
        dispatch,
        config=lambda: ("https://testserver", publisher),
        client_factory=factory,
    )

    resident = Client(enforce_csrf_checks=True)
    page = resident.get(HOUSEHOLD_URL)
    assert page.status_code == 200
    submitted = resident.post(
        HOUSEHOLD_URL,
        {
            "csrfmiddlewaretoken": _csrf(page),
            "contact_name": "Parks Household",
            "email": EMAIL,
            "phone": "",
            "address": "",
            "language": "en",
        },
    )
    assert submitted.status_code == 200
    status_match = re.search(
        rb"/parks/commands/[0-9a-f-]{36}/", submitted.content
    )
    assert status_match, submitted.content[:500]
    status_path = status_match.group(0).decode()

    pump.run_once()
    status = resident.get(status_path)
    assert status.status_code == 200
    assert b"Your parks household is ready." in status.content

    raw_vault = resident.session[parks_session.VAULT_KEY]
    assert isinstance(raw_vault, str)
    vault = json.loads(
        Fernet(resident_key).decrypt(raw_vault.encode("ascii")).decode("utf-8")
    )
    tracking_token = vault["tracking_token"]
    household_id = vault["household_id"]
    assert isinstance(tracking_token, str)
    assert isinstance(household_id, str)
    assert tracking_token not in raw_vault

    with parks_engine.connect() as connection:
        translated = connection.execution_options(
            schema_translate_map={"townlight_parks": None}
        )
        rows = translated.execute(select(households)).mappings().all()
    matches = [row for row in rows if str(row["id"]) == household_id]
    assert len(matches) == 1
    household = matches[0]
    assert household["snapshot"]["email"] == EMAIL
    encrypted_token = household["encrypted_tracking_token"]
    assert isinstance(encrypted_token, bytes)
    assert tracking_token.encode("utf-8") not in encrypted_token
    assert (
        Fernet(resident_key).decrypt(encrypted_token).decode("utf-8")
        == tracking_token
    )

    other_session = Client(enforce_csrf_checks=True)
    foreign = other_session.get(status_path)
    assert b"Your parks household is ready." not in foreign.content
    assert tracking_token.encode("utf-8") not in foreign.content
