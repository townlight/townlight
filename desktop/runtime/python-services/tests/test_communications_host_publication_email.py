from __future__ import annotations

import threading
from email.message import EmailMessage
from uuid import uuid4

from cryptography.fernet import Fernet
from sqlalchemy import select

from comms_delivery_fixture import approve_and_schedule, make_repo, subscribe
from townlight_comms.models import email_outbox, publications
from townlight_runtime.communications_host import CommunicationsHost
from townlight_runtime.publisher_queue import PublisherQueue

ORIGIN = "https://city.example.test"
READER = "reader@example.test"
PENDING = "pending@example.test"
ANNOUNCEMENT_BODY = "Published city announcement."


class RecordingTransport:
    def __init__(self):
        self.sender = "city@example.test"
        self.messages = []

    def send(self, message):
        self.messages.append(message)
        return "accepted"


class RecordingStore:
    def __init__(self, transport):
        self._transport = transport

    def transport(self, *args, **kwargs):
        return self._transport


def _rows(repo, table):
    with repo.engine.connect() as connection:
        return connection.execute(select(table)).mappings().all()


def _messages_to(transport, recipient):
    return [
        message
        for message in transport.messages
        if str(message.get("To", "")).strip() == recipient
    ]


def test_host_tick_delivers_publication_and_subscription_email(tmp_path):
    key = Fernet.generate_key()
    repo = make_repo(tmp_path)
    repo.recovery_key = key
    repo.public_origin = ORIGIN
    try:
        subscribe(repo, email=READER)
        assert repo.execute_subscription_command(
            str(uuid4()),
            "comms_subscribe",
            {"email": PENDING, "topics": ["all"], "language": "en"},
            key=key,
            public_origin=ORIGIN,
        ) == {"accepted": True}

        article_id = approve_and_schedule(repo, ["website", "email"])

        transport = RecordingTransport()
        store = RecordingStore(transport)
        queue = PublisherQueue(tmp_path / "profile")
        host = CommunicationsHost(
            repo,
            queue,
            store,
            ORIGIN,
            tmp_path / "profile",
            recovery_key=key,
        )

        first = host.tick()
        assert first["prepared"] == 1

        article = repo.get(article_id)
        assert len(article["history"]) == 1
        publication_id = article["history"][0]["id"]

        publication_messages = _messages_to(transport, READER)
        assert len(publication_messages) == 1
        publication_message = publication_messages[0]
        assert isinstance(publication_message, EmailMessage)
        assert ANNOUNCEMENT_BODY in publication_message.get_content()

        pending_messages = _messages_to(transport, PENDING)
        assert len(pending_messages) == 1
        confirmation_message = pending_messages[0]
        assert isinstance(confirmation_message, EmailMessage)
        assert "/communications/confirm/?token=" in confirmation_message.get_content()

        job = queue.next_job()
        assert job is not None

        summary = repo.email_summary(publication_id)
        assert summary["sent"] == 1
        assert summary["remaining"] == 0

        with repo.engine.connect() as connection:
            email_row = connection.execute(
                select(email_outbox).where(
                    email_outbox.c.publication_id == publication_id
                )
            ).mappings().one()
        assert email_row["state"] == "sent"
        assert email_row["message_id"] == publication_message["Message-ID"]

        before_finish = _rows(repo, publications)[-1]
        assert before_finish["id"] == publication_id
        assert before_finish["state"] != "published"

        queue.finish(job, "delivered")
        host.tick()

        refreshed = repo.get(article_id)
        assert refreshed["id"] == article_id
        publication = next(
            row for row in refreshed["history"] if row["id"] == publication_id
        )
        assert publication["state"] == "published"
        assert publication["website_receipt"]["status"] == "delivered"
        assert repo.email_summary(publication_id)["sent"] == 1

        host.tick()
        assert len(_messages_to(transport, READER)) == 1
        assert len(_messages_to(transport, PENDING)) == 1
        assert repo.email_summary(publication_id)["sent"] == 1
        matching_publications = [
            row for row in _rows(repo, publications) if row["id"] == publication_id
        ]
        assert len(matching_publications) == 1
    finally:
        repo.engine.dispose()


def test_host_tick_respects_preexisting_stop(tmp_path):
    key = Fernet.generate_key()
    repo = make_repo(tmp_path)
    repo.recovery_key = key
    repo.public_origin = ORIGIN
    try:
        subscribe(repo, email=READER)
        approve_and_schedule(repo, ["website", "email"])

        transport = RecordingTransport()
        store = RecordingStore(transport)
        queue = PublisherQueue(tmp_path / "profile")
        host = CommunicationsHost(
            repo,
            queue,
            store,
            ORIGIN,
            tmp_path / "profile",
            recovery_key=key,
        )

        stop = threading.Event()
        stop.set()
        result = host.tick(stop)

        assert result["prepared"] == 0
        assert result["reconciled"] == 0
        assert transport.messages == []
        assert queue.next_job() is None
        publication_rows = _rows(repo, publications)
        assert publication_rows
        assert publication_rows[-1]["state"] == "pending"
        assert _rows(repo, email_outbox) == []
    finally:
        repo.engine.dispose()
