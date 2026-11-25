"""Real FastAPI/TestClient tests for the staff communications workflow.

The meetings endpoint below is a deliberately simulated authoritative public
meetings API.  It is not the production meetings database.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from townlight_comms.workflow import CommunicationsRepository
from townlight_runtime.communications_staff import current_actor, router

COMMS = "/desktop/v1/communications"


def _field(value: object, name: str) -> object:
    if isinstance(value, dict):
        return value.get(name)
    return getattr(value, name, None)


def _build_repository(db_path: Path) -> CommunicationsRepository:
    """Create and migrate the real repository on a private temporary SQLite DB."""

    from sqlalchemy import create_engine
    from townlight_comms.migrations import upgrade

    engine = create_engine(
        f"sqlite:///{db_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    upgrade(engine)
    return CommunicationsRepository(engine)


def _draft_payload(meeting_id: str) -> dict:
    return {
        "title": "Council adopts accessibility improvements",
        "body": "The council approved the accessibility package on Tuesday.",
        "kind": "meeting_summary",
        "language": "en",
        "sources": [{"kind": "meetings", "id": meeting_id}],
        "access_reviewed": True,
        "translation_provenance": None,
    }


def _get_article(client: TestClient, article_id: str) -> dict:
    response = client.get(f"{COMMS}/articles/{article_id}")
    assert response.status_code == 200, response.text
    return response.json()


def _revision_and_sha(article: dict) -> tuple[int, str]:
    revision = _field(article, "current_revision")
    revision_data = _field(article, "revision")
    sha256 = _field(revision_data, "sha256")
    assert isinstance(revision, int) and revision > 0
    assert isinstance(sha256, str) and len(sha256) == 64
    return revision, sha256


@pytest.fixture()
def communications_app(tmp_path: Path):
    app = FastAPI()

    meeting_id = str(uuid4())
    meeting = {
        "id": meeting_id,
        "meeting_id": meeting_id,
        "title": "City Council Regular Meeting",
        "posted_agenda": "/meetings/agenda.pdf",
        "posted_packet": "/meetings/packet.pdf",
        "approved_minutes": "Approved minutes for the regular meeting.",
        "plain_language_summary": "Council approved the accessibility package.",
        "minutes_adopted_at": "2024-05-02T18:00:00Z",
        "minutes_signed_by": "City Clerk",
    }

    # Deliberately simulated authoritative public-meetings endpoint, not the
    # real meetings database.
    @app.get("/public/meetings/data/{requested_id}")
    def simulated_public_meeting(requested_id: str) -> dict:
        if requested_id != meeting["id"]:
            raise HTTPException(status_code=404, detail="meeting not found")
        return dict(meeting)

    repository = _build_repository(tmp_path / "communications.sqlite3")
    app.state.desktop_communications = repository

    actor_id = uuid4()
    app.dependency_overrides[current_actor] = lambda: SimpleNamespace(id=actor_id)
    app.include_router(router)

    with TestClient(app, headers={"X-Townlight-Session": "test-native-proof"}) as client:
        yield client, repository, meeting


def test_staff_workflow_persists_scheduled_domain_row(communications_app):
    client, repository, meeting = communications_app
    meeting_id = meeting["id"]

    created_response = client.post(
        f"{COMMS}/articles",
        json=_draft_payload(meeting_id),
    )
    assert created_response.status_code == 200, created_response.text
    created = created_response.json()
    article_id = _field(created, "id")
    assert isinstance(article_id, str) and article_id

    article = _get_article(client, article_id)
    revision = _field(article, "revision")
    refs = _field(revision, "source_refs")
    assert isinstance(refs, list) and len(refs) == 1
    assert refs[0]["kind"] == "meetings"
    assert refs[0]["id"] == meeting_id
    assert refs[0]["url"] == f"/public/meetings/data/{meeting_id}"
    assert "://" not in refs[0]["url"]

    current_revision, current_sha256 = _revision_and_sha(article)
    reviewed_response = client.post(
        f"{COMMS}/articles/{article_id}/review",
        json={"expected_revision": current_revision, "note": "Ready for approval."},
    )
    assert reviewed_response.status_code == 200, reviewed_response.text

    article = _get_article(client, article_id)
    current_revision, current_sha256 = _revision_and_sha(article)
    approved_response = client.post(
        f"{COMMS}/articles/{article_id}/approval",
        json={
            "expected_revision": current_revision,
            "expected_sha256": current_sha256,
            "confirm": True,
        },
    )
    assert approved_response.status_code == 200, approved_response.text

    article = _get_article(client, article_id)
    current_revision, current_sha256 = _revision_and_sha(article)
    due_at = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    scheduled_response = client.post(
        f"{COMMS}/articles/{article_id}/schedule",
        json={
            "expected_revision": current_revision,
            "expected_sha256": current_sha256,
            "confirm": True,
            "due_at": due_at,
            "channels": ["website"],
            "action": "publish",
        },
    )
    assert scheduled_response.status_code == 200, scheduled_response.text
    scheduled = scheduled_response.json()
    assert _field(scheduled, "state") == "scheduled"

    article_row = repository.get(str(article_id))
    assert _field(article_row, "state") == "scheduled"
    history = _field(article_row, "history")
    matching_jobs = [
        job
        for job in history
        if _field(job, "channels") == ["website"]
        and _field(job, "revision") == 1
        and _field(job, "state") == "pending"
    ]
    assert len(matching_jobs) == 1, history


def test_source_change_between_review_and_approval_is_conflict(communications_app):
    client, _repository, meeting = communications_app

    created_response = client.post(
        f"{COMMS}/articles",
        json=_draft_payload(meeting["id"]),
    )
    assert created_response.status_code == 200, created_response.text
    article_id = created_response.json()["id"]

    article = _get_article(client, article_id)
    current_revision, _current_sha256 = _revision_and_sha(article)
    reviewed_response = client.post(
        f"{COMMS}/articles/{article_id}/review",
        json={"expected_revision": current_revision, "note": "Reviewed."},
    )
    assert reviewed_response.status_code == 200, reviewed_response.text

    article = _get_article(client, article_id)
    current_revision, current_sha256 = _revision_and_sha(article)

    meeting["approved_minutes"] = "The authoritative minutes changed after review."

    approval_response = client.post(
        f"{COMMS}/articles/{article_id}/approval",
        json={
            "expected_revision": current_revision,
            "expected_sha256": current_sha256,
            "confirm": True,
        },
    )
    assert approval_response.status_code == 409
    assert approval_response.json()["detail"] == "source changed"


def test_meeting_eligibility_and_schema_reject_unsafe_payloads(communications_app):
    client, _repository, meeting = communications_app

    meeting["approved_minutes"] = None
    missing_minutes_response = client.post(
        f"{COMMS}/articles",
        json=_draft_payload(meeting["id"]),
    )
    assert missing_minutes_response.status_code == 404
    assert missing_minutes_response.json()["detail"] == "source not eligible"

    meeting["approved_minutes"] = "Approved minutes for the regular meeting."
    meeting["minutes_adopted_at"] = None
    missing_adoption_response = client.post(
        f"{COMMS}/articles",
        json=_draft_payload(meeting["id"]),
    )
    assert missing_adoption_response.status_code == 404
    assert missing_adoption_response.json()["detail"] == "source not eligible"

    extra_field_payload = _draft_payload(meeting["id"])
    extra_field_payload["sources"][0]["eligible"] = True
    extra_field_response = client.post(f"{COMMS}/articles", json=extra_field_payload)
    assert extra_field_response.status_code == 422

    false_confirmation_response = client.post(
        f"{COMMS}/articles/{uuid4()}/approval",
        json={
            "expected_revision": 1,
            "expected_sha256": "0" * 64,
            "confirm": False,
        },
    )
    assert false_confirmation_response.status_code == 422
