from __future__ import annotations

from dataclasses import asdict
from datetime import date, datetime, timezone
from typing import Annotated, Any, Final, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import insert, select, update
from townlight_grants.application_draft import draft_application_outline
from townlight_grants.eligibility import match_grant_eligibility
from townlight_budget.adoption import budget_revisions
from townlight_contracts.staff_workflow import agreements
from townlight_grants.compliance_calendar import build_compliance_calendar
from townlight_grants.grant_cases import build_archive, grants_cases, verified_archive
from townlight_records.models.request import RecordsRequest
from townlight_grants.opportunity_triage import triage_opportunity
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.models.user import User

from .municipal_staff import Db, audit, rows
from .native_accounts import accounts

GRANTS_PREFIX: Final = "/desktop/v1/municipal-staff/grants"
GRANTS_MODULE: Final = "townlight_grants"
GRANT_CASE_STAGES: Final = ("draft", "reviewed", "awarded", "closed")
GRANTS_ASSIGNABLE_NATIVE_ROLES: Final = frozenset({"city-staff", "local-admin"})

router = APIRouter(prefix=GRANTS_PREFIX)


class GrantCaseCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=255)
    funding_area: str = Field(min_length=1, max_length=128)
    deadline: date
    project_name: str = Field(min_length=1, max_length=255)
    city_need: str = Field(min_length=1, max_length=4000)
    budget_revision_id: UUID | None = None
    contract_id: UUID | None = None
    records_request_id: UUID | None = None


class GrantCaseAssign(BaseModel):
    model_config = ConfigDict(extra="forbid")

    user_id: UUID


async def grants_actor(
    request: Request,
    session: Db,
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
) -> User:
    return await mapped_native_actor(request, session, proof, GRANTS_MODULE)


GrantsActor = Annotated[User, Depends(grants_actor)]


def case_action_entry(
    actor: User,
    action: str,
    details: dict[str, Any] | None = None,
    *,
    at: datetime | None = None,
) -> dict[str, Any]:
    return {
        "action": action,
        "actor_id": str(actor.id),
        "at": (at or datetime.now(timezone.utc)).isoformat(),
        "details": details or {},
    }


async def locked_grant_case(session: Db, case_id: UUID) -> dict[str, Any]:
    statement = (
        select(*grants_cases.c)
        .where(grants_cases.c.id == case_id)
        .with_for_update()
    )
    row = (await session.execute(statement)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="grant case not found")
    return dict(row)


async def grant_case_readback(session: Db, case_id: UUID) -> dict[str, Any]:
    statement = select(*grants_cases.c).where(grants_cases.c.id == case_id)
    row = (await session.execute(statement)).mappings().one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="grant case not found")
    item = dict(row)
    item.pop("archived_manifest", None)
    return item


async def persist_case_action(
    session: Db,
    case: dict[str, Any],
    actor: User,
    action: str,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    workpapers = dict(case.get("workpapers") or {})
    actions = list(workpapers.get("actions") or ())
    actions.append(case_action_entry(actor, action, details, at=now))
    workpapers["actions"] = actions

    statement = (
        update(grants_cases)
        .where(grants_cases.c.id == case["id"])
        .values(
            workpapers=workpapers,
            last_actor=actor.id,
            updated_at=now,
        )
    )
    await session.execute(statement)

    case["workpapers"] = workpapers
    case["last_actor"] = actor.id
    case["updated_at"] = now
    return case


@router.get("")
async def list_grant_cases(session: Db, actor: GrantsActor):
    statement = (
        select(*grants_cases.c)
        .order_by(grants_cases.c.updated_at.desc())
        .limit(100)
    )
    items = await rows(session, statement)
    for item in items:
        item.pop("archived_manifest", None)
    return items


@router.get("/assignees")
async def list_grant_assignees(session: Db, actor: GrantsActor):
    statement = (
        select(User.id, User.full_name)
        .join(accounts, accounts.c.user_id == User.id)
        .where(
            User.is_active.is_(True),
            User.is_verified.is_(True),
            accounts.c.native_role.in_(GRANTS_ASSIGNABLE_NATIVE_ROLES),
        )
        .order_by(User.full_name)
    )
    return await rows(session, statement)


@router.get("/{case_id}")
async def get_grant_case(case_id: UUID, session: Db, actor: GrantsActor):
    return await grant_case_readback(session, case_id)


@router.post("", status_code=201)
async def create_grant_case(
    payload: GrantCaseCreate,
    session: Db,
    actor: GrantsActor,
):
    case_id = uuid4()
    now = datetime.now(timezone.utc)

    triage = triage_opportunity(
        opportunity_title=payload.title,
        funding_area=payload.funding_area,
        deadline=payload.deadline.isoformat(),
    )
    eligibility = match_grant_eligibility(
        city_profile=payload.city_need,
        opportunity_title=payload.title,
        funding_area=payload.funding_area,
    )
    outline = draft_application_outline(
        project_name=payload.project_name,
        opportunity_title=payload.title,
        city_need=payload.city_need,
    )

    workpapers = {
        "project_name": payload.project_name,
        "city_need": payload.city_need,
        "triage": asdict(triage),
        "eligibility": asdict(eligibility),
        "outline": asdict(outline),
        "actions": [
            case_action_entry(
                actor,
                "created",
                {
                    "budget_revision_id": (
                        str(payload.budget_revision_id)
                        if payload.budget_revision_id
                        else None
                    ),
                    "contract_id": (
                        str(payload.contract_id) if payload.contract_id else None
                    ),
                    "records_request_id": (
                        str(payload.records_request_id)
                        if payload.records_request_id
                        else None
                    ),
                },
                at=now,
            )
        ],
    }

    values = {
        "id": case_id,
        "assigned_to": None,
        "last_actor": actor.id,
        "budget_revision_id": payload.budget_revision_id,
        "contract_id": payload.contract_id,
        "records_request_id": payload.records_request_id,
        "title": payload.title,
        "funding_area": payload.funding_area,
        "deadline": payload.deadline,
        "workpapers": workpapers,
        "stage": "draft",
        "created_at": now,
        "updated_at": now,
    }

    await validate_links(session, values, required=False)

    await session.execute(insert(grants_cases).values(**values))
    await session.flush()
    await audit(session, actor, "grants.case.create", "grant_case", case_id)
    return await grant_case_readback(session, case_id)


@router.post("/{case_id}/assign")
async def assign_grant_case(
    case_id: UUID,
    payload: GrantCaseAssign,
    session: Db,
    actor: GrantsActor,
):
    case = await locked_grant_case(session, case_id)
    if case["stage"] != "draft":
        raise HTTPException(
            status_code=409,
            detail="assignment can only change while grant case is draft",
        )

    assignee = await session.scalar(
        select(User)
        .join(accounts, accounts.c.user_id == User.id)
        .where(
            User.id == payload.user_id,
            User.is_active.is_(True),
            User.is_verified.is_(True),
            accounts.c.native_role.in_(GRANTS_ASSIGNABLE_NATIVE_ROLES),
        )
    )
    if assignee is None:
        raise HTTPException(status_code=404, detail="assignee not found")

    await session.execute(
        update(grants_cases)
        .where(grants_cases.c.id == case_id)
        .values(assigned_to=assignee.id)
    )
    case["assigned_to"] = assignee.id
    await persist_case_action(
        session,
        case,
        actor,
        "assigned",
        {"assigned_to": str(assignee.id)},
    )
    await audit(session, actor, "grants.case.assign", "grant_case", case_id)
    return await grant_case_readback(session, case_id)


async def transition_grant_case(
    session: Db,
    case: dict[str, Any],
    actor: User,
    *,
    stage: str,
    action: str,
    fields: dict[str, Any] | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if stage not in GRANT_CASE_STAGES:
        raise HTTPException(status_code=422, detail="invalid grant case stage")

    now = datetime.now(timezone.utc)
    values: dict[str, Any] = {
        "stage": stage,
        "last_actor": actor.id,
        "updated_at": now,
    }
    if fields:
        values.update(fields)

    statement = (
        update(grants_cases)
        .where(grants_cases.c.id == case["id"])
        .values(**values)
    )
    await session.execute(statement)
    case.update(values)
    case = await persist_case_action(session, case, actor, action, details)
    await audit(session, actor, f"grants.case.{action}", "grant_case", case["id"])
    return case


class GrantCaseReview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(min_length=1, max_length=4000)


class GrantCaseAward(BaseModel):
    model_config = ConfigDict(extra="forbid")

    award_reference: str = Field(min_length=1, max_length=128)
    award_amount_cents: int = Field(ge=0, le=2**53 - 1)
    report_due: date
    reporting_frequency: Literal["monthly", "quarterly", "annual"]


class GrantCaseReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    note: str = Field(min_length=1, max_length=4000)

@router.post("/{case_id}/review")
async def review_grant_case(
    case_id: UUID,
    payload: GrantCaseReview,
    session: Db,
    actor: GrantsActor,
) -> dict[str, Any]:
    case = await locked_grant_case(session, case_id)
    if case["stage"] != "draft":
        raise HTTPException(status_code=409, detail="grant case is not in draft")
    if case.get("assigned_to") is None:
        raise HTTPException(status_code=409, detail="grant case must be assigned")

    await validate_links(session, case)
    await transition_grant_case(
        session,
        case,
        actor,
        stage="reviewed",
        action="review",
        details={"note": payload.note},
    )
    return await grant_case_readback(session, case_id)


@router.post("/{case_id}/award")
async def award_grant_case(
    case_id: UUID,
    payload: GrantCaseAward,
    session: Db,
    actor: GrantsActor,
) -> dict[str, Any]:
    case = await locked_grant_case(session, case_id)
    if case["stage"] != "reviewed":
        raise HTTPException(status_code=409, detail="grant case is not reviewed")

    await validate_links(session, case)
    await transition_grant_case(
        session,
        case,
        actor,
        stage="awarded",
        action="award",
        details=asdict(build_compliance_calendar(
            award_name=payload.award_reference, reporting_frequency=payload.reporting_frequency,
        )),
        fields={
            "award_reference": payload.award_reference,
            "award_amount_cents": payload.award_amount_cents,
            "report_due": payload.report_due,
        },
    )
    return await grant_case_readback(session, case_id)


@router.post("/{case_id}/report")
async def report_grant_case(
    case_id: UUID,
    payload: GrantCaseReport,
    session: Db,
    actor: GrantsActor,
) -> dict[str, Any]:
    case = await locked_grant_case(session, case_id)
    if case["stage"] != "awarded":
        raise HTTPException(status_code=409, detail="grant case is not awarded")

    if case["report_completed_at"] is not None:
        raise HTTPException(status_code=409, detail="grant case report already submitted")

    await validate_links(session, case)
    await transition_grant_case(
        session,
        case,
        actor,
        stage="awarded",
        action="report",
        fields={"report_completed_at": datetime.now(timezone.utc)},
        details={"note": payload.note},
    )
    return await grant_case_readback(session, case_id)


async def validate_links(
    session: Db, case: dict[str, Any], *, required: bool = True
) -> dict[str, Any]:
    queries = {
        "budget_revision_id": select(
            budget_revisions.c.id, budget_revisions.c.fiscal_year,
            budget_revisions.c.content_sha256, budget_revisions.c.adopted_at,
        ).where(budget_revisions.c.id == case.get("budget_revision_id"),
                budget_revisions.c.adopted_at.is_not(None)),
        "contract_id": select(agreements.c.id, agreements.c.status).where(
            agreements.c.id == case.get("contract_id"), agreements.c.status == "signed",
        ),
        "records_request_id": select(RecordsRequest.id).where(
            RecordsRequest.id == case.get("records_request_id"),
        ),
    }
    evidence: dict[str, Any] = {}
    for field, statement in queries.items():
        if case.get(field) is None and not required:
            continue
        row = (await session.execute(statement)).mappings().one_or_none()
        if row is None:
            raise HTTPException(422, f"{field} must refer to an eligible Townlight record")
        evidence[field] = dict(row)
    return evidence


@router.post("/{case_id}/closeout")
async def closeout_grant_case(case_id: UUID, session: Db, actor: GrantsActor):
    case = await locked_grant_case(session, case_id)
    if case["stage"] != "awarded" or case["report_completed_at"] is None:
        raise HTTPException(409, "Complete the award report before closeout.")
    evidence = await validate_links(session, case)
    case = await persist_case_action(session, case, actor, "closeout")
    case["stage"] = "closed"
    manifest, digest = build_archive(case, evidence)
    await session.execute(
        update(grants_cases).where(grants_cases.c.id == case_id).values(
            stage="closed", archived_manifest=manifest.decode("utf-8"), archived_sha256=digest,
        )
    )
    await audit(session, actor, "grants.case.closeout", "grant_case", case_id)
    return await grant_case_readback(session, case_id)


@router.get("/{case_id}/archive")
async def get_grant_case_archive(case_id: UUID, session: Db, actor: GrantsActor):
    row = (await session.execute(
        select(grants_cases.c.stage, grants_cases.c.archived_manifest, grants_cases.c.archived_sha256)
        .where(grants_cases.c.id == case_id)
    )).mappings().one_or_none()
    if row is None:
        raise HTTPException(404, "Grant case was not found.")
    if row["stage"] != "closed":
        raise HTTPException(409, "Close out the grant before downloading its archive.")
    try:
        manifest = verified_archive(row).decode("utf-8")
    except ValueError as exc:
        raise HTTPException(409, "Stored grant archive did not pass verification.") from exc
    return {"manifest": manifest, "sha256": row["archived_sha256"]}
