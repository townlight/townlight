from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile
from datetime import timedelta
from uuid import UUID, uuid4

from cryptography.fernet import Fernet
from fastapi import Request
from fastapi.testclient import TestClient
from parks_http_support import HOUSEHOLD, RESOURCE, future_slot
from sqlalchemy.orm import Session
from test_service_request_postgres import postgres_env  # noqa: F401
from townlight_parks.migrations import upgrade
from townlight_parks.workflow import ParksRepository
from townlight_runtime import parks_data

# Register the parks data revision table before the shared postgres_env
# fixture calls ensure_data_schema(engine).
from townlight_runtime.parks_data_model import ParksPublicationRevision

DATA_BASE = "/desktop/v1/municipal-staff/data/parks"
ROW_KEYS = {"metric", "state", "count", "amount_cents", "minutes"}


def test_parks_data_preview_persist_readback_and_publish(postgres_env):  # noqa: F811
    engine = postgres_env["engine"]
    upgrade(engine)
    repo = ParksRepository(engine)

    marker = uuid4().hex
    resource = repo.catalog_create(
        "resource",
        "staff",
        {
            **RESOURCE,
            "name": f"Cedar Pavilion {marker}",
            "address": f"1 Cedar Lane {marker}",
        },
    )
    household = repo.household_create(
        "staff",
        {
            **HOUSEHOLD,
            "contact_name": f"Test Household {marker}",
            "email": f"household-{marker}@example.test",
        },
        key=Fernet.generate_key(),
    )

    start = future_slot(12)
    end = start + timedelta(hours=1)
    batch = repo.booking_create(
        resource["id"],
        household["id"],
        "staff",
        resource["revision"],
        [{"starts_at": start, "ends_at": end}],
        f"Private booking note {marker}",
    )
    booking = batch["bookings"][0]
    repo.record_offline_payment(
        booking["obligation_id"], "staff", 120, "cash", "offline"
    )

    aggregate = repo.aggregate_report()
    assert any(
        row["metric"] == "bookings" and row["count"] >= 1 for row in aggregate
    )

    app = postgres_env["app"]
    app.include_router(parks_data.router)
    app.state.desktop_parks = repo
    admin = postgres_env["admin"]

    def actor_override(request: Request):
        request.state.native_actor_id = admin.id
        request.state.native_role = "local-admin"
        return admin

    app.dependency_overrides[parks_data.data_actor] = actor_override

    with TestClient(app) as client:
        preview = client.post(f"{DATA_BASE}/preview")
        assert preview.status_code == 200, preview.text
        first = preview.json()
        revision_id = UUID(first["id"])
        digest = first["sha256"]
        assert first["rows"] == aggregate

        with Session(engine) as session:
            stored = session.get(ParksPublicationRevision, revision_id)
            assert stored is not None
            assert stored.saved_by == admin.id
            assert stored.approved_at is None
            assert stored.approved_by is None
            assert stored.sha256 == digest
            assert hashlib.sha256(stored.inner_zip).hexdigest() == digest

        readback = client.get(f"{DATA_BASE}/revisions/{revision_id}")
        assert readback.status_code == 200, readback.text
        body = readback.json()
        artifact = base64.b64decode(body["content_base64"])
        assert body["sha256"] == digest
        assert body["size"] == len(artifact)
        assert hashlib.sha256(artifact).hexdigest() == digest
        assert body["rows"] == aggregate

        with zipfile.ZipFile(io.BytesIO(artifact)) as bundle:
            names = bundle.namelist()
            dataset = json.loads(bundle.read("dataset.json"))
            contents = b"".join(bundle.read(name) for name in names)

        assert dataset == aggregate
        for row in dataset:
            assert set(row) == ROW_KEYS

        private_values = (
            marker,
            resource["snapshot"]["name"],
            resource["snapshot"]["address"],
            household["snapshot"]["contact_name"],
            household["snapshot"]["email"],
            str(booking["id"]),
        )
        for private_value in private_values:
            assert private_value.encode() not in contents

        publish_body = {
            "id": str(revision_id),
            "expected_sha256": digest,
            "confirm": True,
        }
        wrong_hash = client.post(
            f"{DATA_BASE}/publish",
            json={**publish_body, "expected_sha256": "0" * 64},
        )
        assert wrong_hash.status_code == 409, wrong_hash.text

        unconfirmed = client.post(
            f"{DATA_BASE}/publish",
            json={**publish_body, "confirm": False},
        )
        assert unconfirmed.status_code == 422, unconfirmed.text

        with Session(engine) as session:
            stored = session.get(ParksPublicationRevision, revision_id)
            assert stored is not None
            assert stored.approved_at is None
            assert stored.approved_by is None

        publish = client.post(f"{DATA_BASE}/publish", json=publish_body)
        assert publish.status_code == 202, publish.text

        with Session(engine) as session:
            stored = session.get(ParksPublicationRevision, revision_id)
            assert stored is not None
            assert stored.approved_at is not None
            assert stored.approved_by == admin.id

        status = client.get(DATA_BASE)
        assert status.status_code == 200, status.text
        assert status.json()["configured"] is True
        publish_jobs = [
            job
            for job in status.json()["publications"]
            if job.get("action") == "publish"
        ]
        assert len(publish_jobs) == 1

        duplicate = client.post(f"{DATA_BASE}/publish", json=publish_body)
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
        assert changed.json()["id"] != first["id"]

        stale = client.post(f"{DATA_BASE}/publish", json=publish_body)
        assert stale.status_code == 409, stale.text
