"""Private Parks archive handoffs, attachments, and aggregate reports."""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import unicodedata
import zipfile
from pathlib import Path
from typing import Any, Literal
from uuid import UUID

from fastapi import HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from townlight_records.auth.native_identity import mapped_native_actor

from .communications_records_files import stage_archive
from .communications_records_store import persist_archive
from .parks_base import Actor, Db, ProofHeader, Repo, _actor_id, _call, router

Kind = Literal["resource", "program", "booking", "registration"]
_MAX_ARCHIVE_BYTES = 40 * 1024 * 1024
_MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
_MAX_B64 = 4 * ((_MAX_ATTACHMENT_BYTES + 2) // 3)
_METADATA_FIELDS = (
    "id", "entity_kind", "entity_id", "name", "media_type", "sha256",
    "size", "actor", "created_at",
)


class RecordsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: Literal[True]
    expected_revision: int = Field(strict=True, gt=0)
    expected_sha256: str = Field(strict=True, pattern=r"^[0-9a-f]{64}$")


class AttachmentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(strict=True, min_length=1, max_length=255)
    media_type: str = Field(strict=True, min_length=1, max_length=255)
    content_base64: str = Field(strict=True, max_length=_MAX_B64)


def _inspect_archive(archive: Any) -> tuple[bytes, dict[str, Any]]:
    if not isinstance(archive, dict):
        raise TypeError("archive is invalid")
    raw = archive.get("content")
    if not isinstance(raw, (bytes, bytearray)):
        raise TypeError("archive is invalid")
    content = bytes(raw)
    name = archive.get("name")
    if not content or len(content) > _MAX_ARCHIVE_BYTES:
        raise ValueError("archive is invalid")
    if not isinstance(name, str) or not name or len(name) > 255:
        raise TypeError("archive is invalid")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as bundle:
            record = json.loads(bundle.read("record.json"))
        revision = record["current_record"]["revision"]
    except (KeyError, TypeError, ValueError, zipfile.BadZipFile) as exc:
        raise ValueError("archive record is invalid") from exc
    if isinstance(revision, bool) or not isinstance(revision, int) or revision <= 0:
        raise TypeError("archive record is invalid")
    digest = hashlib.sha256(content).hexdigest()
    declared = archive.get("sha256")
    if declared is not None and declared != digest:
        raise ValueError("archive digest is invalid")
    return content, {
        "name": name,
        "sha256": digest,
        "size": len(content),
        "current_revision": revision,
    }


def _safe_name(value: Any) -> str:
    text_value = "" if value is None else str(value)
    safe = "".join(
        "_"
        if char in '/\\:"' or unicodedata.category(char) == "Cc" or ord(char) > 126
        else char
        for char in text_value
    ).strip()
    if not safe or safe in {".", ".."} or ".." in safe:
        safe = "attachment"
    return safe[:200]


def _metadata(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise TypeError("attachment metadata is invalid")
    return {key: value[key] for key in _METADATA_FIELDS if key in value}


def _decode_content(value: str) -> bytes:
    try:
        content = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=422, detail="content_base64 is invalid") from exc
    if len(content) > _MAX_ATTACHMENT_BYTES:
        raise HTTPException(status_code=422, detail="attachment must be at most 10 MiB")
    return content


@router.post("/archives/{kind}/{entity_id}/preview")
async def preview_archive(
    kind: Kind, entity_id: UUID, repo: Repo, actor: Actor,
) -> Any:
    try:
        archive = await _call(repo.archive_entity, kind, str(entity_id))
        _, preview = _inspect_archive(archive)
        return preview
    except HTTPException:
        raise
    except (ValueError, TypeError, OSError) as exc:
        raise HTTPException(status_code=422, detail="parks archive is invalid") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503, detail="parks storage unavailable"
        ) from exc


@router.post("/archives/{kind}/{entity_id}/records")
async def create_records_archive(
    kind: Kind, entity_id: UUID, payload: RecordsRequest, request: Request,
    actor: Actor, repo: Repo, session: Db, proof: ProofHeader,
) -> Any:
    try:
        enabled = getattr(request.app.state, "desktop_enabled_modules", None) or ()
        if "townlight_records" not in enabled:
            raise HTTPException(status_code=503, detail="records module unavailable")
        profile_root = getattr(request.app.state, "desktop_profile_root", None)
        if not isinstance(profile_root, Path):
            raise HTTPException(status_code=503, detail="profile unavailable")
        records_actor = await mapped_native_actor(
            request, session, proof, "townlight_records"
        )
        if _actor_id(records_actor) != _actor_id(actor):
            raise HTTPException(status_code=403, detail="records identity mismatch")
        archive = await _call(repo.archive_entity, kind, str(entity_id))
        content, meta = _inspect_archive(archive)
        if (
            meta["current_revision"] != payload.expected_revision
            or meta["sha256"] != payload.expected_sha256
        ):
            raise HTTPException(status_code=409, detail="revision changed")
        staged = await run_in_threadpool(
            stage_archive, profile_root, entity_id, meta["sha256"], content,
            namespace="parks",
        )
        return await persist_archive(
            session, actor, request.state.native_role, profile_root,
            entity_id, meta["current_revision"], meta["sha256"], content,
            staged, source=f"parks-{kind}",
        )
    except HTTPException:
        raise
    except (ValueError, TypeError, OSError) as exc:
        raise HTTPException(status_code=422, detail="parks archive is invalid") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503, detail="parks storage unavailable"
        ) from exc


@router.post("/attachments/{kind}/{entity_id}")
async def add_attachment(
    kind: Kind, entity_id: UUID, payload: AttachmentRequest,
    actor: Actor, repo: Repo,
) -> Any:
    content = _decode_content(payload.content_base64)
    attachment_id = await _call(
        repo.attachment_add, kind, str(entity_id), _actor_id(actor),
        payload.name, payload.media_type, content,
    )
    try:
        return _metadata(await _call(repo.attachment_get, attachment_id))
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422, detail="attachment metadata is invalid"
        ) from exc


@router.get("/attachments/{attachment_id}/content")
async def attachment_content(
    attachment_id: UUID, actor: Actor, repo: Repo,
) -> Response:
    try:
        fetched = await _call(repo.attachment_get, str(attachment_id))
        if not isinstance(fetched, dict):
            raise TypeError("attachment is invalid")
        content = fetched.get("content")
        if not isinstance(content, (bytes, bytearray, memoryview)):
            raise TypeError("attachment is invalid")
        content = bytes(content)
        if (
            len(content) != fetched.get("size")
            or hashlib.sha256(content).hexdigest() != fetched.get("sha256")
        ):
            raise HTTPException(
                status_code=409, detail="attachment content failed integrity check"
            )
        media_type = fetched.get("media_type")
        if not isinstance(media_type, str) or not media_type:
            media_type = "application/octet-stream"
        name = _safe_name(fetched.get("name"))
        return Response(
            content=content,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{name}"',
                "X-Content-Type-Options": "nosniff",
                "X-Content-SHA256": hashlib.sha256(content).hexdigest(),
                "Cache-Control": "no-store",
            },
        )
    except HTTPException:
        raise
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422, detail="attachment is invalid"
        ) from exc


@router.get("/attachments/{kind}/{entity_id}")
async def list_attachments(
    kind: Kind, entity_id: UUID, actor: Actor, repo: Repo,
) -> Any:
    try:
        listed = await _call(repo.attachment_list, kind, str(entity_id))
        if not isinstance(listed, dict) or not isinstance(listed.get("items"), list):
            raise TypeError("attachment list is invalid")
        return {
            "items": [_metadata(item) for item in listed["items"]],
            "overflow": bool(listed.get("overflow")),
        }
    except (ValueError, TypeError) as exc:
        raise HTTPException(
            status_code=422, detail="attachment list is invalid"
        ) from exc


@router.get("/reports/aggregate")
async def get_aggregate_report(actor: Actor, repo: Repo) -> Any:
    return await _call(repo.aggregate_report)
