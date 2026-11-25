from __future__ import annotations

import io
import json
import zipfile
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
from test_service_requests_api import BASE, _create_category, _create_request

pytest_plugins = ["test_service_requests_api"]

PROOF = "test-staff-proof"
HEADERS = {"X-Townlight-Session": PROOF}
PERMIT_PATH = "/desktop/v1/permitting/cases/{case_id}"
INSPECTION_PATH = "/desktop/v1/inspections/cases/{case_id}"
PARCEL_PATH = "/desktop/v1/zoning/parcels/lookup"


class ReceivingDouble:
    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.failure_status: int | None = None
        self.parcel_payload: dict = {}


def _install_receiving_doubles(app: FastAPI) -> ReceivingDouble:
    state = ReceivingDouble()
    app.state.receiving_double = state

    def require_proof(request: Request) -> None:
        if request.headers.get("X-Townlight-Session") != PROOF:
            raise HTTPException(status_code=401, detail="staff proof required")

    def record(request: Request, body: dict | None = None) -> None:
        state.calls.append(
            {
                "method": request.method,
                "path": request.url.path,
                "query": request.url.query,
                "proof": request.headers.get("X-Townlight-Session"),
                "body": body,
            }
        )

    @app.get(PERMIT_PATH)
    async def receive_permit(case_id: str, request: Request):
        record(request)
        require_proof(request)
        if state.failure_status is not None:
            raise HTTPException(status_code=state.failure_status, detail="receiving")
        return {
            "entity_id": case_id,
            "payload": {
                "project_name": "Bridge Replacement",
                "property_reference": "P-17",
            },
        }

    @app.get(INSPECTION_PATH)
    async def receive_inspection(case_id: str, request: Request):
        record(request)
        require_proof(request)
        if state.failure_status is not None:
            raise HTTPException(status_code=state.failure_status, detail="receiving")
        return {
            "entity_id": case_id,
            "payload": {
                "project_name": "Final Inspection",
                "property_reference": "P-17",
            },
        }

    @app.post(PARCEL_PATH)
    async def receive_parcel(request: Request):
        body = await request.json()
        record(request, body)
        require_proof(request)
        if state.failure_status is not None:
            raise HTTPException(status_code=state.failure_status, detail="receiving")
        return dict(state.parcel_payload)

    return state


def _link_payload(
    expected_revision: int,
    *,
    kind: str = "permit",
    identifier: str | None = None,
    confirm: bool = True,
) -> dict:
    return {
        "kind": kind,
        "identifier": identifier or str(uuid4()),
        "jurisdiction": "Springfield",
        "expected_revision": expected_revision,
        "confirm": confirm,
    }


def _records_for(client: TestClient, app_env) -> dict:
    app_env.install_actor(app_env.admin, "local-admin")
    _create_category(client)
    created = _create_request(client)
    app_env.install_actor(app_env.staff, "city-staff")
    return created


def test_lookup_uses_fixed_case_paths_and_forwards_staff_proof(app_env):
    receiving = _install_receiving_doubles(app_env.app)
    permit_id = str(uuid4())
    inspection_id = str(uuid4())

    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.staff, "city-staff")

        permit = client.post(
            f"{BASE}/record-lookup",
            headers=HEADERS,
            json={"kind": "permit", "identifier": permit_id},
        )
        assert permit.status_code == 200, permit.text
        assert permit.json() == {
            "kind": "permit",
            "target_id": permit_id,
            "label": "Bridge Replacement",
            "identifier": permit_id,
            "jurisdiction": None,
        }

        inspection = client.post(
            f"{BASE}/record-lookup",
            headers=HEADERS,
            json={"kind": "inspection", "identifier": inspection_id},
        )
        assert inspection.status_code == 200, inspection.text
        assert inspection.json()["label"] == "Final Inspection"

    assert [
        (call["method"], call["path"], call["query"], call["proof"])
        for call in receiving.calls
    ] == [
        ("GET", f"/desktop/v1/permitting/cases/{permit_id}", "", PROOF),
        ("GET", f"/desktop/v1/inspections/cases/{inspection_id}", "", PROOF),
    ]


def test_parcel_lookup_uses_top_level_address_and_requires_canonical_uuid(app_env):
    receiving = _install_receiving_doubles(app_env.app)
    parcel_id = str(uuid4())
    receiving.parcel_payload = {
        "status": "ok",
        "parcel_id": parcel_id,
        "address": "123 Main Street",
        "payload": {"address": "nested address", "parcel_number": "APN-9"},
    }

    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.staff, "city-staff")

        found = client.post(
            f"{BASE}/record-lookup",
            headers=HEADERS,
            json={
                "kind": "parcel",
                "identifier": "APN-9",
                "jurisdiction": "Springfield",
            },
        )
        assert found.status_code == 200, found.text
        assert found.json() == {
            "kind": "parcel",
            "target_id": parcel_id,
            "label": "123 Main Street",
            "identifier": "APN-9",
            "jurisdiction": "Springfield",
        }

        receiving.parcel_payload = {
            "status": "ok",
            "parcel_id": parcel_id.upper(),
            "address": "123 Main Street",
        }
        noncanonical = client.post(
            f"{BASE}/record-lookup",
            headers=HEADERS,
            json={"kind": "parcel", "identifier": "APN-9"},
        )
        assert noncanonical.status_code == 502

    assert len(receiving.calls) == 2
    assert receiving.calls[0]["method"] == "POST"
    assert receiving.calls[0]["path"] == PARCEL_PATH
    assert receiving.calls[0]["proof"] == PROOF
    assert receiving.calls[0]["body"] == {
        "jurisdiction": "Springfield",
        "query": "APN-9",
    }


def test_receiving_forbidden_prevents_record_link(app_env):
    receiving = _install_receiving_doubles(app_env.app)
    receiving.failure_status = 403

    with TestClient(app_env.app) as client:
        created = _records_for(client, app_env)

        response = client.post(
            f"{BASE}/requests/{created['id']}/links",
            headers=HEADERS,
            json=_link_payload(created["revision"]),
        )
        assert response.status_code == 403

        refreshed = client.get(f"{BASE}/requests/{created['id']}")
        assert refreshed.status_code == 200, refreshed.text
        assert refreshed.json()["revision"] == created["revision"]
        assert refreshed.json().get("links", []) == []

    assert len(receiving.calls) == 1
    assert receiving.calls[0]["proof"] == PROOF


def test_link_requires_current_revision_and_explicit_confirmation(app_env):
    receiving = _install_receiving_doubles(app_env.app)

    with TestClient(app_env.app) as client:
        created = _records_for(client, app_env)

        stale = client.post(
            f"{BASE}/requests/{created['id']}/links",
            headers=HEADERS,
            json=_link_payload(created["revision"] + 1),
        )
        assert stale.status_code == 409

        unconfirmed = client.post(
            f"{BASE}/requests/{created['id']}/links",
            headers=HEADERS,
            json=_link_payload(created["revision"], confirm=False),
        )
        assert unconfirmed.status_code == 422

        refreshed = client.get(f"{BASE}/requests/{created['id']}")
        assert refreshed.json()["revision"] == created["revision"]
        assert refreshed.json().get("links", []) == []

    assert len(receiving.calls) == 1


def test_successful_link_is_persisted_and_private_to_resident(app_env):
    _install_receiving_doubles(app_env.app)
    permit_id = str(uuid4())
    resident_token = "r" * 32
    expected_event = {
        "target_type": "permit",
        "target_id": permit_id,
        "label": "Bridge Replacement",
    }

    with TestClient(app_env.app) as client:
        created = _records_for(client, app_env)

        response = client.post(
            f"{BASE}/requests/{created['id']}/links",
            headers=HEADERS,
            json=_link_payload(created["revision"], identifier=permit_id),
        )
        assert response.status_code == 200, response.text
        linked = response.json()
        assert linked["revision"] == created["revision"] + 1

        fetched = client.get(f"{BASE}/requests/{created['id']}")
        assert fetched.status_code == 200, fetched.text
        assert fetched.json() == linked

        persisted = app_env.repository.get_staff(created["id"])
        assert persisted["id"] == created["id"]
        assert persisted["revision"] == linked["revision"]
        assert persisted["events"][-1]["payload"] == expected_event
        assert persisted["events"][-1]["public"] is False

        resident_view = app_env.repository.get_resident(created["id"], resident_token)
        assert permit_id not in json.dumps(resident_view)
        assert all(
            event.get("payload", {}).get("target_id") != permit_id
            for event in resident_view.get("events", [])
        )

        archived = client.get(f"{BASE}/requests/{created['id']}/archive")
        assert archived.status_code == 200, archived.text
        with zipfile.ZipFile(io.BytesIO(archived.content)) as bundle:
            archived_request = json.loads(bundle.read("request.json"))

    assert any(
        event.get("payload") == expected_event
        for event in archived_request.get("events", [])
    )
