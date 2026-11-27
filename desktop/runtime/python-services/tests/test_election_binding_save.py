"""Direct handler regression checks; native authentication is outside this fixture."""

import hashlib
import io
import json
import os
import sys
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("JWT_SECRET", "fictional-test-secret")
os.environ.setdefault("TOWNLIGHT_JWT_SECRET", "fictional-test-secret")
_root = Path(__file__).resolve().parents[5]
sys.path.insert(0, str(_root / "comms"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from comms_delivery_fixture import make_repo

from townlight_runtime import communications_staff as staff
from townlight_runtime.communications_publisher import CommunicationsPublisher
from townlight_runtime.communications_schemas import (
    Approval,
    Draft,
    RevisionDraft,
    Schedule,
)
from townlight_runtime.communications_sources import _digest
from townlight_runtime.election_publication import election_publication_text
from townlight_runtime.publisher_queue import PublisherQueue


@pytest.fixture()
def binding_case(tmp_path, monkeypatch):
    content = {
        "id": str(uuid4()), "revision": 1, "title": "Fictional Checklist",
        "jurisdiction": "Example City", "election": "Fictional 2026",
        "description": "Bring the fictional form by Friday.",
        "official_source": "https://example.gov/checklist", "source_version": "1",
    }
    digest = _digest(content)
    ref = {
        "kind": "elections", "id": content["id"], "revision": digest,
        "title": content["title"], "sha256": digest, "eligible": True,
        "url": f"/desktop/v1/elections/items/{content['id']}/source",
    }

    async def resolve(_request, _proof, kind, identifier):
        assert (kind, identifier) == ("elections", content["id"])
        return {"reference": ref, "content": content}

    monkeypatch.setattr(staff, "resolve_source", resolve)
    repo = make_repo(tmp_path)
    try:
        yield repo, content, ref
    finally:
        repo.engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("change", [None, "sentence", "citation", "version", "title"])
async def test_save_binds_actual_article_to_approved_election_text(tmp_path, monkeypatch, change):
    public = {
        "id": str(uuid4()), "revision": 1, "title": "Fictional Checklist",
        "jurisdiction": "Example City", "election": "Fictional 2026",
        "description": "Bring the fictional form by Friday.",
        "official_source": "https://example.gov/checklist", "source_version": "1",
    }
    digest = _digest(public)
    reference = {
        "kind": "elections", "id": public["id"], "revision": digest,
        "title": public["title"], "sha256": digest, "eligible": True,
        "url": f"/desktop/v1/elections/items/{public['id']}/source",
    }

    async def approved_source(_request, _proof, kind, identifier):
        assert (kind, identifier) == ("elections", public["id"])
        return {"reference": reference, "content": public}

    monkeypatch.setattr(staff, "resolve_source", approved_source)
    expected = election_publication_text(public)
    text = dict(expected)
    if change == "sentence":
        text["body"] = text["body"].replace("Friday", "Thursday")
    elif change == "citation":
        text["body"] = text["body"].replace("example.gov/checklist", "example.gov/changed")
    elif change == "version":
        text["body"] = text["body"].replace("Source version: 1", "Source version: 2")
    elif change == "title":
        text["title"] += " changed"
    payload = Draft(**text, kind="announcement", language="en", access_reviewed=True,
                    sources=[{"kind": "elections", "id": public["id"]}])
    repo = make_repo(tmp_path)
    try:
        if change is not None:
            with pytest.raises(HTTPException) as denied:
                await staff.create_article(payload, object(), SimpleNamespace(id="clerk"), repo, None)
            assert denied.value.status_code == 409
            assert "Elections" in denied.value.detail
            assert repo.list_articles() == []
        else:
            article = await staff.create_article(
                payload, object(), SimpleNamespace(id="clerk"), repo, None
            )
            assert article["revision"]["title"] == expected["title"]
            assert article["revision"]["body"] == expected["body"]
            assert article["revision"]["source_refs"] == [reference]
            assert len(repo.list_articles()) == 1
    finally:
        repo.engine.dispose()


@pytest.mark.asyncio
async def test_existing_election_article_cannot_remove_provenance(binding_case):
    repo, content, ref = binding_case
    text = election_publication_text(content)
    article = repo.create("clerk", "announcement", text["title"], text["body"], "en",
                          [ref], access_review={"reviewed": True, "findings": []})
    edit = RevisionDraft(**text, kind="announcement", expected_revision=1, sources=[],
                         access_reviewed=True)
    with pytest.raises(HTTPException) as denied:
        await staff.create_revision(UUID(article["id"]), edit, object(),
                                    SimpleNamespace(id="clerk"), repo, None)
    assert denied.value.status_code == 409
    assert repo.get(article["id"])["current_revision"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("boundary", ["approval", "schedule", "publisher"])
async def test_later_boundaries_reject_legacy_mismatched_article(binding_case, tmp_path, boundary):
    """Direct repository writes deliberately model a persisted pre-guard bad draft."""
    repo, content, ref = binding_case
    text = election_publication_text(content)
    wrong = text["body"].replace("Friday", "Thursday")
    article = repo.create("clerk", "announcement", text["title"], wrong, "en", [ref],
                          access_review={"reviewed": True, "findings": []})
    article_id, sha = article["id"], article["revision"]["sha256"]
    repo.review(article_id, "clerk", 1, "Fictional review")
    if boundary == "approval":
        with pytest.raises(HTTPException) as denied:
            await staff.approve_article(UUID(article_id), Approval(expected_revision=1,
                expected_sha256=sha, confirm=True), object(), SimpleNamespace(id="clerk"), repo, None)
        assert denied.value.status_code == 409
        assert repo.get(article_id)["state"] == "review"
        return
    # This intentionally bypasses the guarded API to exercise the next boundary.
    repo.approve(article_id, 1, sha, "clerk", [ref])
    repo.capture_source_snapshots(article_id, 1, sha, [{"reference": ref, "content": content}])
    due = datetime.now(UTC) - timedelta(seconds=1)
    if boundary == "schedule":
        with pytest.raises(HTTPException) as denied:
            await staff.schedule_article(UUID(article_id), Schedule(expected_revision=1,
                expected_sha256=sha, confirm=True, due_at=due, channels=["website"]),
                object(), SimpleNamespace(id="clerk"), repo, None)
        assert denied.value.status_code == 409
        assert repo.get(article_id)["state"] == "approved"
        return
    repo.schedule(article_id, 1, sha, "clerk", due, ["website"])
    queue = PublisherQueue(tmp_path / "profile")
    publisher = CommunicationsPublisher(repo, queue, "https://portal.example.org", tmp_path / "profile")
    assert publisher.prepare_one() is None
    assert queue.next_job() is None
    assert repo.get(article_id)["history"][0]["state"] == "failed"


def test_captured_v1_survives_pending_source_and_separately_approved_correction(binding_case, tmp_path):
    """Local queue and immutable artifact regression, without a portal or Records service."""
    repo, content, _ref = binding_case
    sys.path.insert(0, str(_root / "elections"))
    from civicelections.publication import (
        ElectionPrincipal,
        ElectionPublicationRepository,
        NotFound,
    )

    clerk = ElectionPrincipal("clerk", "Fictional Clerk", frozenset({"elections-clerk"}))
    official = ElectionPrincipal("official", "Fictional Official", frozenset({"elections-official"}))
    sources = ElectionPublicationRepository(tmp_path / "elections.sqlite3", frozenset({"official"}))
    source = sources.create(clerk, title=content["title"], jurisdiction=content["jurisdiction"],
        election=content["election"], description=content["description"],
        official_source=content["official_source"], source_version="1", private_notes="SECRET-NOTE")
    sources.approve(official, source["id"], 1, source["sha256"])

    def snapshot(revision=None):
        approved = sources.public_snapshot(clerk, source["id"], revision)
        public = approved["content"]
        digest = _digest(public)
        return {"content": public, "reference": {"kind": "elections", "id": source["id"],
            "revision": digest, "sha256": digest, "title": public["title"], "eligible": True,
            "url": f"/desktop/v1/elections/items/{source['id']}/source"}}

    first = snapshot()
    text1 = election_publication_text(first["content"])
    article = repo.create("clerk", "announcement", text1["title"], text1["body"], "en",
        [first["reference"]], access_review={"reviewed": True, "findings": []})
    article_id = article["id"]

    def schedule(article, snap, action="publish"):
        revision, sha = article["current_revision"], article["revision"]["sha256"]
        repo.review(article_id, "clerk", revision, "Fictional review")
        repo.approve(article_id, revision, sha, "clerk", [snap["reference"]])
        repo.capture_source_snapshots(article_id, revision, sha, [snap])
        repo.schedule(article_id, revision, sha, "clerk", datetime.now(UTC)-timedelta(seconds=1),
            ["website"], action=action)
        return sha

    sha1 = schedule(article, first)
    changed = sources.edit(clerk, source["id"], 1, source_version="2",
        description="Bring the fictional form by Thursday.")
    with pytest.raises(NotFound):
        sources.public_snapshot(clerk, source["id"])
    queue = PublisherQueue(tmp_path / "profile")
    publisher = CommunicationsPublisher(repo, queue, "https://portal.example.org", tmp_path / "profile")

    def dispatch():
        job_id = publisher.prepare_one()
        assert job_id is not None
        queued = queue.next_job()
        with zipfile.ZipFile(queue.root / queued["blob"]) as outer:
            artifact = outer.read("release.bin")
        with zipfile.ZipFile(io.BytesIO(artifact)) as inner:
            public = json.loads(inner.read("article.json"))
        receipt = next(row["website_receipt"] for row in repo.get(article_id)["history"]
                       if row["id"] == job_id)
        queue.finish(queued, "delivered")
        repo.reconcile_publication(job_id, website_receipt={**receipt, "status": "delivered"})
        return artifact, public, receipt["url"]

    bytes1, public1, url1 = dispatch()
    assert public1["body"] == text1["body"]
    assert "SECRET-NOTE" not in bytes1.decode("latin1")
    assert publisher.prepare_one() is None
    archive1 = repo.build_records_archive(article_id, 1, sha1)
    repo.record_records_receipt(article_id, 1, hashlib.sha256(archive1).hexdigest(),
        "fictional-records-v1", str(uuid4()))
    sources.approve(official, source["id"], 2, changed["sha256"])
    second = snapshot()
    text2 = election_publication_text(second["content"])
    edited = repo.edit(article_id, "clerk", 1, text2["title"], text2["body"], "en",
        [second["reference"]], access_review={"reviewed": True, "findings": []})
    sha2 = schedule(edited, second, "correct")
    bytes2, public2, url2 = dispatch()
    assert url1 == url2 == f"https://portal.example.org/communications/{article_id}/"
    assert bytes1 != bytes2 and sha1 != sha2
    assert public2["body"] == text2["body"]
    assert election_publication_text(snapshot(1)["content"]) == text1
    assert repo.get_source_snapshots(article_id, 1, sha1) == [first]
    assert repo.get_source_snapshots(article_id, 2, sha2) == [second]
    assert publisher.prepare_one() is None
