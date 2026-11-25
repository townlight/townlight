from __future__ import annotations

import os

os.environ.setdefault("TESTING", "true")

import base64
import hashlib
import json
import xml.etree.ElementTree as ET
from uuid import uuid4

from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from townlight_runtime.service_request_interchange import router as interchange_router
from townlight_runtime.service_request_open311 import router as catalogue_router
from townlight_runtime.service_request_open311_create import router as create_router
from townlight_runtime.service_request_open311_read import router as read_router

pytest_plugins = ["test_service_requests_api"]

BASE = "/desktop/v1/service-requests"


def _prepare(app_env) -> None:
    paths = {getattr(route, "path", None) for route in app_env.app.routes}
    for router in (catalogue_router, read_router, create_router, interchange_router):
        router_paths = {getattr(route, "path", None) for route in router.routes}
        if not router_paths.issubset(paths):
            app_env.app.include_router(router)
            paths.update(router_paths)

    app_env.repository.save_category(
        "roads", "Roads", "Works", True, str(app_env.admin.id)
    )
    if not getattr(app_env.repository, "recovery_key", None):
        app_env.repository.recovery_key = Fernet.generate_key()
    app_env.install_actor(app_env.admin, "local-admin")


def test_open311_urlencoded_create_replay_and_header_token_reads(app_env):
    _prepare(app_env)
    operation = str(uuid4())
    resident_token = "r" * 32
    form = {
        "service_code": "roads",
        "description": "A pothole in the travel lane.",
        "address_string": "100 Main Street",
        "first_name": "Resident",
        "last_name": "Person",
        "email": "resident@example.test",
    }
    headers = {
        "X-Townlight-Operation": operation,
        "X-Townlight-Resident-Token": resident_token,
    }

    with TestClient(app_env.app) as client:
        created = client.post(
            f"{BASE}/open311/requests.json", data=form, headers=headers
        )
        assert created.status_code == 200, created.text
        body = created.json()
        assert isinstance(body, list) and len(body) == 1
        tracking = body[0]["service_request_id"]
        assert tracking.startswith("TL311-")

        replay = client.post(
            f"{BASE}/open311/requests.json", data=form, headers=headers
        )
        assert replay.status_code == 200, replay.text
        assert replay.json() == body
        assert len(app_env.repository.list_requests(limit=10)) == 1

        read_headers = {"X-Townlight-Resident-Token": resident_token}
        for fmt in ("json", "xml"):
            response = client.get(
                f"{BASE}/open311/requests/{tracking}.{fmt}",
                headers=read_headers,
            )
            assert response.status_code == 200, response.text
            assert form["email"] not in response.text
            assert resident_token not in response.text
            if fmt == "json":
                payload = response.json()
                assert isinstance(payload, list) and payload
            else:
                root = ET.fromstring(response.content)
                assert root.tag == "service_requests"
                assert root.find(".//service_request") is not None


def test_open311_rejects_unknown_media_url_without_creating_row(app_env):
    _prepare(app_env)
    form = {
        "service_code": "roads",
        "description": "A pothole in the travel lane.",
        "address_string": "100 Main Street",
        "first_name": "Resident",
        "last_name": "Person",
        "email": "resident@example.test",
        "media_url": "https://example.test/photo.jpg",
    }
    headers = {
        "X-Townlight-Operation": str(uuid4()),
        "X-Townlight-Resident-Token": "r" * 32,
    }

    with TestClient(app_env.app) as client:
        response = client.post(
            f"{BASE}/open311/requests.json", data=form, headers=headers
        )
        assert response.status_code == 422, response.text
        assert app_env.repository.list_requests(limit=10) == []


def test_import_preview_commit_replay_wrong_hash_and_export(app_env):
    _prepare(app_env)
    rows = [
        {
            "external_id": "ext-1",
            "category": "roads",
            "description": "First imported pothole.",
            "location": "1 First Street",
            "contact_name": "First Person",
            "email": "first@example.test",
            "phone": "",
        },
        {
            "external_id": "ext-2",
            "category": "roads",
            "description": "Second imported pothole.",
            "location": "2 Second Street",
            "contact_name": "Second Person",
            "email": "second@example.test",
            "phone": "",
        },
    ]
    content = json.dumps(
        {"schema_version": 1, "requests": rows},
        separators=(",", ":"),
    )
    digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
    payload = {
        "format": "json",
        "content": content,
        "source_key": "test-import-source",
        "expected_sha256": digest,
        "confirm": True,
    }

    with TestClient(app_env.app) as client:
        preview = client.post(
            f"{BASE}/import-preview",
            json={
                "format": "json",
                "content": content,
                "source_key": "test-import-source",
            },
        )
        assert preview.status_code == 200, preview.text
        preview_body = preview.json()
        assert preview_body["count"] == 2
        assert preview_body["sha256"] == digest
        assert preview_body["rows"] == rows

        committed = client.post(f"{BASE}/import", json=payload)
        assert committed.status_code == 200, committed.text
        commit_body = committed.json()
        assert commit_body["count"] == 2
        assert {item["status"] for item in commit_body["results"]} == {"created"}
        assert len(app_env.repository.list_requests(limit=10)) == 2

        replay = client.post(f"{BASE}/import", json=payload)
        assert replay.status_code == 200, replay.text
        replay_body = replay.json()
        assert replay_body["count"] == 2
        assert {item["status"] for item in replay_body["results"]} == {"existing"}
        assert len(app_env.repository.list_requests(limit=10)) == 2

        wrong_hash = client.post(
            f"{BASE}/import", json={**payload, "expected_sha256": "0" * 64}
        )
        assert wrong_hash.status_code == 422, wrong_hash.text
        assert len(app_env.repository.list_requests(limit=10)) == 2

        exported = client.post(f"{BASE}/export", json={"format": "json"})
        assert exported.status_code == 200, exported.text
        export_body = exported.json()
        raw = base64.b64decode(export_body["content_base64"])
        assert export_body["sha256"] == hashlib.sha256(raw).hexdigest()
        assert export_body["size"] == len(raw)
        document = json.loads(raw)
        assert document["schema_version"] == 1
        assert len(document["requests"]) == 2
        assert all(item["email"] == "" for item in document["requests"])
