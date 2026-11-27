"""Local historical receipt and trusted handler checks, without an archive service."""

import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException

os.environ.setdefault("TESTING", "1")
os.environ.setdefault("JWT_SECRET", "fictional-receipts-secret")
os.environ.setdefault("TOWNLIGHT_JWT_SECRET", "fictional-receipts-secret")
_root = Path(__file__).resolve().parents[5]
for package in ("library", "elections", "comms"):
    sys.path.insert(0, str(_root / package))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from comms_delivery_fixture import make_repo
from townlight_comms.models import records_receipts, revisions

from townlight_runtime import elections_staff, library_staff
from townlight_runtime.communications_sources import _digest
from townlight_runtime.elections_schemas import ElectionReceipts
from townlight_runtime.library_schemas import LibraryReceipts


@pytest.mark.parametrize("module", [library_staff, elections_staff])
def test_schema_bound_historical_read_does_not_use_current_revision(tmp_path, module):
    repo = make_repo(tmp_path)
    try:
        article = repo.create("clerk", "announcement", "Fictional", "Version one", "en", [])
        identifier = article["id"]
        repo.edit(identifier, "clerk", 1, "Fictional", "Version two", "en", [])
        first = {"kind": "elections", "id": str(uuid4()), "revision": "a" * 64,
                 "title": "Version one", "url": "/fictional/source", "sha256": "a" * 64,
                 "eligible": True}
        second = {**first, "revision": "b" * 64, "sha256": "b" * 64, "title": "Version two"}
        file_id = str(uuid4())
        with repo.engine.begin() as connection:
            for revision, reference in [(1, first), (2, second)]:
                connection.execute(revisions.update().where(
                    revisions.c.article_id == identifier, revisions.c.revision == revision
                ).values(source_refs=[reference]))
            connection.execute(records_receipts.insert().values(article_id=identifier, revision=1,
                archive_sha256="c" * 64, records_id="fictional-records-v1", file_id=file_id,
                created_at=datetime.now(UTC)))
        assert module._read_comms(repo.engine, identifier, 1) == ([first], {
            "article_id": identifier, "revision": 1, "archive_sha256": "c" * 64,
            "records_id": "fictional-records-v1", "file_id": file_id,
        })
        assert module._read_comms(repo.engine, identifier, 2) == ([second], None)
        assert module._read_comms(repo.engine, identifier, 3) is None
    finally:
        repo.engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("module,payload_type,kind", [
    (library_staff, LibraryReceipts, "library"), (elections_staff, ElectionReceipts, "elections"),
])
@pytest.mark.parametrize("defect", [None, "kind", "id", "revision", "sha256", "title", "url",
                                   "eligible", "actor", "digest", "missing", "unapproved"])
async def test_link_requires_full_canonical_reference_and_same_mapped_actor(
    monkeypatch, module, payload_type, kind, defect,
):
    identifier, article_id, actor_id = str(uuid4()), str(uuid4()), str(uuid4())
    content = {"id": identifier, "revision": 1, "title": "Fictional source"}
    digest = _digest(content)
    reference = {"kind": kind, "id": identifier, "revision": digest, "sha256": digest,
                 "title": content["title"], "url": f"/desktop/v1/{kind}/items/{identifier}/source",
                 "eligible": True}
    snapshot = {"content": content, "sha256": digest}
    receipt = {"article_id": article_id, "revision": 1, "archive_sha256": "a" * 64,
               "records_id": "fictional-archive", "file_id": str(uuid4())}
    if defect in reference:
        reference[defect] = False if defect == "eligible" else "changed"
    if defect == "digest":
        snapshot["sha256"] = "b" * 64
    actor = SimpleNamespace(id=UUID(actor_id), full_name="Fictional Clerk")

    async def mapped(*_args):
        return SimpleNamespace(id=uuid4()) if defect == "actor" else actor

    read_calls, linked = [], []

    def read(*args):
        read_calls.append(args)
        return None if defect == "missing" else ([reference], receipt)

    def public(*_args):
        if defect == "unapproved":
            raise module.NotFound("unapproved")
        return snapshot

    def link(*args):
        linked.append(args)
        return {"linked": True}

    monkeypatch.setattr(module, "mapped_native_actor", mapped)
    monkeypatch.setattr(module, "_read_comms", read)
    request = SimpleNamespace(state=SimpleNamespace(native_role="city-staff"), app=SimpleNamespace(
        state=SimpleNamespace(desktop_communications=SimpleNamespace(engine=object()),
                              desktop_elections_officials=frozenset())))
    repository = SimpleNamespace(public_snapshot=public, link_receipts=link)
    payload = payload_type(source_revision=1, article_id=article_id, article_revision=1)
    if defect:
        with pytest.raises(HTTPException) as denied:
            await module.link_receipts(UUID(identifier), payload, request, actor, repository, None, None)
        assert denied.value.status_code == (403 if defect == "actor" else 409)
        assert not linked
        if defect == "actor":
            assert not read_calls
    else:
        assert await module.link_receipts(
            UUID(identifier), payload, request, actor, repository, None, None
        ) == {"linked": True}
        assert linked[0][1:] == (identifier, 1, article_id, 1, receipt)
