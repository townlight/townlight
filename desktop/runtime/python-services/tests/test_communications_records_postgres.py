import hashlib, io, zipfile
from pathlib import Path
from uuid import UUID

import fastapi
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from comms_delivery_fixture import approve_and_schedule
from test_service_request_postgres import postgres_env  # noqa: F401
from townlight_comms.migrations import upgrade
from townlight_comms.models import publications
from townlight_comms.workflow import CommunicationsRepository
from townlight_records.models.document import Document
from townlight_records.models.records_files import RequestFileEvidence
from townlight_records.models.request import RequestDocument
from townlight_runtime.communications_publisher import CommunicationsPublisher
from townlight_runtime.publisher_queue import PublisherQueue

from townlight_runtime import communications_records
from townlight_runtime.communications_staff import current_actor


def test_managed_records_download(postgres_env, monkeypatch):
    # Auth doubles: local-admin actor override and mapped_native_actor patch.
    engine = postgres_env["engine"]
    upgrade(engine)
    repo = CommunicationsRepository(engine)
    article_id = approve_and_schedule(repo, ["website"])
    profile = postgres_env["profile_root"]
    queue = PublisherQueue(profile)
    publisher = CommunicationsPublisher(repo, queue, "https://portal.example.org", profile)
    job_id = publisher.prepare_one()
    job = queue.next_job()
    assert job is not None
    queue.finish(job, "delivered")
    with engine.connect() as connection:
        receipt = connection.scalar(
            select(publications.c.website_receipt).where(publications.c.id == job_id)
        )
    repo.reconcile_publication(job_id, website_receipt={**receipt, "status": "delivered"})
    current = repo.get(article_id)
    revision = current["current_revision"]
    source_hash = current["revision"]["sha256"]
    expected = repo.build_records_archive(article_id, revision, source_hash)
    archive_hash = hashlib.sha256(expected).hexdigest()
    app = postgres_env["app"]
    app.include_router(communications_records.router)
    app.state.desktop_communications = repo
    app.state.desktop_enabled_modules = tuple(app.state.desktop_enabled_modules) + ("townlight_comms",)
    admin = postgres_env["admin"]

    def actor(request: fastapi.Request):
        request.state.native_role = "local-admin"
        return admin

    async def mapped(request, session, proof, module):
        return admin

    app.dependency_overrides[current_actor] = actor
    monkeypatch.setattr(communications_records, "mapped_native_actor", mapped)
    client = TestClient(app)
    headers = {"X-Townlight-Session": "test-native-proof"}
    url = f"/desktop/v1/communications/articles/{article_id}/records"
    body = {"expected_revision": revision, "expected_sha256": source_hash, "confirm": True}
    assert client.post(url, headers=headers, json={**body, "expected_sha256": "0" * 64}).status_code == 409
    response = client.post(url, headers=headers, json=body)
    assert response.status_code == 200, response.text
    assert response.json()["sha256"] == archive_hash
    retry = client.post(url, headers=headers, json=body)
    assert retry.status_code == 200
    assert retry.json()["sha256"] == archive_hash
    assert retry.json()["records_request_id"] == response.json()["records_request_id"]
    assert retry.json()["attachment_id"] == response.json()["attachment_id"]
    attachment_id = UUID(response.json()["attachment_id"])
    with Session(engine) as session:
        evidence = session.scalar(
            select(RequestFileEvidence).where(RequestFileEvidence.id == attachment_id)
        )
        assert evidence is not None
        assert evidence.original_path.startswith("townlight-comms-archive:")
        document = session.get(RequestDocument, attachment_id)
        assert document is not None
        file = session.get(Document, document.document_id)
        assert file is not None
        assert Path(file.source_path).read_bytes() == expected
        assert file.file_hash == archive_hash
        assert file.file_size == len(expected)
    with zipfile.ZipFile(io.BytesIO(expected)) as archive:
        names = set(archive.namelist())
    assert {"published-content.zip", "publication-receipts.json"} <= names
