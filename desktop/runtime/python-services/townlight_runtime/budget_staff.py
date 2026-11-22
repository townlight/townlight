from __future__ import annotations

import re
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select

from civicbudget.adoption import budget_revisions, revision_content
from civicbudget.budget_import import parse_budget_csv
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.models.user import User

from .municipal_staff import Db, audit, rows

router = APIRouter(prefix="/desktop/v1/municipal-staff/budget")

_DIGEST_RE = re.compile(r"[0-9a-f]{64}")


class ImportPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fiscal_year: int = Field(ge=1900, le=2200)
    csv_text: str = Field(min_length=1, max_length=1_048_576)


class ReviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_sha256: str = Field(min_length=64, max_length=64)
    confirmed: StrictBool


async def budget_actor(
    request: Request,
    session: Db,
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
) -> User:
    return await mapped_native_actor(request, session, proof, "townlight_budget")


ActorDep = Annotated[User, Depends(budget_actor)]


async def _readback(session: Db, revision_id: UUID) -> dict[str, Any]:
    statement = select(*budget_revisions.c).where(budget_revisions.c.id == revision_id)
    row = (await session.execute(statement)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="revision not found")
    return dict(row)


async def budget_reader(
    request: Request,
    session: Db,
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
) -> User:
    if "townlight_budget" not in request.app.state.desktop_enabled_modules:
        raise HTTPException(status_code=403, detail="Townlight budget module is not enabled")
    return await mapped_native_actor(request, session, proof, "townlight_meetings")


BudgetReader = Annotated[User, Depends(budget_reader)]


@router.get("")
async def list_revisions(session: Db, actor: BudgetReader):
    statement = (
        select(*budget_revisions.c)
        .order_by(budget_revisions.c.imported_at.desc())
        .limit(40)
    )
    items = await rows(session, statement)
    for item in items:
        item.pop("lines", None)
    return items


@router.get("/{revision_id}")
async def get_revision(revision_id: UUID, session: Db, actor: BudgetReader):
    return await _readback(session, revision_id)


@router.post("/import")
async def import_revision(payload: ImportPayload, session: Db, actor: ActorDep):
    parsed = parse_budget_csv(payload.csv_text)
    if parsed.errors or not parsed.lines:
        return {"errors": [asdict(error) for error in parsed.errors]}

    canonical, digest = revision_content(payload.fiscal_year, parsed)
    revision_id = uuid4()
    imported_at = datetime.now(timezone.utc)

    await session.execute(
        budget_revisions.insert().values(
            **canonical,
            id=revision_id,
            content_sha256=digest,
            imported_by=actor.id,
            imported_at=imported_at,
        )
    )
    await audit(session, actor, "import", "budget_revision", revision_id)
    return await _readback(session, revision_id)


@router.post("/{revision_id}/review")
async def review_revision(
    revision_id: UUID,
    payload: ReviewPayload,
    session: Db,
    actor: ActorDep,
):
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="confirmation required")

    if _DIGEST_RE.fullmatch(payload.content_sha256) is None:
        raise HTTPException(
            status_code=422,
            detail="content_sha256 must be 64 lowercase hexadecimal characters",
        )

    statement = (
        select(
            budget_revisions.c.content_sha256,
            budget_revisions.c.finance_reviewed_at,
        )
        .where(budget_revisions.c.id == revision_id)
        .with_for_update()
    )
    row = (await session.execute(statement)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="revision not found")

    row = dict(row)
    if payload.content_sha256 != row["content_sha256"]:
        raise HTTPException(status_code=409, detail="content_sha256 mismatch")

    if row["finance_reviewed_at"] is None:
        reviewed_at = datetime.now(timezone.utc)
        await session.execute(
            budget_revisions.update()
            .where(budget_revisions.c.id == revision_id)
            .values(
                finance_reviewed_at=reviewed_at,
                finance_reviewed_by=actor.id,
            )
        )
        await audit(session, actor, "review", "budget_revision", revision_id)

    return await _readback(session, revision_id)
