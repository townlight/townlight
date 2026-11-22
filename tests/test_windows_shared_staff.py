"""Shared staff gateway: isolated principals, bounded host paths and revocation."""

import hashlib
import json
from uuid import uuid4

from argon2 import PasswordHasher
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
import pytest

from townlight_records.auth.desktop_session import validate_native_session
from townlight_runtime.shared_staff import install_shared_staff
from townlight_runtime.shared_operations import SharedOperations


MEETING = "ea1a5515-a2bc-4bc5-aa7a-59b29d3a8ef4"
RECORD = "aa775f31-a5cc-436c-8a28-6773f9ebaf6d"
SESSION = "/staff/v1/session"
API = "/staff/v1/api/desktop/v1"


def staff(name, role, passcode):
    return {"display_name": name, "email": f"{name.lower()}@city.example", "role": role,
            "passcode_hash": PasswordHasher().hash(passcode), "passcode_algorithm": "argon2id-v1", "active": True}


@pytest.fixture
def gateway(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    admin, clerk, records = (staff("Admin", "local-admin", "admin-passphrase"),
                             staff("Clerk", "clerk", "clerk-passphrase"),
                             staff("Records", "records-staff", "records-passphrase"))
    (config / "first-admin.json").write_text(json.dumps(admin))
    users = config / "staff-users.json"
    users.write_text(json.dumps([clerk, records]))
    domain = FastAPI()

    def require(request, module):
        try:
            principal = validate_native_session(request.headers.get("x-townlight-session"), profile_root=tmp_path)
        except PermissionError:
            raise HTTPException(401, "Sign in.") from None
        if not principal.allows_module(module):
            raise HTTPException(403, "Access denied.")
        return principal

    @domain.post("/desktop/v1/meetings/meetings/{meeting}/packet-snapshots")
    def packet(request: Request, meeting: str, payload: dict):
        user = require(request, "townlight_meetings")
        if payload.get("stale"):
            raise HTTPException(409, {"current_revision": 3, "host_path": "C:/secret"})
        return {"identity": user.email, "meeting": meeting}

    @domain.get("/desktop/v1/records-state")
    def state(request: Request):
        return {"identity": require(request, "townlight_records").email}

    @domain.post("/desktop/v1/requests/{request_id}/documents/{attachment_id}/release-copy")
    def release_copy(request: Request, request_id: str, attachment_id: str, payload: dict):
        require(request, "townlight_records")
        return {**payload, "message": payload["file"]["stored_path"]}

    @domain.get("/desktop/v1/station/context")
    def station(request: Request):
        return {"identity": require(request, "townlight_records").email}

    app = FastAPI()
    install_shared_staff(app, domain, tmp_path)
    app.mount("/", domain)
    with TestClient(app) as client:
        yield client, users, clerk, records, tmp_path


def login(client, name):
    response = client.post(SESSION, json={"email": f"{name}@city.example", "passcode": f"{name}-passphrase"})
    assert response.status_code == 200
    return {"X-Townlight-Session": response.json()["proof"]}


def operation(session, operation_id=None):
    return {**session, "X-Townlight-Operation": operation_id or str(uuid4())}


def test_concurrent_roles_station_callback_and_account_changes(gateway):
    client, users, clerk, records, root = gateway
    clerk_session = login(client, "clerk")
    records_session = login(client, "records")
    assert not (root / "config" / "local-session.json").exists()
    packet = f"{API}/meetings/meetings/{MEETING}/packet-snapshots"
    assert client.post(packet, headers=operation(clerk_session), json={}).json()["identity"] == clerk["email"]
    assert client.post(packet, headers=operation(records_session), json={}).status_code == 403
    assert client.get(f"{API}/records-state", headers=clerk_session).status_code == 403
    assert client.get(f"{API}/records-state", headers=records_session).json()["identity"] == records["email"]
    assert client.get(f"{API}/records-state").status_code == 401
    assert client.get("/desktop/v1/records-state", headers=records_session).status_code == 401
    assert client.get("/desktop/v1/station/context?capability=read", headers=records_session).status_code == 200
    assert client.get("/desktop/v1/station/context?capability=capture", headers=records_session).status_code == 401
    assert client.get(f"{API}/station/context?capability=read", headers=records_session).status_code == 404
    assert client.delete(SESSION, headers=clerk_session).status_code == 200
    assert client.post(packet, headers=clerk_session, json={}).status_code == 401
    assert client.get(SESSION, headers=records_session).status_code == 200
    records["active"] = False
    users.write_text(json.dumps([clerk, records]))
    assert client.get(SESSION, headers=records_session).status_code == 401


def test_scoped_writes_conflict_and_verified_host_file(gateway):
    import base64

    client, users, clerk, records, root = gateway
    packet = f"{API}/meetings/meetings/{MEETING}/packet-snapshots"
    clerk_session = login(client, "clerk")
    records_session = login(client, "records")
    assert client.post(packet, headers=clerk_session, json={"source_files": [{"stored_path": "C:/host-only"}]}).status_code == 422
    conflict = client.post(packet, headers=operation(clerk_session), json={"stale": True})
    assert conflict.status_code == 409
    assert conflict.json() == {"detail": "The city host did not accept this operation.", "code": "revision-conflict", "current_revision": 3}
    path = f"{API}/requests/{RECORD}/documents/{MEETING}/release-copy"
    assert client.post(path, headers=records_session, json={"file": {"stored_path": "C:/host-only"}}).status_code == 422
    assert client.post(path, headers=clerk_session, json={}).status_code == 403
    content = b"municipal staff reviewed copy"
    upload = {"file_name": "meeting.pdf", "content_base64": base64.b64encode(content).decode(),
              "sha256": hashlib.sha256(content).hexdigest()}
    response = client.post(path, headers=records_session, json={"upload": upload, "added_by": "Forgery"})
    assert response.status_code == 200
    saved = response.json()
    assert saved["added_by"] == "Records"
    assert saved["file"]["stored_path"] == ""
    assert saved["file"]["sha256"] == upload["sha256"]
    assert next((root / "Data" / "files" / "records" / "staff-uploads").glob("*/upload.pdf")).read_bytes() == content
    upload["sha256"] = "0" * 64
    assert client.post(path, headers=records_session, json={"upload": upload}).status_code == 422
    assert client.post(f"{API}/requests/{RECORD}/actions", headers=records_session, json={"action": "close-records-request"}).status_code == 403


def test_allocation_replays_and_reservations_survive_host_restart(gateway):
    client, _, _, _, root = gateway
    clerk_session = operation(login(client, "clerk"))
    packet = f"{API}/meetings/meetings/{MEETING}/packet-snapshots"
    first = client.post(packet, headers=clerk_session, json={})
    assert first.status_code == 200
    assert client.post(packet, headers=clerk_session, json={}).json() == first.json()
    different = client.post(packet, headers=clerk_session, json={"stale": True})
    assert different.status_code == 409
    assert different.json()["code"] == "operation-key-conflict"

    key = str(uuid4())
    assert SharedOperations(root).begin("clerk@city.example", key, "same") is None
    assert SharedOperations(root).begin("clerk@city.example", key, "same").reason == "operation-outcome-unknown"
    SharedOperations(root).complete("clerk@city.example", key, 201, b'{"accepted":true}')
    receipt = SharedOperations(root).begin("clerk@city.example", key, "same")
    assert (receipt.status, receipt.body) == (201, b'{"accepted":true}')
