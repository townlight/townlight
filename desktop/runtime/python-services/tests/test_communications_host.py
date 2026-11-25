from cryptography.fernet import Fernet
from sqlalchemy import select

from comms_delivery_fixture import approve_and_schedule, make_repo
from townlight_comms.models import publications
from townlight_runtime.communications_host import CommunicationsHost
from townlight_runtime.publisher_queue import PublisherQueue


class ExplicitEmailStore:
    def transport(self, *args, **kwargs):
        return None


def _host(repo, tmp_path):
    queue = PublisherQueue(tmp_path / "profile")
    return CommunicationsHost(
        repo,
        queue,
        ExplicitEmailStore(),
        "https://townlight.example",
        tmp_path / "profile",
        recovery_key=Fernet.generate_key(),
    )


def _rows(repo, table):
    with repo.engine.connect() as connection:
        return connection.execute(select(table)).mappings().all()


def test_delivered_website_receipt_publishes_actual_publication(tmp_path):
    repo = make_repo(tmp_path)
    approve_and_schedule(repo, ["website"])
    host = _host(repo, tmp_path)

    assert host.tick()["prepared"] == 1
    job = host.queue.next_job()
    assert job is not None
    host.queue.finish(job, "delivered")

    host.tick()

    publication_rows = _rows(repo, publications)
    assert publication_rows
    assert publication_rows[-1]["state"] == "published"
    assert publication_rows[-1]["website_receipt"]["status"] == "delivered"


def test_rejected_website_receipt_fails_publication_without_publishing(tmp_path):
    repo = make_repo(tmp_path)
    approve_and_schedule(repo, ["website"])
    host = _host(repo, tmp_path)

    assert host.tick()["prepared"] == 1
    job = host.queue.next_job()
    assert job is not None
    host.queue.finish(job, "rejected", "Portal rejected the publication")

    result = host.tick()

    assert result["reconciled"] == 1
    publication_rows = _rows(repo, publications)
    assert publication_rows
    assert publication_rows[-1]["state"] == "failed"
    assert "published" not in {row["state"] for row in publication_rows}
    assert publication_rows[-1]["website_receipt"]["status"] == "rejected"
