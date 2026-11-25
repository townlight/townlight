from __future__ import annotations

import base64
import hashlib
import io
import os
import zipfile
from pathlib import Path
from uuid import UUID, uuid4

import pytest
import townlight_records.config
from cryptography.fernet import Fernet
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from townlight_311.workflow import ServiceRequestRepository
from townlight_records.database import get_async_session
from townlight_records.models.records_files import RequestFileEvidence
from townlight_records.models.request import RecordsRequest
from townlight_records.models.user import User, UserRole
from townlight_runtime.data_staff import ensure_data_schema
from townlight_runtime.native_accounts import accounts as native_account_links
from townlight_runtime.service_request_data import (
    data_actor,
    router as data_router,
)
from townlight_runtime.service_request_data_model import (
    ServiceRequestPublicationRevision,
)
from townlight_runtime.service_request_records import (
    records_handoff_actor,
    router as records_router,
)
from townlight_runtime.service_requests import (
    SERVICE_REQUESTS_PREFIX,
    router as service_requests_router,
    service_request_actor,
)

DATA_BASE = "/desktop/v1/municipal-staff/data/service-requests"
LOOPBACK_HOSTS = {"127.0.0.1", "::1", "localhost"}


def _postgres_url() -> str:
    raw = os.environ.get("TOWNLIGHT_311_TEST_DATABASE_URL")
    if not raw:
        pytest.skip("TOWNLIGHT_311_TEST_DATABASE_URL is not set")
    url = make_url(raw)
    if url.get_backend_name() != "postgresql":
        pytest.skip("TOWNLIGHT_311_TEST_DATABASE_URL is not PostgreSQL")
    database = url.database or ""
    if url.host not in LOOPBACK_HOSTS or not (
        database == "townlight_311_test"
        or database.startswith("townlight_311_test_")
    ):
        pytest.skip(
            "TOWNLIGHT_311_TEST_DATABASE_URL is not loopback/townlight_311_test"
        )
    return raw


@pytest.fixture
def postgres_env(tmp_path, monkeypatch):
    raw_url = _postgres_url()
    test_encryption_key = os.environ.get("TOWNLIGHT_311_TEST_ENCRYPTION_KEY")
    if not test_encryption_key:
        pytest.skip(
            "TOWNLIGHT_311_TEST_ENCRYPTION_KEY is required for this test database"
        )
    Fernet(test_encryption_key.encode())

    sync_engine = create_engine(raw_url)
    async_url = make_url(raw_url).set(drivername="postgresql+asyncpg")
    async_engine = create_async_engine(
        async_url.render_as_string(hide_password=False),
        poolclass=NullPool,
    )

    errors: list[str] = []

    def _capture_error(context):
        errors.append(str(context.original_exception))

    event.listen(sync_engine, "handle_error", _capture_error)
    event.listen(async_engine.sync_engine, "handle_error", _capture_error)

    native_account_links.create(sync_engine, checkfirst=True)
    repository = ServiceRequestRepository(sync_engine)
    ensure_data_schema(sync_engine)

    admin = User(
        id=uuid4(),
        email=f"postgres-admin-{uuid4().hex}@example.test",
        hashed_password="not-used-by-these-tests",
        full_name="Postgres Admin",
        role=UserRole.ADMIN,
        is_active=True,
        is_superuser=False,
        is_verified=True,
        must_change_password=False,
    )
    with Session(sync_engine) as session:
        session.add(admin)
        session.commit()
        session.refresh(admin)
        session.expunge(admin)

    async_session = async_sessionmaker(async_engine, expire_on_commit=False)

    async def async_session_override():
        async with async_session() as session:
            yield session

    def actor_override(request: Request):
        request.state.native_actor_id = admin.id
        request.state.native_role = "local-admin"
        return admin

    profile_root = tmp_path.parent / f"profile-{uuid4().hex[:8]}"
    profile_root.mkdir()

    monkeypatch.setenv("TOWNLIGHT_SHARED_STAFF_HOST", "1")
    monkeypatch.setenv("TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN", "http://127.0.0.1:9")
    monkeypatch.setattr(
        townlight_records.config.settings,
        "encryption_key",
        test_encryption_key,
    )

    app = FastAPI()
    app.include_router(service_requests_router)
    app.include_router(records_router)
    app.include_router(data_router)
    app.state.desktop_service_requests = repository
    app.state.desktop_profile_root = profile_root
    app.state.desktop_enabled_modules = (
        "townlight_311",
        "townlight_records",
        "townlight_data",
    )
    app.dependency_overrides[get_async_session] = async_session_override
    app.dependency_overrides[service_request_actor] = actor_override
    app.dependency_overrides[records_handoff_actor] = actor_override
    app.dependency_overrides[data_actor] = actor_override

    try:
        yield {
            "app": app,
            "admin": admin,
            "engine": sync_engine,
            "profile_root": profile_root,
            "errors": errors,
        }
    finally:
        app.dependency_overrides.clear()
        sync_engine.dispose()


def _create_request(client: TestClient, *, marker: str, description: str, address: str) -> dict:
    category = f"category-{marker}"
    response = client.post(
        f"{SERVICE_REQUESTS_PREFIX}/categories",
        json={
            "code": category,
            "name": f"Category {marker}",
            "department": "Public Works",
        },
    )
    assert response.status_code == 200, response.text

    response = client.post(
        f"{SERVICE_REQUESTS_PREFIX}/requests",
        json={
            "category": category,
            "description": description,
            "location": address,
            "contact": {
                "name": "Resident",
                "email": f"resident-{marker}@example.test",
            },
            "resident_token": marker.ljust(32, "r")[:32],
            "idempotency_key": str(uuid4()),
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_records_handoff_persists_archive_and_is_idempotent(postgres_env):
    client = TestClient(postgres_env["app"])
    request = _create_request(
        client,
        marker=uuid4().hex[:10],
        description="Attachment-backed 311 record.",
        address="1 Public Way",
    )
    request_id = request["id"]

    photo = b"\x89PNG\r\n\x1a\n" + uuid4().bytes
    attached = client.post(
        f"{SERVICE_REQUESTS_PREFIX}/requests/{request_id}/attachments",
        json={
            "expected_revision": request["revision"],
            "name": "photo.png",
            "media_type": "image/png",
            "content_base64": base64.b64encode(photo).decode("ascii"),
            "public": False,
        },
    )
    assert attached.status_code == 201, attached.text

    current = client.get(f"{SERVICE_REQUESTS_PREFIX}/requests/{request_id}")
    assert current.status_code == 200, current.text
    revision = current.json()["revision"]
    archive = client.get(f"{SERVICE_REQUESTS_PREFIX}/requests/{request_id}/archive")
    assert archive.status_code == 200, archive.text
    digest = hashlib.sha256(archive.content).hexdigest()

    stale = client.post(
        f"{SERVICE_REQUESTS_PREFIX}/requests/{request_id}/records",
        json={
            "expected_revision": revision,
            "expected_sha25664": "0" * 64,
            "confirm": True,
        },
    )
    assert stale.status_code == 409, stale.text

    handoff = client.post(
        f"{SERVICE_REQUESTS_PREFIX}/requests/{request_id}/records",
        json={
            "expected_revision": revision,
            "expected_sha25664": digest,
            "confirm": True,
        },
    )
    assert handoff.status_code == 200, f"{handoff.text} errors={postgres_env['errors']}"
    first = handoff.json()
    assert first["sha256"] == digest
    assert first["size"] == len(archive.content)
    assert first["tracking"]
    assert first["path"] == f"/records?request_id={first['records_request_id']}"

    retry = client.post(
        f"{SERVICE_REQUESTS_PREFIX}/requests/{request_id}/records",
        json={
            "expected_revision": revision,
            "expected_sha25664": digest,
            "confirm": True,
        },
    )
    assert retry.status_code == 200, retry.text
    second = retry.json()
    assert second["records_request_id"] == first["records_request_id"]
    assert second["attachment_id"] == first["attachment_id"]

    identity = f"311-archive:{request_id}:{digest}"
    original_path = f"townlight311-archive:{request_id}:{digest}"
    with Session(postgres_env["engine"]) as session:
        records_request = session.scalar(
            select(RecordsRequest).where(RecordsRequest.desktop_id == identity)
        )
        assert records_request is not None
        assert str(records_request.id) == first["records_request_id"]
        evidence = session.scalar(
            select(RequestFileEvidence).where(
                RequestFileEvidence.request_id == records_request.id,
                RequestFileEvidence.original_path == original_path,
            )
        )
        assert evidence is not None
        assert str(evidence.id) == first["attachment_id"]

    managed = list(Path(postgres_env["profile_root"]).rglob(f"{digest}.zip"))
    assert len(managed) == 1
    assert managed[0].stat().st_size == len(archive.content)
    assert hashlib.sha256(managed[0].read_bytes()).hexdigest() == digest


def test_data_preview_revision_publish_and_stale_preview(postgres_env):
    client = TestClient(postgres_env["app"])
    marker = uuid4().hex[:10]
    private_description = f"private-description-{marker}"
    private_address = f"private-address-{marker}"
    private_email = f"resident-{marker}@example.test"
    request = _create_request(
        client,
        marker=marker,
        description=private_description,
        address=private_address,
    )
    assert request["id"]

    preview = client.post(f"{DATA_BASE}/preview")
    assert preview.status_code == 200, preview.text
    first = preview.json()
    revision_id = first["id"]
    digest = first["sha256"]

    fetched = client.get(f"{DATA_BASE}/revisions/{revision_id}")
    assert fetched.status_code == 200, fetched.text
    body = fetched.json()
    artifact = base64.b64decode(body["content_base64"])
    assert body["sha256"] == digest == hashlib.sha256(artifact).hexdigest()
    assert body["size"] == len(artifact)

    with zipfile.ZipFile(io.BytesIO(artifact)) as bundle:
        contents = b"".join(bundle.read(name) for name in bundle.namelist())
    assert private_description.encode() not in contents
    assert private_address.encode() not in contents
    assert private_email.encode() not in contents
    assert marker.encode() in contents

    publish = client.post(
        f"{DATA_BASE}/publish",
        json={"id": revision_id, "expected_sha256": digest, "confirm": True},
    )
    assert publish.status_code == 202, publish.text

    status = client.get(DATA_BASE)
    assert status.status_code == 200, status.text
    assert status.json()["configured"] is True
    publish_jobs = [
        job for job in status.json()["publications"] if job.get("action") == "publish"
    ]
    assert len(publish_jobs) == 1

    with Session(postgres_env["engine"]) as session:
        stored = session.get(ServiceRequestPublicationRevision, UUID(revision_id))
        assert stored is not None
        assert stored.approved_at is not None
        assert stored.approved_by == postgres_env["admin"].id

    duplicate = client.post(
        f"{DATA_BASE}/publish",
        json={"id": revision_id, "expected_sha256": digest, "confirm": True},
    )
    assert duplicate.status_code == 202, duplicate.text
    after_duplicate = client.get(DATA_BASE)
    assert after_duplicate.status_code == 200, after_duplicate.text
    duplicate_jobs = [
        job
        for job in after_duplicate.json()["publications"]
        if job.get("action") == "publish"
    ]
    assert len(duplicate_jobs) == 1

    changed = client.post(f"{DATA_BASE}/preview")
    assert changed.status_code == 200, changed.text
    assert changed.json()["id"] != revision_id

    stale = client.post(
        f"{DATA_BASE}/publish",
        json={"id": revision_id, "expected_sha256": digest, "confirm": True},
    )
    assert stale.status_code == 409, stale.text
