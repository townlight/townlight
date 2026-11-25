"""Records archive endpoint for published communications articles."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from townlight_records.auth.native_identity import mapped_native_actor

from .communications_records_files import stage_archive
from .communications_records_store import persist_archive
from .communications_staff import Actor, Db, Repo, _actor_id, _call

router = APIRouter(prefix="/desktop/v1/communications", tags=["communications"])
ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]


class RecordsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(strict=True, gt=0)
    expected_sha256: str = Field(strict=True, pattern=r"^[0-9a-f]{64}$")
    confirm: Literal[True]


@router.post("/articles/{article_id}/records")
async def create_records_archive(
    article_id: UUID, payload: RecordsRequest, request: Request,
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
        current = await _call(repo.get, str(article_id))
        rev = current["current_revision"]
        sha = current["revision"]["sha256"]
        if (
            int(rev) != payload.expected_revision
            or str(sha) != payload.expected_sha256
        ):
            raise HTTPException(status_code=409, detail="revision changed")
        content = await _call(
            repo.build_records_archive, str(article_id),
            payload.expected_revision, payload.expected_sha256,
        )
        if not isinstance(content, (bytes, bytearray)):
            raise ValueError(  # noqa: TRY004 -- validation contract requires 422 mapping
                "archive builder did not return bytes"
            )
        content = bytes(content)
        digest = hashlib.sha256(content).hexdigest()
        staged = await run_in_threadpool(
            stage_archive, profile_root, article_id, digest, content
        )
        result = await persist_archive(
            session, actor, request.state.native_role, profile_root,
            article_id, payload.expected_revision, digest, content, staged,
        )
        await _call(
            repo.record_records_receipt,
            str(article_id),
            payload.expected_revision,
            digest,
            result["records_request_id"],
            result["attachment_id"],
        )
        return result
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="records request is invalid") from exc
    except OSError as exc:
        raise HTTPException(status_code=422, detail="records archive is unavailable") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503, detail="records storage unavailable"
        ) from exc
