"""Staff attachment routes for communications articles."""

from __future__ import annotations

import base64
import binascii
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, PositiveInt, StrictBool

from .communications_staff import Actor, Repo, _actor_id, _call

_MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024
_MAX_CONTENT_BASE64 = 13_981_016

router = APIRouter(prefix="/desktop/v1/communications", tags=["communications"])


class _StrictPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")


class AttachmentUpload(_StrictPayload):
    expected_revision: int = Field(strict=True, gt=0)
    name: str = Field(min_length=1, max_length=150)
    media_type: str = Field(max_length=128)
    content_base64: str = Field(max_length=_MAX_CONTENT_BASE64)
    public: StrictBool


class AttachmentRemove(_StrictPayload):
    expected_revision: int = Field(strict=True, gt=0)


def _decode_content(value: str) -> bytes:
    try:
        data = base64.b64decode(value, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=422, detail="content_base64 is invalid"
        ) from exc
    if not 1 <= len(data) <= _MAX_ATTACHMENT_SIZE:
        raise HTTPException(status_code=422, detail="content_base64 size is invalid")
    return data


@router.post("/articles/{article_id}/attachments")
async def add_attachment(
    article_id: UUID,
    payload: AttachmentUpload,
    actor: Actor,
    repo: Repo,
) -> object:
    content = _decode_content(payload.content_base64)
    return await _call(
        repo.add_attachment,
        str(article_id),
        payload.expected_revision,
        _actor_id(actor),
        payload.name,
        payload.media_type,
        content,
        public=payload.public,
    )


@router.post("/articles/{article_id}/attachments/{attachment_id}/remove")
async def remove_attachment(
    article_id: UUID,
    attachment_id: UUID,
    payload: AttachmentRemove,
    actor: Actor,
    repo: Repo,
) -> object:
    return await _call(
        repo.remove_attachment,
        str(article_id),
        payload.expected_revision,
        _actor_id(actor),
        str(attachment_id),
    )


@router.get("/articles/{article_id}/attachments/{attachment_id}")
async def read_attachment(
    article_id: UUID,
    attachment_id: UUID,
    actor: Actor,
    repo: Repo,
    revision: Annotated[PositiveInt | None, Query()] = None,
) -> dict[str, object]:
    _ = actor
    result = await _call(
        repo.read_attachment,
        str(article_id),
        str(attachment_id),
        revision,
    )
    content = result.get("content") if isinstance(result, dict) else None
    size = result.get("size") if isinstance(result, dict) else None
    if (
        not isinstance(content, bytes)
        or not 1 <= len(content) <= _MAX_ATTACHMENT_SIZE
        or size != len(content)
    ):
        raise HTTPException(status_code=409, detail="attachment unavailable")
    return {
        "content_base64": base64.b64encode(content).decode("ascii"),
        "name": result.get("name"),
        "media_type": result.get("media_type"),
        "sha256": result.get("sha256"),
        "size": size,
    }
