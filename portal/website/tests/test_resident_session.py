# SPDX-License-Identifier: AGPL-3.0-only
import secrets
import uuid

import pytest
from cryptography.fernet import Fernet
from django.contrib.sessions.backends.db import SessionStore

from website.models import ResidentCommand
from website.resident_inbox import (
    ResidentInboxNotFound,
    acknowledge_command,
    claim_commands,
)
from website.resident_session import (
    PENDING_LIMIT,
    VAULT_KEY,
    ResidentSessionRejected,
    begin_recovery,
    complete_recovery,
    create_request,
    credential,
    lookup,
    mark_recovered,
    mark_successful,
    normalize_tracking,
    pending_token,
    save_credential,
    status,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def resident_key(tmp_path, monkeypatch):
    key = tmp_path / "resident.key"
    key.write_bytes(Fernet.generate_key())
    monkeypatch.setenv("TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE", str(key))
    monkeypatch.delenv("TOWNLIGHT_PORTAL_RESIDENT_COMMANDS_PER_HOUR", raising=False)
    return key


@pytest.fixture
def session():
    value = SessionStore()
    value.create()
    value.save()
    return value


def ack(session, command_id, result, *, failed=False):
    item = next(
        command for command in claim_commands(session.session_key)
        if command["id"] == str(command_id)
    )
    return acknowledge_command(
        session.session_key, command_id, item["lease_id"],
        item["payload_sha256"], result, failed,
    )


def make_create(session, command_id, **overrides):
    values = {
        "category": "roads",
        "description": "Pothole in the eastbound lane",
        "location": "Main St",
        "contact_name": "Resident",
        "email": "resident@example.com",
        "phone": "",
        "command_id": command_id,
    }
    values.update(overrides)
    return create_request(session, **values)


def test_vault_is_ciphertext_and_credential_rotates(session):
    request_id = str(uuid.uuid4())
    first = secrets.token_urlsafe(32)
    second = secrets.token_urlsafe(32)
    save_credential(session, request_id, first)
    raw = session[VAULT_KEY]
    assert isinstance(raw, str)
    assert first not in raw and request_id not in raw
    assert credential(session, request_id) == first
    save_credential(session, request_id, second)
    assert credential(session, request_id) == second
    assert lookup(session, first) is None
    assert lookup(session, second) == request_id


def test_invalid_uuid_and_token_are_rejected_without_leaking(session):
    token = secrets.token_urlsafe(32)
    with pytest.raises(ResidentSessionRejected) as error:
        save_credential(session, "not-a-uuid", token)
    assert token not in str(error.value)
    with pytest.raises(ResidentSessionRejected):
        save_credential(session, str(uuid.uuid4()), "short")
    with pytest.raises(ResidentSessionRejected):
        lookup(session, "not-a-token")


def test_create_is_idempotent_and_uses_exact_intake_shape(session):
    command_id = uuid.uuid4()
    assert make_create(session, command_id) == str(command_id)
    token = pending_token(session, command_id)
    assert token and token not in session[VAULT_KEY]
    assert make_create(session, command_id) == str(command_id)
    assert pending_token(session, command_id) == token
    assert ResidentCommand.objects.count() == 1

    item = claim_commands(session.session_key)[0]
    assert item["operation"] == "create_request"
    assert item["payload"] == {
        "category": "roads",
        "description": "Pothole in the eastbound lane",
        "location": "Main St",
        "contact": {
            "name": "Resident",
            "email": "resident@example.com",
            "phone": "",
        },
        "resident_token": token,
    }
    assert token not in ResidentCommand.objects.get(pk=command_id).encrypted_payload


def test_successful_result_maps_request_id_only_after_completion(session):
    command_id = uuid.uuid4()
    request_id = str(uuid.uuid4())
    make_create(session, command_id)
    token = pending_token(session, command_id)

    assert mark_successful(session, command_id) is None
    assert credential(session, request_id) is None

    ack(session, command_id, {"id": request_id, "tracking": "TL311-" + request_id.replace("-", "")})
    assert status(session, command_id)["state"] == "completed"
    assert mark_successful(session, command_id) == request_id
    assert credential(session, request_id) == token
    assert lookup(session, token) == request_id


def test_recovery_tracking_is_normalized_and_rotates_credential(session):
    tracking_id = uuid.uuid4()
    started = uuid.uuid4()
    begin_recovery(session, str(tracking_id), "resident@example.com", started)
    item = claim_commands(session.session_key)[0]
    assert item["payload"] == {
        "tracking": "TL311-" + tracking_id.hex,
        "email": "resident@example.com",
    }
    assert normalize_tracking("tl311-" + tracking_id.hex) == "TL311-" + tracking_id.hex
    acknowledge_command(
        session.session_key, started, item["lease_id"],
        item["payload_sha256"], {"challenge_id": None},
    )

    completed = uuid.uuid4()
    request_id = str(uuid.uuid4())
    complete_recovery(session, uuid.uuid4(), "123456", completed)
    new_token = pending_token(session, completed)
    assert new_token and new_token not in session[VAULT_KEY]
    ack(session, completed, {
        "recovered": True,
        "request": {"id": request_id, "tracking": "TL311-" + request_id.replace("-", "")},
    })
    assert mark_recovered(session, completed) == request_id
    assert credential(session, request_id) == new_token


def test_status_is_owner_scoped(session):
    command_id = uuid.uuid4()
    make_create(session, command_id)
    other = SessionStore()
    other.create()
    other.save()
    with pytest.raises(ResidentInboxNotFound):
        status(other, command_id)
    with pytest.raises(ResidentInboxNotFound):
        other_status = status(other, command_id)
        other_status["state"]


def test_pending_vault_is_bounded_and_audit_rows_remain(session):
    command_ids = [uuid.uuid4() for _ in range(PENDING_LIMIT + 1)]
    for number, command_id in enumerate(command_ids):
        make_create(session, command_id, description=f"Pothole {number}")
    assert pending_token(session, command_ids[0]) is None
    assert pending_token(session, command_ids[-1]) is not None
    assert ResidentCommand.objects.count() == PENDING_LIMIT + 1


def test_failed_create_does_not_map_a_credential(session):
    command_id = uuid.uuid4()
    request_id = str(uuid.uuid4())
    make_create(session, command_id)
    ack(session, command_id, {"id": request_id}, failed=True)
    assert mark_successful(session, command_id) is None
    assert credential(session, request_id) is None
