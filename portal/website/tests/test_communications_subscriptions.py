# SPDX-License-Identifier: AGPL-3.0-only
import re
import secrets

import pytest
from cryptography.fernet import Fernet
from django.test import Client
from django.urls import URLPattern, URLResolver, get_resolver

from website.communications_subscriptions import confirm, preferences, subscribe
from website.models import ResidentCommand
from website.resident_inbox import acknowledge_command, claim_commands

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def resident_key(tmp_path, monkeypatch):
    key = tmp_path / "resident.key"
    key.write_bytes(Fernet.generate_key())
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", str(key))
    monkeypatch.delenv("TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", raising=False)
    return key


def path_for(view):
    name = getattr(view, "__name__", "")

    def walk(patterns, prefix=""):
        for pattern in patterns:
            current = prefix + str(pattern.pattern)
            if isinstance(pattern, URLResolver):
                found = walk(pattern.url_patterns, current)
                if found:
                    return found
            elif pattern.callback is view or getattr(pattern.callback, "__name__", "") == name:
                return "/" + current.lstrip("/")
        return None

    found = walk(get_resolver().url_patterns)
    assert found, name
    return found


def hidden_token(response):
    match = re.search(rb'name="csrfmiddlewaretoken" value="([^"]+)"', response.content)
    assert match, response.content[:500]
    return match.group(1).decode()


def post_with_csrf(client, get_path, post_path, data):
    response = client.get(get_path)
    assert response.status_code == 200
    payload = {"csrfmiddlewaretoken": hidden_token(response)}
    payload.update(data)
    return client.post(post_path, payload)


def status_url(response):
    match = re.search(
        rb"/communications/subscription-command/([0-9a-f-]{36})/", response.content
    )
    assert match, response.content[:500]
    return "/communications/subscription-command/%s/" % match.group(1).decode()


def test_subscribe_csrf_encrypted_payload_claim_ack_and_owner_status():
    url = path_for(subscribe)
    client = Client(enforce_csrf_checks=True)
    assert client.post(url, {"email": "resident@example.org"}).status_code == 403
    assert ResidentCommand.objects.count() == 0

    response = post_with_csrf(client, url, url, {
        "email": "resident@example.org",
        "topics": ["meetings", "311"],
        "language": "en",
    })
    assert response.status_code == 200
    assert b"Your request is being processed" in response.content
    followup = status_url(response)

    row = ResidentCommand.objects.get()
    assert row.operation == "comms_subscribe"
    assert row.state == "queued"
    assert "resident@example.org" not in row.encrypted_payload
    assert "resident@example.org" not in response.content.decode()

    session_key = client.session.session_key
    claimed = claim_commands(session_key)
    assert len(claimed) == 1
    command = claimed[0]
    assert command["id"] == str(row.id)
    assert command["payload"] == {
        "email": "resident@example.org",
        "topics": ["meetings", "311"],
        "language": "en",
    }
    outcome = acknowledge_command(
        session_key,
        command["id"],
        command["lease_id"],
        command["payload_sha256"],
        {"subscribed": True},
    )
    assert outcome["state"] == "completed"

    owner = client.get(followup)
    assert owner.status_code == 200
    assert b"Your request was completed." in owner.content
    other = Client()
    assert other.get(followup).status_code == 404


def test_confirm_and_preferences_forms_do_not_enqueue_and_submit_exact_payloads():
    confirm_url = path_for(confirm)
    preferences_url = path_for(preferences)
    client = Client(enforce_csrf_checks=True)
    confirm_token = secrets.token_urlsafe(32)
    preferences_token = secrets.token_urlsafe(32)

    confirm_get = client.get(confirm_url + "?token=" + confirm_token)
    preferences_get = client.get(preferences_url + "?token=" + preferences_token)
    assert confirm_get.status_code == 200
    assert preferences_get.status_code == 200
    assert ResidentCommand.objects.count() == 0

    confirmed = post_with_csrf(
        client, confirm_url + "?token=" + confirm_token, confirm_url,
        {"token": confirm_token},
    )
    assert confirmed.status_code == 200
    assert confirmed["Cache-Control"] == "no-store"
    assert confirmed["Referrer-Policy"] == "no-referrer"
    assert confirm_token not in confirmed.content.decode()
    confirm_row = ResidentCommand.objects.get(operation="comms_confirm")
    assert confirm_token not in confirm_row.encrypted_payload
    confirm_claim = claim_commands(client.session.session_key)[0]
    assert confirm_claim["operation"] == "comms_confirm"
    assert confirm_claim["payload"] == {"token": confirm_token}

    preferred = post_with_csrf(
        client, preferences_url + "?token=" + preferences_token, preferences_url,
        {"token": preferences_token, "topic": "parks", "language": "es", "active": "on"},
    )
    assert preferred.status_code == 200
    assert preferred["Cache-Control"] == "no-store"
    assert preferred["Referrer-Policy"] == "no-referrer"
    assert preferences_token not in preferred.content.decode()
    preferences_row = ResidentCommand.objects.get(operation="comms_preferences")
    assert preferences_token not in preferences_row.encrypted_payload
    preferences_claim = next(
        item for item in claim_commands(client.session.session_key)
        if item["id"] == str(preferences_row.id)
    )
    assert preferences_claim["payload"] == {
        "token": preferences_token,
        "topics": ["parks"],
        "language": "es",
        "active": True,
    }


def test_invalid_email_token_and_topics_create_no_command():
    subscribe_url = path_for(subscribe)
    confirm_url = path_for(confirm)
    preferences_url = path_for(preferences)
    client = Client(enforce_csrf_checks=True)
    csrf = hidden_token(client.get(subscribe_url))

    for url, data in (
        (subscribe_url, {"email": "not-an-email", "topics": ["all"], "language": "en"}),
        (subscribe_url, {"email": "resident@example.org", "topics": [], "language": "en"}),
        (confirm_url, {"token": "short"}),
        (preferences_url, {
            "token": "short", "topic": "all", "language": "en", "active": "on",
        }),
    ):
        payload = {"csrfmiddlewaretoken": csrf}
        payload.update(data)
        assert client.post(url, payload).status_code == 400
    assert ResidentCommand.objects.count() == 0
