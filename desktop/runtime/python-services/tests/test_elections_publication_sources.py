"""Tests for approved election publication source resolution.

Covers the public allowlist projection, canonical internal source path,
staff-protected citation URL, metadata fail-closed rules and request
schema validation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from townlight_runtime import communications_elections_sources as adapter
from townlight_runtime.communications_sources import _digest
from townlight_runtime.elections_schemas import ElectionApproval, ElectionReceipts

_FIELDS = (
    "id",
    "revision",
    "title",
    "jurisdiction",
    "election",
    "official_source",
    "source_version",
    "description",
)

_UNSET = object()


def _uid() -> str:
    return str(uuid4())


def _content(uid: str) -> dict[str, object]:
    return {
        "id": uid,
        "revision": 3,
        "title": "Seed Election Checklist",
        "jurisdiction": "Example County",
        "election": "Spring General",
        "official_source": "https://elections.example.gov/contests/42",
        "source_version": "2025-04-01",
        "description": "Public election checklist description.",
        "private_notes": "INNER-PRIVATE-SECRET",
        "internal_extra": "EXTRA-CONTENT-SECRET",
    }


def _digest_of(content: dict[str, object]) -> str:
    return _digest({field: content[field] for field in _FIELDS})


def _payload(
    uid: str,
    content: dict[str, object],
    *,
    revision: object = _UNSET,
    sha256: object = _UNSET,
    approval: object = _UNSET,
) -> dict[str, object]:
    revision_value = content.get("revision") if revision is _UNSET else revision
    if sha256 is _UNSET:
        try:
            sha256_value = _digest_of(content)
        except KeyError:
            sha256_value = "0" * 64
    else:
        sha256_value = sha256
    if approval is _UNSET:
        approval_value: object = {
            "actor_id": "staff-1",
            "name": "Ada Staff",
            "approved_at": "2025-05-01T09:00:00Z",
            "revision": content.get("revision"),
            "sha256": sha256_value,
        }
    else:
        approval_value = approval
    return {
        "id": uid,
        "revision": revision_value,
        "sha256": sha256_value,
        "content": dict(content),
        "private_notes": "OUTER-PRIVATE-SECRET",
        "links": [{"rel": "self", "href": "/internal"}],
        "approval": approval_value,
    }


def _install(monkeypatch: pytest.MonkeyPatch, payload: object) -> dict[str, list[object]]:
    recorded: dict[str, list[object]] = {"calls": []}

    async def fake_get(proof: object, request: object, path: str) -> object:
        recorded["calls"].append(path)
        if isinstance(payload, BaseException):
            raise payload
        return payload

    monkeypatch.setattr(adapter, "_get", fake_get)
    return recorded


@pytest.mark.asyncio
async def test_returns_exact_public_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    uid = _uid()
    content = _content(uid)
    digest = _digest_of(content)
    recorded = _install(monkeypatch, _payload(uid, content))

    result = await adapter.elections_source(object(), object(), uid)

    expected_path = f"/desktop/v1/elections/items/{uid}/source"
    assert recorded["calls"] == [expected_path]
    assert set(result) == {"reference", "content"}

    expected_content = {field: content[field] for field in _FIELDS}
    assert result["content"] == expected_content
    assert list(result["content"].keys()) == list(_FIELDS)

    serialized = json.dumps(result, default=str)
    assert "SECRET" not in serialized

    reference = result["reference"]
    assert reference == {
        "kind": "elections",
        "id": uid,
        "revision": digest,
        "title": content["title"],
        "url": f"/desktop/v1/elections/items/{uid}/source",
        "sha256": digest,
        "eligible": True,
    }


@pytest.mark.asyncio
async def test_missing_approval_is_404(monkeypatch: pytest.MonkeyPatch) -> None:
    uid = _uid()
    content = _content(uid)
    _install(monkeypatch, _payload(uid, content, approval=None))

    with pytest.raises(HTTPException) as exc:
        await adapter.elections_source(object(), object(), uid)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_invalid_identifier_is_422_without_fetch(monkeypatch: pytest.MonkeyPatch) -> None:
    recorded = _install(monkeypatch, {})

    with pytest.raises(HTTPException) as exc:
        await adapter.elections_source(object(), object(), "not-a-uuid")
    assert exc.value.status_code == 422
    assert recorded["calls"] == []


@pytest.mark.asyncio
async def test_upstream_404_is_propagated(monkeypatch: pytest.MonkeyPatch) -> None:
    _install(monkeypatch, HTTPException(status_code=404, detail="no source"))

    with pytest.raises(HTTPException) as exc:
        await adapter.elections_source(object(), object(), _uid())
    assert exc.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "mutation",
    [
        "payload_revision",
        "payload_sha",
        "approval_revision",
        "approval_sha",
        "approval_missing_sha",
    ],
)
async def test_metadata_mismatch_fails_closed(
    monkeypatch: pytest.MonkeyPatch, mutation: str
) -> None:
    uid = _uid()
    content = _content(uid)
    content_revision = content["revision"]
    payload = _payload(uid, content)
    approval = payload["approval"]
    assert isinstance(approval, dict)

    if mutation == "payload_revision":
        payload["revision"] = content_revision + 1
    elif mutation == "payload_sha":
        payload["sha256"] = "0" * 64
    elif mutation == "approval_revision":
        approval["revision"] = content_revision + 1
    elif mutation == "approval_sha":
        approval["sha256"] = "0" * 64
    elif mutation == "approval_missing_sha":
        approval.pop("sha256")

    _install(monkeypatch, payload)
    with pytest.raises(HTTPException) as exc:
        await adapter.elections_source(object(), object(), uid)
    assert exc.value.status_code == 503


@pytest.mark.asyncio
async def test_links_do_not_change_reference_hash(monkeypatch: pytest.MonkeyPatch) -> None:
    uid = _uid()
    content = _content(uid)
    digest = _digest_of(content)
    payload = _payload(uid, content)
    payload["links"] = [{"rel": "evil", "href": "/do-not-publish"}]
    payload["content"]["links"] = [{"rel": "evil", "href": "/do-not-publish"}]
    _install(monkeypatch, payload)

    result = await adapter.elections_source(object(), object(), uid)
    assert result["reference"]["revision"] == digest
    assert result["reference"]["sha256"] == digest
    assert result["reference"]["url"] == f"/desktop/v1/elections/items/{uid}/source"


@pytest.mark.asyncio
@pytest.mark.parametrize("field", _FIELDS)
async def test_missing_required_field_is_503(
    monkeypatch: pytest.MonkeyPatch, field: str
) -> None:
    uid = _uid()
    content = _content(uid)
    content.pop(field)
    _install(monkeypatch, _payload(uid, content))

    with pytest.raises(HTTPException) as exc:
        await adapter.elections_source(object(), object(), uid)
    assert exc.value.status_code == 503


def _valid_approval_kwargs() -> dict[str, object]:
    return {
        "expected_revision": 1,
        "expected_sha256": "b" * 64,
        "confirm": True,
    }


def test_approval_accepts_valid_body() -> None:
    ElectionApproval(**_valid_approval_kwargs())


@pytest.mark.parametrize(
    "mutation",
    [
        "missing_confirm",
        "bad_hash",
        "zero_revision",
        "negative_revision",
        "extra_principal",
        "extra_receipt",
    ],
)
def test_approval_rejects_invalid_body(mutation: str) -> None:
    kwargs = _valid_approval_kwargs()
    if mutation == "missing_confirm":
        kwargs.pop("confirm")
    elif mutation == "bad_hash":
        kwargs["expected_sha256"] = "not-a-hash"
    elif mutation == "zero_revision":
        kwargs["expected_revision"] = 0
    elif mutation == "negative_revision":
        kwargs["expected_revision"] = -1
    elif mutation == "extra_principal":
        kwargs["principal"] = {"id": "staff-1"}
    elif mutation == "extra_receipt":
        kwargs["records_receipt"] = {"id": str(uuid4())}

    with pytest.raises(ValidationError):
        ElectionApproval(**kwargs)


def test_receipts_reject_extra_fields() -> None:
    with pytest.raises(ValidationError):
        ElectionReceipts(
            source_revision=1,
            article_id=str(uuid4()),
            article_revision=1,
            records_receipt={"id": str(uuid4())},
        )
