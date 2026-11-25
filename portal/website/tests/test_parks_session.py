# SPDX-License-Identifier: AGPL-3.0-only
import json
import uuid

import pytest
from django.contrib.sessions.backends.db import SessionStore

from website.models import ResidentCommand
from website.resident_inbox import _fernet
from test_resident_catalog import catalog_env  # noqa: F401
from website import parks_session

pytestmark = pytest.mark.django_db


def _decrypt(value):
    return json.loads(_fernet().decrypt(value.encode("ascii")).decode("utf-8"))


def test_session_command_is_encrypted_and_owner_bound(catalog_env):
    token = "P" * 43
    household = str(uuid.uuid4())
    session = SessionStore()
    session.create()
    parks_session.save_credential(session, token, household)
    session.save()

    raw = json.dumps(dict(session), sort_keys=True)
    assert token not in raw
    assert household not in raw
    vault = _decrypt(session[parks_session.VAULT_KEY])
    assert vault["tracking_token"] == token
    assert vault["household_id"] == household

    command_id = parks_session.submit(session, "parks_read_household", {})
    row = ResidentCommand.objects.get(pk=command_id)
    assert row.state == "queued"
    assert token not in row.encrypted_payload
    assert household not in row.encrypted_payload
    assert _decrypt(row.encrypted_payload) == {"tracking_token": token}

    queued = parks_session.read(session, command_id)
    assert queued["state"] == "queued"
    assert queued["result"] is None

    other = SessionStore()
    other.create()
    with pytest.raises(parks_session.ParksSessionNotFound):
        parks_session.read(other, command_id)

    with pytest.raises(parks_session.ParksSessionRejected):
        parks_session.submit(session, "parks_delete_everything", {})
    with pytest.raises(parks_session.ParksSessionRejected):
        parks_session.submit(
            session, "parks_read_household", {"tracking_token": token}
        )


def test_completed_household_result_stores_only_encrypted_credentials(catalog_env):
    contact = {
        "contact_name": "Ada Lovelace",
        "email": "ada@example.com",
        "phone": "+15550100",
        "address": "1 Analytical Engine Way",
        "language": "en",
    }
    session = SessionStore()
    session.create()
    command_id = parks_session.submit(
        session, "parks_create_household", {"household": contact}
    )
    row = ResidentCommand.objects.get(pk=command_id)

    result_token = "Q" * 43
    household = str(uuid.uuid4())
    result = {
        "id": household,
        "tracking_token": result_token,
        "snapshot": contact,
    }
    row.state = "completed"
    row.encrypted_result = _fernet().encrypt(
        json.dumps(result, separators=(",", ":")).encode("utf-8")
    ).decode("ascii")
    row.save(update_fields=["state", "encrypted_result"])

    completed = parks_session.read(session, command_id)
    assert completed["state"] == "completed"
    assert completed["result"]["id"] == household
    assert completed["result"]["snapshot"]["email"] == contact["email"]

    raw = json.dumps(dict(session), sort_keys=True)
    assert result_token not in raw
    assert household not in raw
    vault = _decrypt(session[parks_session.VAULT_KEY])
    assert vault["tracking_token"] == result_token
    assert vault["household_id"] == household
    assert parks_session.credential(session) == result_token
    assert parks_session.household_id(session) == household

    other = SessionStore()
    other.create()
    assert parks_session.credential(other) is None
    with pytest.raises(parks_session.ParksSessionNotFound):
        parks_session.read(other, command_id)
