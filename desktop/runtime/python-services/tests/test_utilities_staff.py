"""Local API acceptance with real 311 storage and bridge; no installed-PC claim."""
import os

os.environ.setdefault("TESTING", "true")

import secrets
from types import SimpleNamespace
from uuid import uuid4

import pytest
from civicutility.workflow import UtilityWorkflowRepository
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from townlight_311.models import events, notifications
from townlight_311.store import Unauthorized
from townlight_311.workflow import ServiceRequestRepository
from townlight_records.database import get_async_session
from townlight_runtime import utilities_staff as staff
from townlight_runtime.utilities_bridge import UtilitiesRequestBridge

POLICY = {
    "policy_id": "fictional-city-payment-options", "version": 3,
    "title": "Fictional city payment options",
    "text": "Ask the city cashier about approved payment options; no payment is processed here.",
    "citation": "Fictional City Utility Payment Policy 7.3", "approved": True,
}
BODY = "Ask the city cashier about the approved payment options in the cited policy."
NOTES = "PRIVATE-STAFF-NOTES: keep this out of the tracker and notification."


class LostResponseBridge:
    """Lose one response after the actual 311 transaction commits."""
    def __init__(self, delegate):
        self.delegate = delegate
        self.lost = False

    def read_request(self, principal, request_id):
        return self.delegate.read_request(principal, request_id)

    def post_reply(self, principal, request_id, body, citations, idempotency_key):
        receipt = self.delegate.post_reply(principal, request_id, body, citations, idempotency_key)
        if not self.lost:
            self.lost = True
            raise TimeoutError("Simulated response loss after the real 311 commit")
        return receipt


@pytest.fixture

def h(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / '311.sqlite'}", future=True)
    requests = ServiceRequestRepository(engine)
    requests.save_category("utilities", "Utilities", "City", True, "admin")
    token = secrets.token_urlsafe(32)
    created = requests.execute_resident_command(str(uuid4()), "create_request", {
        "category": "utilities", "description": "What payment options are available?",
        "location": "1 Main Street",
        "contact": {"name": "Resident Example", "email": "resident@example.com", "phone": ""},
        "resident_token": token,
    })
    bridge = UtilitiesRequestBridge(requests)
    database = str(tmp_path / "utilities.sqlite")
    role = {"value": "local-admin"}
    actor_id = uuid4()

    async def mapper(request, session, proof, module):
        assert module == "townlight_utilities"
        request.state.native_role = role["value"]
        return SimpleNamespace(id=actor_id, full_name="Avery Clerk")

    async def session_stub():
        yield None

    monkeypatch.setattr(staff, "mapped_native_actor", mapper)
    app = FastAPI()
    app.include_router(staff.router)
    app.state.desktop_enabled_modules = {"townlight_utilities"}
    app.state.desktop_utilities = UtilityWorkflowRepository(database, bridge)
    app.dependency_overrides[get_async_session] = session_stub
    client = TestClient(app)
    assert client.post("/desktop/v1/utilities/policies", json=POLICY).status_code == 200
    role["value"] = "clerk"
    yield SimpleNamespace(client=client, app=app, role=role, requests=requests,
                          bridge=bridge, database=database, token=token, id=created["id"],
                          actor_id=str(actor_id), path=f"/desktop/v1/utilities/requests/{created['id']}")
    client.close()
    engine.dispose()


def save(h):
    opened = h.client.get(h.path)
    assert opened.status_code == 200, opened.text
    assert opened.json()["request"]["request_id"] == h.id
    assert opened.json()["request"]["description"] == "What payment options are available?"
    response = h.client.post(h.path + "/draft", json={
        "policy_id": POLICY["policy_id"], "policy_version": 3, "body": BODY,
        "private_notes": NOTES, "expected_revision": None,
    })
    assert response.status_code == 200, response.text
    return response.json()


def public_rows(h):
    with h.requests.engine.connect() as conn:
        comments = conn.execute(select(events).where(
            events.c.request_id == h.id, events.c.kind == "comment", events.c.public.is_(True),
        )).mappings().all()
        messages = conn.execute(select(notifications).where(
            notifications.c.request_id == h.id,
        )).mappings().all()
    return comments, messages


def test_approved_reply_is_cited_private_and_durable(h):
    saved = save(h)
    assert saved["drafted_by_actor_id"] == h.actor_id
    before_comments, before_notifications = public_rows(h)
    approved = h.client.post(h.path + "/approve", json={"expected_revision": 1, "confirm": True})
    assert approved.status_code == 200, approved.text
    result = approved.json()
    assert result["delivered"] is True
    assert result["status"] == "delivered"
    receipt = result["receipt"]
    assert receipt["request_id"] == h.id
    comments, messages = public_rows(h)
    assert len(comments) == len(before_comments) + 1
    assert len(messages) == len(before_notifications) + 1
    assert comments[-1]["id"] == receipt["comment_id"]
    assert messages[-1]["event_id"] == receipt["comment_id"]
    resident = h.requests.get_resident(h.id, h.token)
    assert any(BODY in e.get("message", "") and POLICY["citation"] in e.get("message", "")
               for e in resident["events"])
    assert NOTES not in repr(resident)
    assert NOTES not in repr(messages)
    with pytest.raises(Unauthorized):
        h.requests.get_resident(h.id, secrets.token_urlsafe(32))
    h.app.state.desktop_utilities = UtilityWorkflowRepository(h.database, h.bridge)
    recovered = h.client.get(h.path).json()["workpaper"]
    assert recovered == result["workpaper"]
    assert recovered["private_notes"] == NOTES
    assert recovered["approved_by_actor_id"] == h.actor_id
    assert recovered["approved_by_display_name"] == "Avery Clerk"
    assert recovered["policy_version"] == 3
    assert recovered["policy_citation"] == POLICY["citation"]


def test_timeout_after_real_commit_retries_once_after_reopen(h):
    save(h)
    before_comments, before_messages = public_rows(h)
    h.app.state.desktop_utilities = UtilityWorkflowRepository(h.database, LostResponseBridge(h.bridge))
    first = h.client.post(h.path + "/approve", json={"expected_revision": 1, "confirm": True}).json()
    assert first["status"] == "approved" and first["delivered"] is False
    assert "response loss" in first["error"]
    comments, messages = public_rows(h)
    assert len(comments) == len(before_comments) + 1
    assert len(messages) == len(before_messages) + 1
    key = first["workpaper"]["idempotency_key"]
    h.app.state.desktop_utilities = UtilityWorkflowRepository(h.database, h.bridge)
    retried = h.client.post(h.path + "/retry", json={"expected_revision": 2})
    assert retried.status_code == 200, retried.text
    assert retried.json()["delivered"] is True
    assert retried.json()["receipt"]["idempotency_key"] == key
    repeated = h.client.post(h.path + "/retry", json={"expected_revision": 2})
    assert repeated.json()["receipt"] == retried.json()["receipt"]
    assert tuple(map(len, public_rows(h))) == (len(comments), len(messages))


def test_authority_profile_and_input_guards(h):
    client = h.client
    assert client.post("/desktop/v1/utilities/policies", json=POLICY).status_code == 403
    h.role["value"] = "local-admin"
    for change in ({"actor_id": "spoof"}, {"role": "clerk"}, {"citation": " "}, {"approved": False}):
        assert client.post("/desktop/v1/utilities/policies", json={**POLICY, **change}).status_code == 422
    h.role["value"] = "resident"
    assert client.get(h.path).status_code == 403
    h.role["value"] = "clerk"
    h.app.state.desktop_enabled_modules = set()
    assert client.get(h.path).status_code == 403
    h.app.state.desktop_enabled_modules = {"townlight_utilities"}
    assert client.get(f"/desktop/v1/utilities/requests/{uuid4()}").status_code == 404


def test_revision_and_confirmation_guards(h):
    save(h)
    draft = {"policy_id": POLICY["policy_id"], "policy_version": 3, "body": BODY,
             "private_notes": NOTES, "expected_revision": None}
    assert h.client.post(h.path + "/draft", json=draft).status_code == 409
    assert h.client.post(h.path + "/approve", json={"expected_revision": 9, "confirm": True}).status_code == 409
    assert h.client.post(h.path + "/retry", json={"expected_revision": 9}).status_code == 409
    assert h.client.post(h.path + "/approve", json={"expected_revision": 1}).status_code == 422
    assert h.client.post(h.path + "/draft", json={**draft, "policy_id": "missing", "expected_revision": 1}).status_code == 422
