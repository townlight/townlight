"""Resolve approved department communications sources."""

from __future__ import annotations

import hashlib
import io
import json
import zipfile
from collections.abc import Mapping
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from townlight_records.database import async_session_maker

from townlight_runtime.publisher_queue import PublisherQueue

from .service_request_data_model import ServiceRequestPublicationRevision

_STREAM = "539b73ba-08dd-47fc-bdcc-e269b3a3688f"
_DATASET_LIMIT = 2 * 1024 * 1024
_ROW_LIMIT = 10000
_ROW_KEYS = {"category", "department", "state", "count"}
_DOCUMENT_FIELDS = (
    "title",
    "body",
    "notice_type",
    "statutory_basis",
    "event_date",
    "lead_days",
)


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="source not eligible")


def _uuid(identifier: object) -> UUID:
    try:
        return UUID(str(identifier))
    except (AttributeError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="invalid identifier") from exc


def _notice(payload: Mapping[str, object]) -> tuple[dict[str, object], str]:
    notice = payload.get("notice")
    if not isinstance(notice, Mapping):
        raise _not_found()
    document = notice.get("document")
    approval = notice.get("approval")
    proofs = notice.get("proofs")
    if (
        notice.get("state") not in ("proof-recorded", "archived")
        or not isinstance(document, Mapping)
        or not isinstance(approval, Mapping)
        or not isinstance(proofs, list)
    ):
        raise _not_found()
    try:
        approved_hash = hashlib.sha256(
            json.dumps(
                document, ensure_ascii=False, sort_keys=True, indent=2
            ).encode()
        ).hexdigest()
    except (TypeError, ValueError) as exc:
        raise _not_found() from exc
    if (
        approval.get("document_sha256") != approved_hash
        or not isinstance(document.get("title"), str)
        or not document["title"]
    ):
        raise _not_found()
    public_proofs: list[dict[str, object]] = []
    for proof in proofs:
        if not isinstance(proof, Mapping) or proof.get("retained") is False:
            continue
        matched = proof.get("approved_document_sha256", proof.get("sha256"))
        sha256 = proof.get("sha256")
        location = proof.get("location")
        published_at = proof.get("published_at")
        if (
            matched != approved_hash
            or not isinstance(sha256, str)
            or not sha256
            or not isinstance(location, str)
            or not location
            or not isinstance(published_at, str)
            or not published_at
        ):
            raise _not_found()
        public_proofs.append(
            {"sha256": sha256, "location": location, "published_at": published_at}
        )
    if not public_proofs:
        raise _not_found()
    public_document = {key: document.get(key) for key in _DOCUMENT_FIELDS}
    return {"document": public_document, "proofs": public_proofs}, document["title"]


def _dataset_rows(blob: bytes) -> list[dict[str, object]]:
    try:
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            member = archive.getinfo("dataset.json")
            if member.file_size > _DATASET_LIMIT:
                raise ValueError("dataset.json too large")
            with archive.open(member) as source:
                raw = source.read(_DATASET_LIMIT + 1)
        if len(raw) > _DATASET_LIMIT:
            raise ValueError("dataset.json too large")
        rows = json.loads(raw)
    except (zipfile.BadZipFile, KeyError, OSError, RuntimeError, ValueError, EOFError) as exc:
        raise HTTPException(status_code=409, detail="malformed aggregate dataset") from exc
    if not isinstance(rows, list) or len(rows) > _ROW_LIMIT:
        raise HTTPException(status_code=409, detail="malformed aggregate dataset")
    clean: list[dict[str, object]] = []
    for row in rows:
        if not isinstance(row, Mapping) or set(row) != _ROW_KEYS:
            raise HTTPException(status_code=409, detail="malformed aggregate dataset")
        count = row.get("count")
        if (
            not isinstance(count, int)
            or isinstance(count, bool)
            or count < 0
            or any(
                not isinstance(row.get(key), str) or len(row[key]) > 255
                for key in ("category", "department", "state")
            )
        ):
            raise HTTPException(status_code=409, detail="malformed aggregate dataset")
        clean.append({key: row[key] for key in ("category", "department", "state", "count")})
    return clean


def _action(status: object) -> str:
    if not isinstance(status, list):
        return ""
    latest: Mapping[str, object] | None = None
    latest_sequence: int | None = None
    for entry in status:
        if not isinstance(entry, Mapping) or entry.get("kind") != "dataset":
            continue
        sequence = entry.get("sequence")
        if not isinstance(sequence, int) or isinstance(sequence, bool):
            continue
        if latest_sequence is None or sequence > latest_sequence:
            latest = entry
            latest_sequence = sequence
    if latest is None:
        return ""
    action = latest.get("action")
    if isinstance(action, str) and action.lower() == "withdraw":
        return "withdraw"
    return ""


async def department_source(
    request: object, proof: object, kind: str, identifier: str
) -> dict[str, object]:
    from .communications_sources import _digest, _get

    if kind not in ("notice", "311"):
        raise HTTPException(status_code=404, detail="unknown source kind")
    ident = _uuid(identifier)
    ident_text = str(ident)

    if kind == "notice":
        path = f"/desktop/v1/notice/notices/{ident_text}"
        payload = await _get(proof, request, path)
        snapshot, title = _notice(payload)
        url = path
    else:
        try:
            async with async_session_maker() as session:
                revision = await session.get(ServiceRequestPublicationRevision, ident)
        except SQLAlchemyError as exc:
            raise HTTPException(status_code=503, detail="source unavailable") from exc
        if revision is None or revision.approved_at is None:
            raise _not_found()
        if hashlib.sha256(revision.inner_zip).hexdigest() != revision.sha256:
            raise HTTPException(status_code=409, detail="malformed aggregate dataset")
        queue = PublisherQueue(request.app.state.desktop_profile_root)
        status = await run_in_threadpool(queue.status, _STREAM)
        if _action(status):
            raise _not_found()
        snapshot = {
            "title": "Public service-request statistics",
            "rows": _dataset_rows(revision.inner_zip),
        }
        title = snapshot["title"]
        url = f"/datasets/{_STREAM}/dataset.json"

    digest = _digest(snapshot)
    return {
        "reference": {
            "kind": kind,
            "id": ident_text,
            "revision": digest,
            "title": title,
            "url": url,
            "sha256": digest,
            "eligible": True,
        },
        "content": snapshot,
    }
