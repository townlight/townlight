"""Shared staff gateway: Townlight 311 queue, categories, auth and binary bounds."""

import asyncio
import hashlib
import json
from uuid import uuid4

import pytest
from argon2 import PasswordHasher
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.testclient import TestClient
from starlette.requests import Request as ASGIRequest
from townlight_records.auth.desktop_session import validate_native_session
from townlight_runtime.service_request_proxy import UNAVAILABLE, forward_binary
from townlight_runtime.shared_staff import install_shared_staff


SESSION = "/staff/v1/session"
API = "/staff/v1/api"
QUEUE = "/desktop/v1/service-requests/requests"
CATEGORIES = "/desktop/v1/service-requests/categories"
ARCHIVE_ID = "11111111-1111-4111-8111-111111111111"
WRONG_HASH_ID = "22222222-2222-4222-8222-222222222222"
REVOKE_ID = "33333333-3333-4333-8333-333333333333"
REQUESTS = [
    {"id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "department": "Public Works", "state": "open"},
    {"id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "department": "Public Works", "state": "open"},
    {"id": "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "department": "Parks", "state": "open"},
    {"id": "dddddddd-dddd-4ddd-8ddd-dddddddddddd", "department": "Public Works", "state": "closed"},
]
ARCHIVE = b"PK\x05\x06" + b"\x00" * 18
CATEGORIES_DATA = [
    {"id": "active", "name": "Roads", "active": True},
    {"id": "inactive", "name": "Retired", "active": False},
]


def staff(name, role, passcode):
    return {"display_name": name, "email": f"{name.lower()}@city.example", "role": role,
            "passcode_hash": PasswordHasher().hash(passcode),
            "passcode_algorithm": "argon2id-v1", "active": True}


@pytest.fixture
def gateway(tmp_path):
    config = tmp_path / "config"
    config.mkdir()
    admin = staff("Admin", "local-admin", "admin-passphrase")
    clerk = staff("Clerk", "clerk", "clerk-passphrase")
    records = staff("Records", "records-staff", "records-passphrase")
    (config / "first-admin.json").write_text(json.dumps(admin))
    users = config / "staff-users.json"
    users.write_text(json.dumps([clerk, records]))
    seen = {}
    domain = FastAPI()

    def require(request, module):
        try:
            principal = validate_native_session(
                request.headers.get("x-townlight-session"), profile_root=tmp_path
            )
        except PermissionError:
            raise HTTPException(401, "Sign in.") from None
        if not principal.allows_module(module):
            raise HTTPException(403, "Access denied.")
        seen["principal"] = principal
        return principal

    @domain.get(QUEUE)
    def queue(request: Request, department: str | None = None, state: str | None = None,
              limit: int = 100, offset: int = 0):
        require(request, "townlight_311")
        items = [item for item in REQUESTS
                 if (department is None or item["department"] == department)
                 and (state is None or item["state"] == state)]
        return {"items": items[offset:offset + limit], "total": len(items)}

    @domain.get(CATEGORIES)
    def categories(request: Request, include_inactive: bool = False):
        user = require(request, "townlight_311")
        if include_inactive and user.role != "local-admin":
            raise HTTPException(403, "Only local administrators may include inactive categories.")
        return {"items": [item for item in CATEGORIES_DATA
                          if include_inactive or item["active"]]}

    @domain.get("/desktop/v1/service-requests/requests/{request_id}/archive")
    def archive(request: Request, request_id: str):
        require(request, "townlight_311")
        if request_id == REVOKE_ID:
            clerk["active"] = False
            users.write_text(json.dumps([clerk, records]))
        elif request_id not in {ARCHIVE_ID, WRONG_HASH_ID}:
            raise HTTPException(404, "Archive not found.")
        digest = "0" * 64 if request_id == WRONG_HASH_ID else hashlib.sha256(ARCHIVE).hexdigest()
        return Response(
            content=ARCHIVE,
            media_type="application/zip",
            headers={"X-Content-SHA256": digest, "X-Host-Path": str(tmp_path / "host" / "archive.zip")},
        )

    app = FastAPI()
    install_shared_staff(app, domain, tmp_path)
    app.mount("/", domain)
    with TestClient(app) as client:
        yield client, users, clerk, records, tmp_path, seen


def login(client, name):
    response = client.post(
        SESSION,
        json={"email": f"{name}@city.example", "passcode": f"{name}-passphrase"},
    )
    assert response.status_code == 200
    return {"X-Townlight-Session": response.json()["proof"]}


def test_queue_department_state_limit_offset_and_clerk_and_admin_access(gateway):
    client, *_ = gateway
    admin = login(client, "admin")
    clerk = login(client, "clerk")
    records = login(client, "records")
    query = "?department=Public%20Works&state=open&limit=1&offset=1"
    for session in (admin, clerk):
        response = client.get(f"{API}{QUEUE}{query}", headers=session)
        assert response.status_code == 200
        assert response.json() == {"items": [REQUESTS[1]], "total": 2}
    assert client.get(f"{API}{QUEUE}", headers=records).status_code == 403


@pytest.mark.parametrize("query", [
    "?department=Public%20Works&department=Parks",
    "?limit=0",
    "?limit=201",
    "?offset=-1",
    "?state=",
    "?limit=1&limit=1",
    "?unknown=value",
])
def test_queue_rejects_malformed_duplicate_and_unknown_queries(gateway, query):
    client, *_ = gateway
    clerk = login(client, "clerk")
    assert client.get(f"{API}{QUEUE}{query}", headers=clerk).status_code == 404


def test_inactive_categories_are_admin_only_and_auth_is_checked(gateway):
    client, *_ = gateway
    admin = login(client, "admin")
    clerk = login(client, "clerk")
    records = login(client, "records")

    active = client.get(f"{API}{CATEGORIES}", headers=clerk)
    assert active.status_code == 200
    assert active.json()["items"] == [CATEGORIES_DATA[0]]
    assert client.get(f"{API}{CATEGORIES}?include_inactive=false", headers=clerk).status_code == 200

    all_categories = client.get(f"{API}{CATEGORIES}?include_inactive=true", headers=admin)
    assert all_categories.status_code == 200
    assert all_categories.json()["items"] == CATEGORIES_DATA
    assert client.get(f"{API}{CATEGORIES}?include_inactive=true", headers=clerk).status_code == 403
    assert client.get(f"{API}{CATEGORIES}", headers=records).status_code == 403
    assert client.get(f"{API}{CATEGORIES}").status_code == 401


def test_archive_returns_exact_managed_bytes_and_hash_without_host_paths(gateway):
    client, _, _, _, root, _ = gateway
    clerk = login(client, "clerk")
    records = login(client, "records")
    path = f"{API}{QUEUE}/{ARCHIVE_ID}/archive"

    assert client.get(path).status_code == 401
    assert client.get(path, headers=records).status_code == 403
    response = client.get(path, headers=clerk)
    assert response.status_code == 200
    assert response.content == ARCHIVE
    assert response.headers["content-type"] == "application/zip"
    assert response.headers["content-length"] == str(len(ARCHIVE))
    assert response.headers["x-content-sha256"] == hashlib.sha256(ARCHIVE).hexdigest()
    assert response.headers["content-disposition"] == f'attachment; filename="{ARCHIVE_ID}.zip"'
    assert response.headers["cache-control"] == "no-store"
    assert "x-host-path" not in response.headers
    assert str(root).encode() not in response.content


def test_archive_wrong_digest_is_refused_without_upstream_detail(gateway):
    client, _, _, _, root, _ = gateway
    clerk = login(client, "clerk")
    response = client.get(f"{API}{QUEUE}/{WRONG_HASH_ID}/archive", headers=clerk)
    assert response.status_code == 503
    assert response.json() == {"detail": UNAVAILABLE}
    assert str(root) not in response.text


def test_archive_revalidates_session_after_domain_returns(gateway):
    client, _, _, _, _, _ = gateway
    clerk = login(client, "clerk")
    response = client.get(f"{API}{QUEUE}/{REVOKE_ID}/archive", headers=clerk)
    assert response.status_code == 401
    assert response.json()["detail"] == "Sign in with an authorized Townlight account."
    assert client.get(SESSION, headers=clerk).status_code == 401


def test_unknown_311_paths_are_not_proxied(gateway):
    client, *_ = gateway
    clerk = login(client, "clerk")
    for path in (
        f"{API}{QUEUE}/{uuid4()}/archive/extra",
        f"{API}{QUEUE}/{uuid4()}/download",
        f"{API}/desktop/v1/service-requests/unknown",
        f"{API}{QUEUE}/{uuid4()}/archive",
    ):
        assert client.get(path, headers=clerk).status_code == 404
    assert client.get(f"{API}{QUEUE}").status_code == 401


def test_helper_refuses_oversized_real_asgi_binary_response(gateway):
    client, _, _, _, root, seen = gateway
    clerk = login(client, "clerk")
    assert client.get(f"{API}{QUEUE}", headers=clerk).status_code == 200
    principal = seen["principal"]
    proof = clerk["X-Townlight-Session"]
    path = f"/desktop/v1/service-requests/requests/{ARCHIVE_ID}/archive"
    called = []

    async def oversized(scope, receive, send):
        called.append(True)
        await send({
            "type": "http.response.start",
            "status": 200,
            "headers": [
                (b"content-type", b"application/zip"),
                (b"content-length", b"100"),
                (b"x-content-sha256", b"0" * 64),
            ],
        })
        await send({"type": "http.response.body", "body": b"12345"})
        await send({"type": "http.response.body", "body": b"67890"})

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.4"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "root_path": "",
        "query_string": b"",
        "headers": [(b"x-townlight-session", proof.encode("ascii"))],
        "client": ("test", 12345),
        "server": ("test", 80),
    }
    result = asyncio.run(forward_binary(
        oversized,
        ASGIRequest(scope),
        path,
        proof,
        principal,
        root,
        lambda _: principal,
        max_bytes=8,
    ))
    assert called == [True]
    assert result.status_code == 503
    assert json.loads(result.body) == {"detail": UNAVAILABLE}
