from __future__ import annotations

import base64
import hashlib
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from townlight_311.interchange import Interchange

from townlight_runtime.service_requests import (
    Actor,
    Repository,
    audit_actor,
    call_repository,
)

router = APIRouter(prefix="/desktop/v1/service-requests", tags=["service-requests"])

MAX_IMPORT_BYTES = 2 * 1024 * 1024
MAX_EXPORT_BYTES = 10 * 1024 * 1024


class _StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ImportPayload(_StrictModel):
    format: Literal["csv", "json"]
    content: str = Field(max_length=2097152)
    source_key: str = Field(min_length=1, max_length=128)
    expected_sha256: str | None = Field(default=None, pattern=r"^[0-9a-f]{64}$")
    confirm: StrictBool = False


class ExportPayload(_StrictModel):
    format: Literal["csv", "json"]
    department: str | None = Field(default=None, max_length=255)
    state: str | None = Field(default=None, max_length=255)
    include_contact: StrictBool = False


def _interchange(repository: Repository) -> Interchange:
    return Interchange(repository, import_key=repository.recovery_key)


def _import_bytes(payload: ImportPayload) -> bytes:
    raw = payload.content.encode("utf-8")
    if len(raw) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="Import content exceeds 2 MiB")
    return raw


def _sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


@router.post("/import-preview")
async def import_preview(
    payload: ImportPayload,
    repository: Repository,
    actor: Actor,
):
    raw = _import_bytes(payload)
    interchange = _interchange(repository)
    preview = await call_repository(interchange.preview, raw, payload.format)
    digest = _sha256_hex(raw)
    if isinstance(preview, dict):
        return {**preview, "sha256": digest}
    return {"preview": preview, "sha256": digest}


@router.post("/import")
async def import_service_requests(
    payload: ImportPayload,
    repository: Repository,
    actor: Actor,
):
    raw = _import_bytes(payload)
    digest = _sha256_hex(raw)

    if not payload.confirm:
        raise HTTPException(status_code=409, detail="Import confirmation is required")

    if payload.expected_sha256 is None:
        raise HTTPException(status_code=422, detail="expected_sha256 is required")

    if payload.expected_sha256 != digest:
        raise HTTPException(status_code=422, detail="expected_sha256 does not match content")

    interchange = _interchange(repository)
    return await call_repository(
        interchange.commit,
        raw,
        payload.format,
        payload.source_key,
        actor=audit_actor(actor),
    )


@router.post("/export")
async def export_service_requests(
    payload: ExportPayload,
    repository: Repository,
    actor: Actor,
):
    interchange = _interchange(repository)
    data = await call_repository(
        interchange.export,
        payload.format,
        payload.department,
        payload.state,
        include_contact=payload.include_contact,
    )

    if not isinstance(data, (bytes, bytearray)):
        raise HTTPException(status_code=500, detail="Export returned invalid content")

    data = bytes(data)
    if len(data) > MAX_EXPORT_BYTES:
        raise HTTPException(status_code=413, detail="Export content exceeds 10 MiB")

    return {
        "content_base64": base64.b64encode(data).decode("ascii"),
        "sha256": _sha256_hex(data),
        "size": len(data),
        "format": payload.format,
    }