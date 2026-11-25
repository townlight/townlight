from __future__ import annotations

from townlight_311.notifications import UncertainDeliveryError
from townlight_runtime.communications_email import CommunicationsEmailDelivery
from townlight_runtime.communications_publisher import CommunicationsPublisher
from townlight_runtime.publisher_queue import PublisherQueue

from comms_delivery_fixture import approve_and_schedule, make_repo, subscribe


class FakeTransport:
    def __init__(self, error=None):
        self.sender = "city@example.org"
        self.messages = []
        self.error = error

    def send(self, message):
        self.messages.append(message)
        if self.error is not None:
            raise self.error
        return "accepted"


class FakeStore:
    def __init__(self, transport):
        self._transport = transport

    def transport(self):
        return self._transport


def _make_queue(tmp_path, repo):
    return PublisherQueue(tmp_path / "profile")


def _dispose(repo):
    repo.engine.dispose()


def _prepare_email(tmp_path):
    repo = make_repo(tmp_path)
    approve_and_schedule(repo, ["email"])
    subscribe(repo)
    queue = _make_queue(tmp_path, repo)
    publisher = CommunicationsPublisher(
        repo, queue, "https://city.example.org", tmp_path / "profile"
    )
    job_id = publisher.prepare_one()
    assert job_id is not None
    return repo, job_id


def test_confirmed_subscriber_gets_one_sent_email(tmp_path):
    repo, job_id = _prepare_email(tmp_path)
    try:
        transport = FakeTransport()
        delivery = CommunicationsEmailDelivery(repo, FakeStore(transport))

        assert delivery.tick() == 1
        assert len(transport.messages) == 1
        message = transport.messages[0]
        assert message["From"] == "city@example.org"
        assert message["To"] == "reader@example.org"
        assert message["Subject"].strip()
        assert message["Message-ID"].strip()
        assert message.get_content().strip()
        assert repo.email_summary(job_id)["sent"] == 1

        publication = repo.reconcile_publication(job_id)
        state = publication.get("state") if isinstance(publication, dict) else publication
        assert state == "published"

        assert delivery.tick() == 0
        assert len(transport.messages) == 1
    finally:
        _dispose(repo)


def test_disabled_transport_skips_then_uncertain_is_not_retried(tmp_path):
    repo, job_id = _prepare_email(tmp_path)
    try:
        assert CommunicationsEmailDelivery(repo, FakeStore(None)).tick() == 0
        assert repo.email_summary(job_id)["remaining"] == 1

        transport = FakeTransport(UncertainDeliveryError("generic transport ambiguity"))
        delivery = CommunicationsEmailDelivery(repo, FakeStore(transport))
        assert delivery.tick() == 1
        assert repo.email_summary(job_id)["uncertain"] == 1
        assert delivery.tick() == 0
        assert len(transport.messages) == 1
    finally:
        _dispose(repo)
