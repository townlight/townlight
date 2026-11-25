# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import re
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet
from django.core.wsgi import get_wsgi_application
from django.test import Client
from sqlalchemy import create_engine, select
from sqlalchemy.pool import StaticPool

import townlight_comms.migrations as comms_migrations
from townlight_311.workflow import ServiceRequestRepository
from townlight_comms.models import subscribers
from townlight_comms.workflow import CommunicationsRepository
from townlight_runtime.communications_subscription_email import (
    CommunicationsSubscriptionEmail,
)
from townlight_runtime.resident_commands import ResidentCommandPump
from townlight_runtime.resident_dispatch import ResidentRepositoryDispatch

pytestmark = pytest.mark.django_db

SUBSCRIBE = "/communications/subscribe/"
EMAIL = "resident@example.org"


def _csrf(response):
    match = re.search(
        rb'name="csrfmiddlewaretoken" value="([^"]+)"', response.content
    )
    assert match, response.content[:500]
    return match.group(1).decode()


class _CaptureTransport:
    sender = "Townlight <no-reply@testserver>"

    def __init__(self):
        self.messages = []

    def send(self, message):
        self.messages.append(message)


class _CaptureEmailStore:
    def __init__(self, transport):
        self._transport = transport

    def transport(self):
        return self._transport


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
    comms_migrations.upgrade(comms_engine)
    service_requests = ServiceRequestRepository(service_engine)
    service_requests.save_category("roads", "Roads", "Works", True, "admin")
    communications = CommunicationsRepository(comms_engine)
    dispatch = ResidentRepositoryDispatch(
        service_requests,
        communications,
        key=resident_key,
        public_origin="https://testserver",
    )
    try:
        yield communications.engine, communications, dispatch
    finally:
        service_engine.dispose()
        comms_engine.dispose()


@pytest.fixture
def publisher(tmp_path, monkeypatch):
    token = "Z" * 43
    digest = tmp_path / "publisher-token.sha256"
    digest.write_text(hashlib.sha256(token.encode()).hexdigest())
    monkeypatch.setenv(
        "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE", str(digest)
    )
    return token


def _subscribers(engine):
    with engine.connect() as connection:
        return connection.execute(select(subscribers)).mappings().all()


def test_resident_communications_flow_end_to_end(
    settings, runtime, publisher, resident_key
):
    engine, communications, dispatch = runtime
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
    page = resident.get(SUBSCRIBE)
    assert page.status_code == 200
    subscribed = resident.post(
        SUBSCRIBE,
        {
            "csrfmiddlewaretoken": _csrf(page),
            "email": EMAIL,
            "topics": ["meetings", "311"],
            "language": "en",
        },
    )
    assert subscribed.status_code == 200
    status_match = re.search(
        rb"/communications/subscription-command/([0-9a-f-]{36})/",
        subscribed.content,
    )
    assert status_match
    status_path = "/communications/subscription-command/%s/" % (
        status_match.group(1).decode()
    )

    pump.run_once()
    transport = _CaptureTransport()
    emailer = CommunicationsSubscriptionEmail(
        communications, _CaptureEmailStore(transport), resident_key
    )
    assert emailer.tick() == 1
    assert len(transport.messages) == 1
    body = transport.messages[0].get_content()
    confirm_match = re.search(
        r"https://testserver[^\s\"'<>]*confirm[^\s\"'<>]*", body
    )
    prefs_match = re.search(
        r"https://testserver[^\s\"'<>]*preferences[^\s\"'<>]*", body
    )
    assert confirm_match and prefs_match
    confirm_url = confirm_match.group(0).replace("&amp;", "&")
    prefs_url = prefs_match.group(0).replace("&amp;", "&")
    confirm_token = parse_qs(urlparse(confirm_url).query)["token"][0]
    prefs_token = parse_qs(urlparse(prefs_url).query)["token"][0]

    pending = resident.get(status_path)
    assert pending.status_code == 200
    pending_text = pending.content.decode()
    assert confirm_token not in pending_text
    assert prefs_token not in pending_text

    confirm_form = resident.get(confirm_url)
    assert confirm_form.status_code == 200
    confirmed = resident.post(
        confirm_url,
        {
            "csrfmiddlewaretoken": _csrf(confirm_form),
            "token": confirm_token,
        },
    )
    assert confirmed.status_code == 200
    pump.run_once()
    subscriber = next(
        row for row in _subscribers(engine) if row["email"] == EMAIL
    )
    assert subscriber["confirmed"] in (True, 1)

    prefs_form = resident.get(prefs_url)
    assert prefs_form.status_code == 200
    preferred = resident.post(
        prefs_url,
        {
            "csrfmiddlewaretoken": _csrf(prefs_form),
            "token": prefs_token,
            "topic": "parks",
            "language": "en",
        },
    )
    assert preferred.status_code == 200
    pump.run_once()
    subscriber = next(
        row for row in _subscribers(engine) if row["email"] == EMAIL
    )
    assert subscriber["active"] in (False, 0)
    assert "parks" in str(subscriber["topics"])

    assert communications.claim_subscription_email(key=resident_key) is None
    owner = resident.get(status_path)
    assert owner.status_code == 200
    assert "completed" in owner.content.decode().lower()
