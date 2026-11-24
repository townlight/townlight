"""Shared staff gateway: isolated principals, bounded host paths and revocation."""

import asyncio
import hashlib
import io
import json
import threading
from uuid import uuid4

from argon2 import PasswordHasher
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient
import pytest
from starlette.requests import ClientDisconnect

from townlight_records.auth.desktop_session import validate_native_session
from townlight_runtime.shared_staff import RecordsFileResponse, install_shared_staff
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
    download_file = tmp_path / "Data" / "files" / "records" / "recording.ts"
    download_file.parent.mkdir(parents=True)
    download_file.write_bytes(b"private" * 200_000)

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

    @domain.get("/desktop/v1/requests/{request_id}/view")
    def records_view(request: Request, request_id: str):
        require(request, "townlight_records")
        if request_id != RECORD:
            raise HTTPException(404, "Request not found.")
        return {"documents": [{
            "attachment_id": MEETING, "stored_path": str(download_file),
            "sha256": hashlib.sha256(b"private" * 200_000).hexdigest(),
            "size_bytes": len(b"private") * 200_000,
        }]}

    @domain.get("/desktop/v1/meetings/packets/{packet_id}/council-file/{artifact_id}/{filename}")
    def council_file(request: Request, packet_id: str, artifact_id: str, filename: str,
                     manifest_sha256: str, offset: int, approved: bool):
        require(request, "townlight_meetings")
        return {"manifest_sha256": manifest_sha256, "offset": offset, "approved": approved,
                "filename": filename, "content_base64": "ZmlsZQ=="}

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


def test_private_records_download_authorization_integrity_and_exact_scope(gateway):
    client, _, _, _, root = gateway
    records = login(client, "records")
    clerk = login(client, "clerk")
    path = f"{API}/requests/{RECORD}/documents/{MEETING}/content"
    assert client.get(path).status_code == 401
    assert client.get(path, headers=clerk).status_code == 403
    assert client.get(path.replace(RECORD, MEETING, 1), headers=records).status_code == 404
    assert client.get(path.replace(MEETING, RECORD), headers=records).status_code == 404
    assert client.get(f"{path}?location=C:/secret", headers=records).status_code == 404
    assert client.get(path, headers={**records, "Range": "bytes=2-"}).status_code == 416
    assert client.get(path.replace("/staff/v1/api", ""), headers=records).status_code == 404

    response = client.get(path, headers=records)
    data = b"private" * 200_000
    assert response.status_code == 200
    assert response.content == data
    assert response.headers["content-length"] == str(len(data))
    assert response.headers["content-type"] == "application/octet-stream"
    assert response.headers["content-disposition"] == 'attachment; filename="recording.ts"'
    assert response.headers["x-content-sha256"] == hashlib.sha256(data).hexdigest()
    assert response.headers["cache-control"] == "no-store"

    (root / "Data" / "files" / "records" / "recording.ts").write_bytes(b"changed" * 200_000)
    failure = client.get(path, headers=records)
    assert failure.status_code == 404 and str(root) not in failure.text
    assert client.delete(SESSION, headers=records).status_code == 200
    assert client.get(path, headers=records).status_code == 401


def test_private_records_download_rejects_link_to_unmanaged_file(gateway):
    client, _, _, _, root = gateway
    records = login(client, "records")
    path = f"{API}/requests/{RECORD}/documents/{MEETING}/content"
    managed = root / "Data" / "files" / "records" / "recording.ts"
    unmanaged = root / "unmanaged.ts"
    managed.rename(unmanaged)
    try:
        managed.symlink_to(unmanaged)
    except OSError:
        pytest.skip("Creating file symlinks is unavailable")
    response = client.get(path, headers=records)
    assert response.status_code == 404 and str(unmanaged) not in response.text


def test_private_records_stream_closes_after_failed_send():
    loop_thread = threading.get_ident()

    class ManagedFile(io.BytesIO):
        def read(self, size):
            assert threading.get_ident() != loop_thread
            assert 0 < size <= 1024 * 1024
            return super().read(size)

    file = ManagedFile(b"private Recording")
    response = RecordsFileResponse(file, "recording.ts", 17, "0" * 64)

    async def send(message):
        if message["type"] == "http.response.body":
            raise OSError("Disconnected")

    with pytest.raises(ClientDisconnect):
        asyncio.run(response({"type": "http", "asgi": {"spec_version": "2.4"}}, None, send))
    assert file.closed


def test_council_preview_and_approved_download_queries(gateway):
    client, _, _, _, _ = gateway
    clerk = login(client, "clerk")
    path = f"{API}/meetings/packets/{MEETING}/council-file/{RECORD}/packet.pdf"
    digest = "c" * 64
    preview_query = f"manifest_sha256={digest}&offset=0&approved=false"
    approved_query = f"approved=true&offset=2097152&manifest_sha256={digest}"
    for query, approved, offset in ((preview_query, False, 0), (approved_query, True, 2097152)):
        response = client.get(f"{path}?{query}", headers=clerk)
        assert response.status_code == 200
        assert response.json() == {"manifest_sha256": digest, "offset": offset, "approved": approved,
                                   "filename": "packet.pdf", "content_base64": "ZmlsZQ=="}
    for query in ("", "offset=0", f"{preview_query}&offset=1", f"{preview_query}&extra=1",
                  preview_query.replace(digest, "wrong"), preview_query.replace("offset=0", "offset=-1"),
                  preview_query.replace("approved=false", "approved=1")):
        assert client.get(f"{path}?{query}", headers=clerk).status_code == 404
    records = login(client, "records")
    assert client.get(f"{path}?{preview_query}", headers=records).status_code == 403


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
