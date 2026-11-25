import asyncio
import hashlib
import io
import json
import zipfile

import pytest
from fastapi import HTTPException

from townlight_runtime.communications_department_sources import (
    _dataset_rows,
    _notice,
    department_source,
)
from townlight_runtime.communications_sources import _digest


@pytest.fixture
def notice_payload():
    document = {
        "title": "Notice of public hearing",
        "body": "The actual published body stays public.",
        "notice_type": "hearing",
        "statutory_basis": "Code 1.2",
        "event_date": "2026-02-03",
        "lead_days": 14,
        "actor": "private-staff-id",
        "private_note": "do not publish",
        "resident_email": "resident@example.test",
    }
    digest = hashlib.sha256(
        json.dumps(document, ensure_ascii=False, sort_keys=True, indent=2).encode()
    ).hexdigest()
    payload = {
        "notice": {
            "state": "proof-recorded",
            "document": document,
            "approval": {"document_sha256": digest},
            "proofs": [
                {
                    "approved_document_sha256": digest,
                    "sha256": digest,
                    "location": "https://records.example.test/notice.pdf",
                    "published_at": "2026-01-02T03:04:05Z",
                }
            ],
        }
    }
    return payload, digest


def _copy(value):
    return json.loads(json.dumps(value))


def test_notice_projection_keeps_public_body_and_drops_private_fields(notice_payload):
    payload, _ = notice_payload
    snapshot, title = _notice(payload)
    document = payload["notice"]["document"]
    assert title == document["title"]
    assert snapshot["document"]["body"] == document["body"]
    assert set(snapshot["document"]) == {
        "title", "body", "notice_type", "statutory_basis", "event_date", "lead_days",
    }
    assert "actor" not in snapshot["document"]
    assert "private_note" not in snapshot["document"]
    assert "resident_email" not in str(snapshot)
    assert set(snapshot["proofs"][0]) == {"sha256", "location", "published_at"}


def test_notice_rejects_wrong_hash_private_or_unapproved_proof(notice_payload):
    payload, _ = notice_payload
    wrong = _copy(payload)
    wrong["notice"]["approval"]["document_sha256"] = "0" * 64
    private = _copy(payload)
    private["notice"]["proofs"][0]["retained"] = False
    unapproved = _copy(payload)
    unapproved["notice"]["proofs"][0]["approved_document_sha256"] = "f" * 64
    for bad in (wrong, private, unapproved):
        with pytest.raises(HTTPException) as exc:
            _notice(bad)
        assert exc.value.status_code == 404


def _zip_dataset(rows):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("dataset.json", json.dumps(rows))
    return buffer.getvalue()


def test_dataset_rows_returns_only_the_four_public_fields():
    rows = [
        {"category": "roads", "department": "public-works", "state": "open", "count": 3},
        {"category": "water", "department": "utilities", "state": "closed", "count": 0},
    ]
    assert _dataset_rows(_zip_dataset(rows)) == rows


def test_dataset_rejects_malformed_zip_pii_extra_and_bad_counts():
    row = {"category": "roads", "department": "public-works", "state": "open", "count": 1}
    with pytest.raises(HTTPException) as exc:
        _dataset_rows(b"not a zip archive")
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as exc:
        _dataset_rows(_zip_dataset([{**row, "resident_contact": "555-0100"}]))
    assert exc.value.status_code == 409
    for count in (True, -1):
        with pytest.raises(HTTPException) as exc:
            _dataset_rows(_zip_dataset([{**row, "count": count}]))
        assert exc.value.status_code == 409


def test_department_source_notice_uses_explicit_get_and_real_identity_hash(
    monkeypatch, notice_payload
):
    payload, _ = notice_payload
    seen = {}
    sources = __import__(
        "townlight_runtime.communications_sources", fromlist=["_get"]
    )

    async def explicit_get(proof, request, path):
        seen["contract"] = (proof, request, path)
        return payload

    monkeypatch.setattr(sources, "_get", explicit_get)
    request, proof = object(), object()
    identifier = "539b73ba-08dd-47fc-bdcc-e269b3a3688f"
    result = asyncio.run(department_source(request, proof, "notice", identifier))
    expected_path = f"/desktop/v1/notice/notices/{identifier}"
    assert seen["contract"] == ( proof, request, expected_path )
    snapshot, title = _notice(payload)
    assert result["content"] == snapshot
    assert result["reference"]["title"] == title
    assert result["reference"]["sha256"] == _digest(snapshot)
    assert result["reference"]["revision"] == result["reference"]["sha256"]
    assert result["reference"]["url"] == expected_path
    assert result["reference"]["kind"] == "notice"
    assert result["reference"]["id"] == identifier
    assert result["reference"]["eligible"] is True
