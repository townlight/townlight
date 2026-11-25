from __future__ import annotations

import re
from email.message import EmailMessage
from uuid import uuid4

from cryptography.fernet import Fernet
from sqlalchemy import select

from townlight_comms.models import email_outbox

from comms_delivery_fixture import approve_and_schedule, make_repo
from townlight_runtime.communications_email import CommunicationsEmailDelivery
from townlight_runtime.communications_publisher import CommunicationsPublisher
from townlight_runtime.publisher_queue import PublisherQueue

ORIGIN = "https://city.example.org"
EMAIL = "reader@example.org"


class FakeTransport:
    def __init__(self):
        self.sender = "city@example.org"
        self.messages = []

    def send(self, message):
        self.messages.append(message)
        return "accepted"


class FakeStore:
    def __init__(self, transport):
        self._transport = transport

    def transport(self):
        return self._transport


def test_encrypted_subscription_and_publication_email(tmp_path):
    key = Fernet.generate_key()
    repo = make_repo(tmp_path)
    repo.recovery_key = key
    repo.public_origin = ORIGIN
    try:
        assert repo.execute_subscription_command(
            str(uuid4()),
            "comms_subscribe",
            {"email": EMAIL, "topics": ["all"], "language": "en"},
            key=key,
            public_origin=ORIGIN,
        ) == {"accepted": True}

        claim = repo.claim_subscription_email(key=key)
        assert claim is not None
        confirm_token = re.search(
            r"/communications/confirm/\?token=([A-Za-z0-9_-]+)", claim["body"]
        ).group(1)
        preferences_token = re.search(
            r"/communications/preferences/\?token=([A-Za-z0-9_-]+)",
            claim["body"],
        ).group(1)
        assert repo.finish_subscription_email(
            claim["id"], claim["claim_token"], "sent"
        )

        assert repo.execute_subscription_command(
            str(uuid4()),
            "comms_confirm",
            {"token": confirm_token},
            key=key,
            public_origin=ORIGIN,
        ) == {"confirmed": True}

        approve_and_schedule(repo, ["email"])
        queue = PublisherQueue(tmp_path / "profile")
        publisher = CommunicationsPublisher(repo, queue, ORIGIN, tmp_path / "profile")
        job_id = publisher.prepare_one()
        assert job_id is not None

        with repo.engine.connect() as conn:
            stored_body = conn.execute(
                select(email_outbox.c.body).where(
                    email_outbox.c.publication_id == job_id
                )
            ).scalar_one()
        assert stored_body.startswith("fernet:")
        assert preferences_token not in stored_body

        transport = FakeTransport()
        delivery = CommunicationsEmailDelivery(repo, FakeStore(transport))
        assert delivery.tick() == 1
        assert len(transport.messages) == 1
        message = transport.messages[0]
        assert isinstance(message, EmailMessage)
        delivered_body = message.get_content()
        assert (
            f"{ORIGIN}/communications/preferences/?token={preferences_token}"
            in delivered_body
        )
        assert "fernet:" not in delivered_body
        assert repo.email_summary(job_id)["sent"] == 1
        assert delivery.tick() == 0
        assert len(transport.messages) == 1
    finally:
        repo.engine.dispose()
