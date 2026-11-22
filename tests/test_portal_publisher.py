# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import ssl
from unittest.mock import patch
from uuid import uuid4

import httpx
import pytest

from townlight_runtime.publisher_queue import PublisherQueue


def approved_packet(tmp_path):
    file = tmp_path / "source.pdf"
    file.write_bytes(b"%PDF-1.7\nApproved")
    return {"version": 2, "action": "publish", "kind": "packet", "meeting_id": str(uuid4()),
            "title": "Council", "scheduled_start": "2026-11-21T12:00:00-07:00", "agenda": "Public", "index": [],
            "artifact_sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
            "artifact_size": file.stat().st_size}, file


def test_delivery_restarts_with_same_exact_bytes_and_survives_outage(tmp_path, monkeypatch):
    packet, source = approved_packet(tmp_path)
    credential = tmp_path / "publisher-token"
    credential.write_text("a" * 44, encoding="ascii")
    monkeypatch.setenv("TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN", "https://portal.example")
    monkeypatch.setenv("TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_FILE", str(credential))
    queue = PublisherQueue(tmp_path)
    job = queue.enqueue(packet, "clerk", "review", source)
    assert queue.enqueue(packet, "clerk", "review", source)["sequence"] == job["sequence"] == 1
    original_job = queue.next_job()
    saved = queue.root / original_job["blob"]
    digest = hashlib.sha256(saved.read_bytes()).hexdigest()
    source.write_bytes(b"Changed after approval")

    attempts = []

    def handler(request):
        attempts.append(request)
        assert hashlib.sha256(request.read()).hexdigest() == request.headers["X-Townlight-SHA256"] == digest
        assert request.headers["Authorization"] == "Bearer " + "a" * 44
        assert request.url.path == f"/townlight/v1/publications/{packet['meeting_id']}/packet/1/"
        status = 503 if len(attempts) == 1 else 200
        return httpx.Response(status, json={"status": "applied"})

    client = httpx.Client

    def observed_client(**kwargs):
        context = kwargs["verify"]
        assert isinstance(context, ssl.SSLContext)
        assert context.verify_mode == ssl.CERT_REQUIRED
        assert context.check_hostname
        assert kwargs["trust_env"] is False
        assert kwargs["follow_redirects"] is False
        return client(**kwargs, transport=httpx.MockTransport(handler))

    with patch("townlight_runtime.publisher_queue.httpx.Client", side_effect=observed_client):
        queue.deliver(original_job)
        assert queue.status(packet["meeting_id"])[0]["state"] == "retrying"
        assert saved.exists()
        restarted = PublisherQueue(tmp_path)
        with patch("townlight_runtime.publisher_queue.time.time", return_value=10**10):
            restarted.deliver(restarted.next_job())
        assert restarted.status(packet["meeting_id"])[0]["state"] == "delivered"
        assert not saved.exists()
    assert len(attempts) == 2


def test_withdrawal_supersedes_undelivered_revision_and_refuses_changed_bytes(tmp_path):
    packet, source = approved_packet(tmp_path)
    queue = PublisherQueue(tmp_path)
    source.write_bytes(b"wrong")
    with pytest.raises(ValueError, match="changed"):
        queue.enqueue(packet, "clerk", "review", source)
    assert queue.status(packet["meeting_id"]) == []
    source.write_bytes(b"%PDF-1.7\nApproved")
    queue.enqueue(packet, "clerk", "review", source)
    withdrawal = {"version": 2, "action": "withdraw", "kind": "packet", "meeting_id": packet["meeting_id"]}
    assert queue.enqueue(withdrawal, "clerk")["sequence"] == 2
    assert queue.next_job()["action"] == "withdraw"
    assert len(list(queue.root.glob("*.zip"))) == 1
