from datetime import UTC, datetime
from uuid import UUID

from fastapi import Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select, update
from starlette.concurrency import run_in_threadpool

from .budget_staff import router, _readback, budget_revisions
from .budget_hearing import canonical_budget_text, verify_budget_packet
from .budget_vote import verify_recorded_motion
from .municipal_staff import Db, audit
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.models.user import User

DIGEST = r"^[0-9a-f]{64}$"


class AdoptBudget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_sha256: str = Field(pattern=DIGEST)
    packet_manifest_sha256: str = Field(pattern=DIGEST)
    meeting_id: UUID
    agenda_id: UUID
    packet_id: UUID
    packet_approval_id: UUID
    motion_id: UUID
    carried: StrictBool
    public_summary: str = Field(min_length=1, max_length=4000, pattern=r"\S")


async def clerk_actor(
    request: Request,
    session: Db,
    proof: str | None = Header(None, alias="X-Townlight-Session"),
) -> User:
    actor = await mapped_native_actor(request, session, proof, "townlight_meetings")
    if (
        getattr(request.state, "native_role", None) not in ("local-admin", "clerk")
        or "townlight_budget"
        not in getattr(request.app.state, "desktop_enabled_modules", ())
    ):
        raise HTTPException(403, "forbidden")
    return actor


@router.post("/{revision_id}/adopt")
async def adopt_budget(
    revision_id: UUID,
    body: AdoptBudget,
    session: Db,
    actor: User = Depends(clerk_actor),
):
    if not body.carried:
        raise HTTPException(409, "carried must be true")

    stmt = (
        select(budget_revisions)
        .where(budget_revisions.c.id == revision_id)
        .with_for_update()
    )
    row = (await session.execute(stmt)).mappings().one_or_none()
    if row is None:
        raise HTTPException(404, "revision not found")
    if row["adopted_at"] is not None:
        raise HTTPException(409, "revision already adopted")

    if row["finance_reviewed_at"] is None:
        raise HTTPException(409, "revision not finance reviewed")
    if body.content_sha256 != row["content_sha256"]:
        raise HTTPException(409, "content hash mismatch")

    digest = row["content_sha256"]

    try:
        canonical_budget_text(row)
        await run_in_threadpool(
            verify_budget_packet,
            body.packet_id,
            body.packet_approval_id,
            body.packet_manifest_sha256,
            body.meeting_id,
            body.agenda_id,
            digest,
        )
        vote_ids = await run_in_threadpool(
            verify_recorded_motion,
            body.motion_id,
            body.meeting_id,
            body.agenda_id,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc

    await session.execute(
        update(budget_revisions)
        .where(budget_revisions.c.id == revision_id)
        .values(
            hearing_meeting_id=body.meeting_id,
            hearing_agenda_id=body.agenda_id,
            packet_id=body.packet_id,
            packet_approval_id=body.packet_approval_id,
            packet_manifest_sha256=body.packet_manifest_sha256,
            adopted_at=datetime.now(UTC),
            adopted_by=actor.id,
            recorded_motion_id=body.motion_id,
            recorded_vote_ids=vote_ids,
            reviewed_public_summary=body.public_summary,
        )
    )
    await audit(session, actor, "adopt-budget", "budget_revision", revision_id)
    return await _readback(session, revision_id)
