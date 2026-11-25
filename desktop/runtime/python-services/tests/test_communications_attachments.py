"""FastAPI/TestClient coverage for the real communications attachment routes."""

from __future__ import annotations

import base64
import hashlib
from uuid import UUID

import pytest

from test_communications_staff import (
    COMMS,
    _draft_payload,
    _get_article,
    _revision_and_sha,
    communications_app as staff_communications_app,
)
from townlight_runtime.communications_attachments import (
    router as attachment_router,
)


@pytest.fixture()
def communications_app(staff_communications_app):
    client, repository, meeting = staff_communications_app
    client.app.include_router(attachment_router)
    return client, repository, meeting


def _attachment_id(payload: dict) -> str:
    refs = payload["revision"]["attachment_refs"]
    assert refs, payload
    value = refs[-1]["id"]
    assert isinstance(value, str), payload
    return value


def test_attachment_upload_read_remove_preserves_old_revision(communications_app):
    client, _repository, meeting = communications_app

    created = client.post(f"{COMMS}/articles", json=_draft_payload(meeting["id"]))
    assert created.status_code == 200, created.text
    article_id = created.json()["id"]

    before_revision, _ = _revision_and_sha(_get_article(client, article_id))
    content = b"public notice\x00\xff"
    encoded = base64.b64encode(content).decode("ascii")

    upload = client.post(
        f"{COMMS}/articles/{article_id}/attachments",
        json={
            "expected_revision": before_revision,
            "name": "notice.bin",
            "media_type": "application/octet-stream",
            "content_base64": encoded,
            "public": True,
        },
    )
    assert upload.status_code == 200, upload.text
    attachment_id = _attachment_id(upload.json())
    UUID(attachment_id)

    uploaded_revision, _ = _revision_and_sha(_get_article(client, article_id))
    assert uploaded_revision == before_revision + 1

    download = client.get(
        f"{COMMS}/articles/{article_id}/attachments/{attachment_id}"
    )
    assert download.status_code == 200, download.text
    downloaded = download.json()
    assert downloaded["content_base64"] == encoded
    assert downloaded["sha256"] == hashlib.sha256(content).hexdigest()
    assert downloaded["size"] == len(content)
    assert downloaded["name"] == "notice.bin"
    assert downloaded["media_type"] == "application/octet-stream"

    removed = client.post(
        f"{COMMS}/articles/{article_id}/attachments/{attachment_id}/remove",
        json={"expected_revision": uploaded_revision},
    )
    assert removed.status_code == 200, removed.text

    removed_revision, _ = _revision_and_sha(_get_article(client, article_id))
    assert removed_revision == uploaded_revision + 1

    old = client.get(
        f"{COMMS}/articles/{article_id}/attachments/{attachment_id}",
        params={"revision": uploaded_revision},
    )
    assert old.status_code == 200, old.text
    old_body = old.json()
    assert old_body["content_base64"] == encoded
    assert old_body["sha256"] == hashlib.sha256(content).hexdigest()
    assert old_body["size"] == len(content)


def test_attachment_rejections_do_not_add_revisions(communications_app):
    client, _repository, meeting = communications_app

    created = client.post(f"{COMMS}/articles", json=_draft_payload(meeting["id"]))
    assert created.status_code == 200, created.text
    article_id = created.json()["id"]
    revision, _ = _revision_and_sha(_get_article(client, article_id))
    valid_encoded = base64.b64encode(b"retained").decode("ascii")

    for malformed in ("!!!!", "abc"):
        response = client.post(
            f"{COMMS}/articles/{article_id}/attachments",
            json={
                "expected_revision": revision,
                "name": "bad.bin",
                "media_type": "application/octet-stream",
                "content_base64": malformed,
                "public": True,
            },
        )
        assert response.status_code == 422, response.text

    bool_revision = client.post(
        f"{COMMS}/articles/{article_id}/attachments",
        json={
            "expected_revision": True,
            "name": "bool.bin",
            "media_type": "application/octet-stream",
            "content_base64": valid_encoded,
            "public": True,
        },
    )
    assert bool_revision.status_code == 422, bool_revision.text
    unchanged, _ = _revision_and_sha(_get_article(client, article_id))
    assert unchanged == revision

    accepted = client.post(
        f"{COMMS}/articles/{article_id}/attachments",
        json={
            "expected_revision": revision,
            "name": "kept.bin",
            "media_type": "application/octet-stream",
            "content_base64": valid_encoded,
            "public": True,
        },
    )
    assert accepted.status_code == 200, accepted.text
    accepted_revision, _ = _revision_and_sha(_get_article(client, article_id))
    assert accepted_revision == revision + 1

    stale = client.post(
        f"{COMMS}/articles/{article_id}/attachments",
        json={
            "expected_revision": revision,
            "name": "stale.bin",
            "media_type": "application/octet-stream",
            "content_base64": valid_encoded,
            "public": True,
        },
    )
    assert stale.status_code == 409, stale.text
    final_revision, _ = _revision_and_sha(_get_article(client, article_id))
    assert final_revision == accepted_revision
