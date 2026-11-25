from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from uuid import UUID

from fastapi.testclient import TestClient
from townlight_permitting.migrations import source_engine, upgrade
from townlight_records.database import get_async_session
from townlight_runtime import permitting_bridge

pytest_plugins = ["test_service_requests_api"]

from test_service_requests_api import (
    BASE,
    SyncSessionAdapter,
    _create_category,
    _create_request,
    _write_native_config,
)

PERMITTING = "/desktop/v1/permitting"
STAFF_VERIFIER = "synthetic-city-staff-verifier"
CLERK_VERIFIER = "synthetic-clerk-verifier"


class CommittingAdapter(SyncSessionAdapter):
    async def commit(self):
        self.session.commit()


def _session(profile_root, email, role, verifier):
    expiry = int(time.time()) + 3600
    key = secrets.token_bytes(32)
    (profile_root / "session-mac-secret.key").write_text(key.hex(), encoding="utf-8")
    message = f"{email.lower()}\n{role}\n{expiry}\n{verifier}".encode()
    proof = hmac.new(key, message, hashlib.sha256).hexdigest()
    (profile_root / "config" / "local-session.json").write_text(
        json.dumps(
            {
                "email": email,
                "role": role,
                "expires_at_unix_seconds": expiry,
                "session_hash": proof,
            }
        ),
        encoding="utf-8",
    )
    return proof


def _login(client, profile_root, email, role, verifier):
    client.headers["X-Townlight-Session"] = _session(
        profile_root, email, role, verifier
    )


def test_real_permitting_311_link_and_privacy(app_env, tmp_path, monkeypatch):
    app_env.app.include_router(permitting_bridge.router)
    app_env.app.state.desktop_enabled_modules = permitting_bridge.REQUIRED | {
        "townlight_311"
    }
    app_env.app.state.desktop_domain_enabled = True

    url = "sqlite:///" + str(tmp_path / "permitting.sqlite3")
    monkeypatch.setenv("DATABASE_URL", url)
    engine = source_engine(url)
    upgrade(engine)
    engine.dispose()

    async def bounded_session():
        session = CommittingAdapter(app_env.engine)
        try:
            yield session
        finally:
            session.close()

    app_env.app.dependency_overrides[get_async_session] = bounded_session

    clerk = app_env.make_user("clerk@example.test")
    _write_native_config(
        app_env.profile_root,
        staff=[
            {
                "email": app_env.staff.email,
                "role": "city-staff",
                "display_name": "City Staff",
                "passcode_hash": STAFF_VERIFIER,
                "active": True,
            },
            {
                "email": clerk.email,
                "role": "clerk",
                "display_name": "Clerk",
                "passcode_hash": CLERK_VERIFIER,
                "active": True,
            },
        ],
    )
    app_env.add_native_link(app_env.admin, "local-admin")
    app_env.add_native_link(app_env.staff, "city-staff")
    app_env.add_native_link(clerk, "clerk")

    public_description = "Streetlight outage near the public library."
    project_name = "Riverton Solar Canopy 4f7a"
    applicant_contact = "PRIVATE applicant contact 555-0100"
    staff_notes = "PRIVATE staff notes for intake review."
    project_description = "PRIVATE proposal narrative for the solar canopy."
    permitting_location = "PRIVATE 10 Permit Way"

    with TestClient(app_env.app) as client:
        _login(client, app_env.profile_root, app_env.admin.email, "local-admin", "unused")
        _create_category(client, "streetlight")
        request = _create_request(
            client,
            category="streetlight",
            description=public_description,
            location="20 Oak Avenue",
        )
        request_id = request["id"]

        raw = b"Fictional Riverton permitting manual: submit a site plan."
        bundle = {
            "requirement_id": "solar-canopy",
            "title": "Fictional solar canopy requirements",
            "jurisdiction": "Fictional Riverton",
            "project_type": "solar canopy",
            "source_reference": "Fictional permitting manual, section 1",
            "source_date": "2026-01-01",
            "effective_on": "2026-02-01",
            "dataset_kind": "fictional",
            "filename": "solar-canopy.txt",
            "content_base64": base64.b64encode(raw).decode(),
            "sha256": hashlib.sha256(raw).hexdigest(),
            "materials": [
                {
                    "material_id": "site",
                    "description": "Site plan",
                    "citation": "Fictional manual section 1",
                }
            ],
            "change_note": "Fictional configured municipal requirements",
        }

        _login(
            client,
            app_env.profile_root,
            app_env.staff.email,
            "city-staff",
            STAFF_VERIFIER,
        )
        imported = client.post(f"{PERMITTING}/requirements", json={"bundle": bundle})
        assert imported.status_code == 200, imported.text
        revision_id = imported.json()["revision_id"]

        case_body = {
            "project_name": project_name,
            "project_description": project_description,
            "location": permitting_location,
            "applicant_contact": applicant_contact,
            "staff_notes": staff_notes,
            "requirement_revision": revision_id,
            "materials": [{"material_id": "site", "status": "provided"}],
            "linked_sources": [],
        }
        created = client.post(f"{PERMITTING}/cases", json=case_body)
        assert created.status_code == 200, created.text
        case_id = str(UUID(created.json()["entity_id"]))

        fetched_case = client.get(f"{PERMITTING}/cases/{case_id}")
        assert fetched_case.status_code == 200, fetched_case.text
        case = fetched_case.json()
        assert case["entity_id"] == case_id
        assert case["payload"]["project_name"] == project_name
        assert case["payload"]["applicant_contact"] == applicant_contact
        assert case["payload"]["staff_notes"] == staff_notes
        assert case["payload"]["requirement_revision"] == revision_id

        lookup_payload = {
            "kind": "permit",
            "identifier": case_id,
            "jurisdiction": "Fictional Riverton",
        }
        link_payload = {
            **lookup_payload,
            "expected_revision": request["revision"],
            "confirm": True,
        }

        before = app_env.repository.get_staff(request_id)
        _login(client, app_env.profile_root, clerk.email, "clerk", CLERK_VERIFIER)
        assert client.get(f"{BASE}/requests/{request_id}").status_code == 200
        assert client.get(f"{PERMITTING}/cases/{case_id}").status_code == 403
        assert client.post(f"{BASE}/record-lookup", json=lookup_payload).status_code == 403
        assert (
            client.post(f"{BASE}/requests/{request_id}/links", json=link_payload).status_code
            == 403
        )
        after = app_env.repository.get_staff(request_id)
        assert after["revision"] == before["revision"]
        assert len(after["events"]) == len(before["events"])

        client.headers.pop("X-Townlight-Session", None)
        assert client.get(f"{PERMITTING}/cases/{case_id}").status_code == 401
        client.headers["X-Townlight-Session"] = "0" * 64
        assert client.get(f"{PERMITTING}/cases/{case_id}").status_code == 401

        _login(
            client,
            app_env.profile_root,
            app_env.staff.email,
            "city-staff",
            STAFF_VERIFIER,
        )
        assert client.get(f"{PERMITTING}/cases/{case_id}").status_code == 200
        found = client.post(f"{BASE}/record-lookup", json=lookup_payload)
        assert found.status_code == 200, found.text
        lookup = found.json()
        assert lookup["kind"] == "permit"
        assert lookup["target_id"] == case_id
        assert lookup["label"] == project_name

        linked_response = client.post(
            f"{BASE}/requests/{request_id}/links", json=link_payload
        )
        assert linked_response.status_code == 200, linked_response.text
        linked = linked_response.json()
        assert linked["revision"] == request["revision"] + 1
        fetched_request = client.get(f"{BASE}/requests/{request_id}")
        assert fetched_request.status_code == 200
        assert fetched_request.json() == linked

        persisted = app_env.repository.get_staff(request_id)
        assert persisted["revision"] == linked["revision"]
        event = persisted["events"][-1]
        assert event["payload"] == {
            "target_type": "permit",
            "target_id": case_id,
            "label": project_name,
        }
        assert event["public"] is False

        resident = app_env.repository.get_resident(request_id, "r" * 32)
        assert resident["id"] == request_id
        blob = json.dumps(resident)
        assert public_description in blob
        assert project_description not in blob
        assert case_id not in blob
        assert project_name not in blob
        assert applicant_contact not in blob
        assert staff_notes not in blob
        assert permitting_location not in blob
        assert raw.decode() not in blob
        assert all(
            item.get("payload", {}).get("target_id") != case_id
            for item in resident.get("events", [])
        )
