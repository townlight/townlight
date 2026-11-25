# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import json
from datetime import timedelta
from uuid import uuid4

import pytest
from cryptography.fernet import Fernet
from django.test import RequestFactory
from django.utils import timezone
from website.models import ResidentCommand
from website.resident_inbox import (
    ResidentInboxConflict,
    ResidentInboxNotFound,
    ResidentInboxRateLimited,
    ResidentInboxRejected,
    ResidentInboxTooLarge,
    ResidentInboxUnavailable,
    acknowledge,
    acknowledge_command,
    claim,
    claim_commands,
    enqueue,
    read_owned,
)

pytestmark = pytest.mark.django_db

TOKEN = "Z" * 43
CONTACT = "resident@example.com"
BROWSER_TOKEN = "browser-secret-do-not-store"
OTHER_BROWSER = "other-browser-secret"


@pytest.fixture(autouse=True)
def inbox_env(tmp_path, monkeypatch, settings):
    settings.ALLOWED_HOSTS = [
        "localhost", "127.0.0.1", "[::1]", "portal.example", "testserver",
    ]
    resident_key = tmp_path / "resident.key"
    resident_key.write_bytes(Fernet.generate_key())
    publisher_key = tmp_path / "publisher.sha256"
    publisher_key.write_text(hashlib.sha256(TOKEN.encode()).hexdigest(), encoding="ascii")
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", str(resident_key))
    monkeypatch.setenv("TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE", str(publisher_key))
    monkeypatch.delenv("TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", raising=False)
    return resident_key


def body(response):
    return json.loads(response.content)


def worker_post(view, payload, *, host="localhost", secure=True, remote="127.0.0.1",
                token=TOKEN, forwarded=None):
    extra = {}
    if token is not None:
        extra["HTTP_AUTHORIZATION"] = "Bearer " + token
    if forwarded:
        extra["HTTP_X_FORWARDED_PROTO"] = forwarded
    return view(RequestFactory().post(
        "/private/resident/", data=json.dumps(payload),
        content_type="application/json", HTTP_HOST=host,
        REMOTE_ADDR=remote, secure=secure, **extra,
    ))


def command_payload(**extra):
    value = {"contact": CONTACT, "token": BROWSER_TOKEN, "summary": "Pothole"}
    value.update(extra)
    return value


def test_missing_key_fails_closed(monkeypatch):
    monkeypatch.delenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE")
    with pytest.raises(ResidentInboxUnavailable):
        enqueue(BROWSER_TOKEN, "create_request", command_payload(), uuid4())
    response = worker_post(claim, {"session_key": BROWSER_TOKEN})
    assert response.status_code == 503
    assert body(response) == {"detail": "Resident inbox unavailable"}


def test_persistence_contains_only_ciphertext():
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "create_request", command_payload(), command_id)
    row = ResidentCommand.objects.get(pk=command_id)
    stored = row.encrypted_payload
    assert stored and CONTACT not in stored and BROWSER_TOKEN not in stored
    assert CONTACT not in row.owner_session_digest64 and BROWSER_TOKEN not in row.owner_session_digest64
    claimed = claim_commands(BROWSER_TOKEN)
    assert claimed[0]["payload"] == command_payload()
    acknowledge_command(BROWSER_TOKEN, command_id, claimed[0]["lease_id"],
                        claimed[0]["payload_sha256"], {"note": CONTACT, "ok": True})
    row.refresh_from_db()
    assert row.encrypted_result and CONTACT not in row.encrypted_result
    assert read_owned(BROWSER_TOKEN, command_id)["result"] == {"note": CONTACT, "ok": True}


def test_private_host_claim_and_ack_valid_result():
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "create_request", command_payload(), command_id)
    claimed = worker_post(claim, {"session_key": BROWSER_TOKEN})
    assert claimed.status_code == 200
    commands = body(claimed)["commands"]
    assert len(commands) == 1
    item = commands[0]
    assert item["id"] == str(command_id)
    assert item["payload"] == command_payload()
    row = ResidentCommand.objects.get(pk=command_id)
    assert item["payload_sha256"] == row.payload_sha256
    assert row.encrypted_payload != json.dumps(item["payload"])

    acked = worker_post(acknowledge, {
        "session_key": BROWSER_TOKEN, "id": item["id"],
        "lease_id": item["lease_id"], "payload_sha256": item["payload_sha256"],
        "result": {"case": "311-42", "accepted": True},
    })
    assert acked.status_code == 200
    assert body(acked) == {"id": str(command_id), "state": "completed"}
    assert read_owned(BROWSER_TOKEN, command_id)["result"] == {
        "case": "311-42", "accepted": True,
    }


def test_failed_acknowledgement_persists_failed_state():
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "comment", command_payload(), command_id)
    item = claim_commands(BROWSER_TOKEN)[0]
    outcome = acknowledge_command(
        BROWSER_TOKEN, command_id, item["lease_id"], item["payload_sha256"],
        {"reason": "upstream unavailable"}, failed=True,
    )
    assert outcome["state"] == "failed"
    assert read_owned(BROWSER_TOKEN, command_id)["state"] == "failed"


def test_failed_flag_if_present_must_be_a_boolean():
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "comment", {"body": "ok"}, command_id)
    item = claim_commands(BROWSER_TOKEN)[0]
    rejected = worker_post(acknowledge, {
        "session_key": BROWSER_TOKEN, "id": item["id"],
        "lease_id": item["lease_id"], "payload_sha256": item["payload_sha256"],
        "result": {"ok": True}, "failed": "false",
    })
    assert rejected.status_code == 400
    assert body(rejected) == {"detail": "Invalid failed flag"}
    assert ResidentCommand.objects.get(pk=command_id).state == "claimed"


def test_unauthorized_host_is_rejected():
    response = worker_post(claim, {"session_key": BROWSER_TOKEN}, host="evil.example")
    assert response.status_code == 401
    assert body(response) == {"detail": "Publisher authorization required"}


def test_nonloopback_http_and_forwarded_header_are_denied():
    response = worker_post(
        claim, {"session_key": BROWSER_TOKEN}, secure=False,
        remote="203.0.113.9", forwarded="https",
    )
    assert response.status_code == 403
    assert body(response) == {"detail": "HTTPS required"}


def test_nonloopback_http_is_denied_even_with_valid_bearer():
    response = worker_post(
        claim, {}, host="portal.example", secure=False,
        remote="203.0.113.9", token=TOKEN,
    )
    assert response.status_code == 403
    assert body(response) == {"detail": "HTTPS required"}


def test_missing_bearer_is_rejected_even_over_https():
    response = worker_post(
        claim, {}, host="portal.example", secure=True,
        remote="203.0.113.9", token=None,
    )
    assert response.status_code == 401
    assert body(response) == {"detail": "Publisher authorization required"}


def test_https_remote_worker_polls_global_inbox_and_acks_with_returned_owner():
    first_id, second_id = uuid4(), uuid4()
    enqueue(BROWSER_TOKEN, "comment", {"n": 1}, first_id)
    enqueue(OTHER_BROWSER, "comment", {"n": 2}, second_id)
    claimed = worker_post(
        claim, {}, host="portal.example", secure=True, remote="203.0.113.9",
    )
    assert claimed.status_code == 200
    response_text = claimed.content.decode("utf-8")
    assert BROWSER_TOKEN not in response_text
    assert OTHER_BROWSER not in response_text
    commands = body(claimed)["commands"]
    assert len(commands) == 2
    assert {item["owner_session_digest64"] for item in commands} == {
        hashlib.sha256(BROWSER_TOKEN.encode()).hexdigest(),
        hashlib.sha256(OTHER_BROWSER.encode()).hexdigest(),
    }
    for item in commands:
        acked = worker_post(acknowledge, {
            "owner_session_digest64": item["owner_session_digest64"],
            "id": item["id"],
            "lease_id": item["lease_id"],
            "payload_sha256": item["payload_sha256"],
            "result": {"ok": True},
        }, host="portal.example", secure=True, remote="203.0.113.9")
        assert acked.status_code == 200
        assert body(acked) == {"id": item["id"], "state": "completed"}
    assert set(ResidentCommand.objects.values_list("state", flat=True)) == {"completed"}


def test_exact_loopback_http_is_permitted():
    enqueue(BROWSER_TOKEN, "read_request", {"request_id": "abc"}, uuid4())
    response = worker_post(
        claim, {"session_key": BROWSER_TOKEN}, secure=False, remote="127.0.0.1",
    )
    assert response.status_code == 200
    assert len(body(response)["commands"]) == 1


def test_expired_reclaimed_lease_stale_ack_conflicts():
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "comment", command_payload(), command_id)
    first = claim_commands(BROWSER_TOKEN)[0]
    ResidentCommand.objects.filter(pk=command_id).update(
        lease_until=timezone.now() - timedelta(seconds=1),
    )
    second = claim_commands(BROWSER_TOKEN)[0]
    assert second["lease_id"] != first["lease_id"]
    stale = worker_post(acknowledge, {
        "session_key": BROWSER_TOKEN, "id": str(command_id),
        "lease_id": first["lease_id"], "payload_sha256": first["payload_sha256"],
        "result": {"ok": True},
    })
    assert stale.status_code == 409
    current = worker_post(acknowledge, {
        "session_key": BROWSER_TOKEN, "id": str(command_id),
        "lease_id": second["lease_id"], "payload_sha256": second["payload_sha256"],
        "result": {"ok": True},
    })
    assert current.status_code == 200


def test_another_browser_cannot_read_or_acknowledge():
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "read_request", {"request_id": "abc"}, command_id)
    with pytest.raises(ResidentInboxNotFound):
        read_owned(OTHER_BROWSER, command_id)
    assert claim_commands(OTHER_BROWSER) == []
    item = claim_commands(BROWSER_TOKEN)[0]
    denied = worker_post(acknowledge, {
        "session_key": OTHER_BROWSER, "id": str(command_id),
        "lease_id": item["lease_id"], "payload_sha256": item["payload_sha256"],
        "result": {"ok": True},
    })
    assert denied.status_code == 404


def test_global_claim_cannot_be_acked_with_another_returned_owner():
    first_id, second_id = uuid4(), uuid4()
    enqueue(BROWSER_TOKEN, "comment", {"n": 1}, first_id)
    enqueue(OTHER_BROWSER, "comment", {"n": 2}, second_id)
    commands = worker_post(
        claim, {}, host="portal.example", secure=True, remote="203.0.113.9",
    )
    assert commands.status_code == 200
    first, second = body(commands)["commands"]
    denied = worker_post(acknowledge, {
        "owner_session_digest64": second["owner_session_digest64"],
        "id": first["id"], "lease_id": first["lease_id"],
        "payload_sha256": first["payload_sha256"], "result": {"ok": True},
    }, host="portal.example", secure=True, remote="203.0.113.9")
    assert denied.status_code == 404
    accepted = worker_post(acknowledge, {
        "owner_session_digest64": first["owner_session_digest64"],
        "id": first["id"], "lease_id": first["lease_id"],
        "payload_sha256": first["payload_sha256"], "result": {"ok": True},
    }, host="portal.example", secure=True, remote="203.0.113.9")
    assert accepted.status_code == 200


def test_canonical_replay_is_idempotent_and_changes_conflict():
    command_id = uuid4()
    first = enqueue(BROWSER_TOKEN, "create_request", {"b": 2, "a": 1}, command_id)
    replay = enqueue(BROWSER_TOKEN, "create_request", {"a": 1, "b": 2}, command_id)
    assert replay.pk == first.pk
    assert ResidentCommand.objects.count() == 1
    with pytest.raises(ResidentInboxConflict):
        enqueue(BROWSER_TOKEN, "comment", {"a": 1, "b": 2}, command_id)
    with pytest.raises(ResidentInboxConflict):
        enqueue(OTHER_BROWSER, "create_request", {"a": 1, "b": 2}, command_id)
    with pytest.raises(ResidentInboxConflict):
        enqueue(BROWSER_TOKEN, "create_request", {"a": 9, "b": 2}, command_id)


def test_claim_is_bounded_to_ten_commands():
    for number in range(12):
        enqueue(BROWSER_TOKEN, "comment", {"n": number}, uuid4())
    first = claim_commands(BROWSER_TOKEN)
    second = claim_commands(BROWSER_TOKEN)
    assert len(first) == 10
    assert len(second) == 2
    assert {item["payload"]["n"] for item in first + second} == set(range(12))


def test_rate_limit_uses_persisted_count(monkeypatch):
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", "10")
    for number in range(10):
        enqueue(BROWSER_TOKEN, "comment", {"n": number}, uuid4())
    with pytest.raises(ResidentInboxRateLimited):
        enqueue(BROWSER_TOKEN, "comment", {"n": 10}, uuid4())
    enqueue(OTHER_BROWSER, "comment", {"n": 10}, uuid4())


def test_payload_and_result_size_bounds():
    oversized = "x" * (14 * 1024**2 + 1)
    with pytest.raises(ResidentInboxTooLarge):
        enqueue(BROWSER_TOKEN, "comment", {"body": oversized}, uuid4())
    command_id = uuid4()
    enqueue(BROWSER_TOKEN, "comment", {"body": "ok"}, command_id)
    item = claim_commands(BROWSER_TOKEN)[0]
    response = worker_post(acknowledge, {
        "session_key": BROWSER_TOKEN, "id": str(command_id),
        "lease_id": item["lease_id"], "payload_sha256": item["payload_sha256"],
        "result": {"body": "x" * (1024**2 + 1)},
    })
    assert response.status_code == 413


def test_unknown_operation_and_non_json_payload_are_rejected():
    with pytest.raises(ResidentInboxRejected):
        enqueue(BROWSER_TOKEN, "delete_request", {"a": 1}, uuid4())
    with pytest.raises(ResidentInboxRejected):
        enqueue(BROWSER_TOKEN, "comment", {"bad": object()}, uuid4())
