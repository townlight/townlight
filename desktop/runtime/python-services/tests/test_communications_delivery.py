# SPDX-License-Identifier: AGPL-3.0-only
"""End-to-end checks for communications preparation and durable delivery."""
import json
import zipfile

from sqlalchemy import select

from comms_delivery_fixture import approve_and_schedule, make_repo, subscribe
from townlight_comms.models import email_outbox, publications
from townlight_runtime.communications_publisher import CommunicationsPublisher
from townlight_runtime.publisher_queue import PublisherQueue

ORIGIN = "https://portal.example.org"


def test_website_and_email_stay_queued_until_email_delivered(tmp_path):
    repo = make_repo(tmp_path)
    try:
        subscribe(repo, email="reader@example.org")
        approve_and_schedule(repo, channels=("website", "email"))
        queue = PublisherQueue(tmp_path / "profile")
        publisher = CommunicationsPublisher(repo, queue, ORIGIN, tmp_path / "profile")

        job_id = publisher.prepare_one()
        assert job_id is not None

        with repo.engine.connect() as conn:
            state, website_receipt, email_summary = conn.execute(
                select(
                    publications.c.state,
                    publications.c.website_receipt,
                    publications.c.email_summary,
                ).where(publications.c.id == job_id)
            ).one()
        assert state == "queued"
        # Receipts are already JSON-decoded by SQLAlchemy.
        assert website_receipt["status"] == "queued"
        assert email_summary["remaining"] == 1

        job = queue.next_job()
        assert job is not None
        with zipfile.ZipFile(queue.root / job["blob"]) as archive:
            manifest = json.loads(archive.read("manifest.json"))
        assert manifest["kind"] == "article"

        queue.finish(job, "delivered")
        # Merge the delivered website receipt; the pending email keeps the
        # publication overall queue state as "queued".
        repo.reconcile_publication(
            job_id, website_receipt={**website_receipt, "status": "delivered"}
        )

        with repo.engine.connect() as conn:
            state, website_receipt, email_summary = conn.execute(
                select(
                    publications.c.state,
                    publications.c.website_receipt,
                    publications.c.email_summary,
                ).where(publications.c.id == job_id)
            ).one()
        assert state == "queued"
        assert website_receipt["status"] == "delivered"
        assert email_summary["remaining"] == 1
    finally:
        repo.engine.dispose()


def test_email_only_creates_no_public_link_or_queue_job(tmp_path):
    repo = make_repo(tmp_path)
    try:
        subscribe(repo, email="reader@example.org")
        approve_and_schedule(repo, channels=("email",))
        queue = PublisherQueue(tmp_path / "profile")
        publisher = CommunicationsPublisher(repo, queue, ORIGIN, tmp_path / "profile")

        job_id = publisher.prepare_one()
        assert job_id is not None
        assert queue.next_job() is None

        with repo.engine.connect() as conn:
            website_receipt = conn.execute(
                select(publications.c.website_receipt).where(publications.c.id == job_id)
            ).scalar_one()
            body = conn.execute(
                select(email_outbox.c.body).order_by(email_outbox.c.id.desc()).limit(1)
            ).scalar_one()
        assert website_receipt is None
        assert ORIGIN not in body
    finally:
        repo.engine.dispose()
