from __future__ import annotations

import hashlib
import io
import json
import zipfile
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

from cryptography.fernet import Fernet
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from parks_http_support import HOUSEHOLD, RESOURCE, future_slot
from test_service_request_postgres import postgres_env  # noqa: F401
from townlight_parks.migrations import upgrade
from townlight_parks.workflow import ParksRepository
from townlight_records.models.document import Document
from townlight_records.models.records_files import RequestFileEvidence
from townlight_records.models.request import RequestDocument
from townlight_runtime import parks_records
from townlight_runtime.parks_base import current_actor
from townlight_runtime.parks_staff import router as parks_staff_router


def test_parks_booking_records_archive_uses_real_postgres(postgres_env, monkeypatch):
    engine = postgres_env["engine"]
    upgrade(engine)
    repo = ParksRepository(engine)

    key = Fernet.generate_key()
    resource = repo.catalog_create("resource", "staff", RESOURCE)
    household = repo.household_create("staff", HOUSEHOLD, key=key)

    start = future_slot(12)
    end = start + timedelta(hours=1)
    batch = repo.booking_create(
        resource["id"],
        household["id"],
        "staff",
        resource["revision"],
        [{"starts_at": start, "ends_at": end}],
        "Archive booking",
    )
    booking = batch["bookings"][0]

    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
        b"trailer\n<< /Root 1 0 R >>\n%%EOF\n"
        + uuid4().bytes
    )
    attachment_id = repo.attachment_add(
        "booking",
        booking["id"],
        "staff",
        "waiver.pdf",
        "application/pdf",
        pdf_bytes,
    )

    expected_content = repo.archive_entity("booking", booking["id"])["content"]
    if isinstance(expected_content, bytearray):
        expected_content = bytes(expected_content)
    expected_digest = hashlib.sha256(expected_content).hexdigest()

    with zipfile.ZipFile(io.BytesIO(expected_content)) as bundle:
        names = bundle.namelist()
        record = json.loads(bundle.read("record.json"))
    revision = record["current_record"]["revision"]
    assert isinstance(revision, int) and revision > 0
    assert "record.json" in names
    assert f"attachments/{attachment_id}/waiver.pdf" in names

    app = postgres_env["app"]
    app.include_router(parks_staff_router)
    app.include_router(parks_records.router)
    app.state.desktop_parks = repo
    app.state.desktop_parks_key = key
    app.state.desktop_enabled_modules = tuple(app.state.desktop_enabled_modules) + (
        "townlight_parks",
    )

    admin = postgres_env["admin"]

    def actor(request: Request):
        request.state.native_role = "local-admin"
        request.state.native_actor_id = admin.id
        return admin

    async def mapped(request, session, proof, module):
        assert proof == "test-native-proof"
        assert module == "townlight_records"
        return admin

    app.dependency_overrides[current_actor] = actor
    monkeypatch.setattr(parks_records, "mapped_native_actor", mapped)

    client = TestClient(app)
    headers = {"X-Townlight-Session": "test-native-proof"}
    base = f"/desktop/v1/parks/archives/booking/{booking['id']}"

    preview = client.post(f"{base}/preview", headers=headers)
    assert preview.status_code == 200, preview.text
    assert preview.json()["sha256"] == expected_digest
    assert preview.json()["current_revision"] == revision
    assert preview.json()["size"] == len(expected_content)

    body = {
        "expected_revision": revision,
        "expected_sha256": expected_digest,
        "confirm": True,
    }
    stale = client.post(
        f"{base}/records",
        headers=headers,
        json={**body, "expected_sha256": "0" * 64},
    )
    assert stale.status_code == 409, stale.text

    response = client.post(f"{base}/records", headers=headers, json=body)
    assert response.status_code == 200, f"{response.text} errors={postgres_env['errors']}"
    first = response.json()
    assert first["sha256"] == expected_digest

    retry = client.post(f"{base}/records", headers=headers, json=body)
    assert retry.status_code == 200, retry.text
    second = retry.json()
    assert second["records_request_id"] == first["records_request_id"]
    assert second["attachment_id"] == first["attachment_id"]

    records_attachment_id = UUID(first["attachment_id"])
    with Session(engine) as session:
        evidence = session.scalar(
            select(RequestFileEvidence).where(
                RequestFileEvidence.id == records_attachment_id
            )
        )
        assert evidence is not None
        assert evidence.original_path.startswith("townlight-parks-booking-archive:")
        document = session.get(RequestDocument, records_attachment_id)
        assert document is not None
        managed = session.get(Document, document.document_id)
        assert managed is not None
        managed_path = Path(managed.source_path)
        assert managed_path.read_bytes() == expected_content
        assert managed.file_hash == expected_digest
        assert managed.file_size == len(expected_content)

    with zipfile.ZipFile(managed_path) as bundle:
        managed_names = bundle.namelist()
        assert "record.json" in managed_names
        assert f"attachments/{attachment_id}/waiver.pdf" in managed_names
