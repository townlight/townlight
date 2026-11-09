"""Native staff operations for the three municipal workspaces."""
from base64 import b64encode
from datetime import UTC, date, datetime
from hashlib import sha256
from typing import Annotated
from uuid import UUID, uuid4

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from townlight_boards.board_registry import register_board_stub
from townlight_boards.persistence import board_roster_records
from townlight_boards.staff_workflow import AttendanceInput, BoardInput, SeatInput, attendance, seat_status, seats
from townlight_contracts.staff_workflow import SignedAgreement, agreements
from townlight_procurement.award_packet import build_award_packet_checklist
from townlight_procurement.exception_extract import extract_proposal_exceptions
from townlight_procurement.persistence import rfp_draft_records
from townlight_procurement.rfp_draft import draft_rfp_outline
from townlight_procurement.staff_workflow import AwardInput, ProposalInput, RfpInput, awards, proposals
from townlight_records.audit.logger import write_audit_log
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

router = APIRouter(prefix="/desktop/v1/municipal-staff", tags=["native-municipal-staff"])
Db = Annotated[AsyncSession, Depends(get_async_session)]

_MODULES = {
    "boards": ("townlight_boards", "townlight_meetings"),
    "contracts": ("townlight_contracts", "townlight_contracts"),
    "procurement": ("townlight_procurement", "townlight_procurement"),
}
_meetings = sa.table("meetings", sa.column("id", sa.Uuid), sa.column("title"), schema="townlight_meetings")
_agreement_fields = tuple(column for column in agreements.c if column is not agreements.c.document_content)


def ensure_schema(engine):
    with engine.begin() as connection:
        for table in (board_roster_records, agreements, rfp_draft_records):
            connection.execute(sa.schema.CreateSchema(table.schema, if_not_exists=True))
            table.metadata.create_all(connection)


def staff_actor(module: str, *, award_only: bool = False):
    async def authorize(
        request: Request,
        session: Db,
        proof: str | None = Header(default=None, alias="X-Townlight-Session"),
    ) -> User:
        enabled, grant = _MODULES[module]
        if enabled not in request.app.state.desktop_enabled_modules:
            raise HTTPException(403, "This capability is unavailable in the current profile.")
        user = await mapped_native_actor(request, session, proof, grant)
        if award_only and request.state.native_role != "local-admin":
            raise HTTPException(403, "A Townlight administrator must record the award decision.")
        return user
    return authorize


BoardActor = Annotated[User, Depends(staff_actor("boards"))]
ContractActor = Annotated[User, Depends(staff_actor("contracts"))]
ProcurementActor = Annotated[User, Depends(staff_actor("procurement"))]
AwardActor = Annotated[User, Depends(staff_actor("procurement", award_only=True))]


async def rows(session, statement):
    return [dict(row) for row in (await session.execute(statement)).mappings()]


async def require_row(session, statement, label):
    result = (await session.execute(statement)).mappings().one_or_none()
    if result is None:
        raise HTTPException(404, f"{label} was not found.")
    return result


async def audit(session, actor, action, resource, identity):
    await write_audit_log(
        session=session, action=action, resource_type=resource, resource_id=str(identity),
        user_id=actor.id, details={}, commit=False,
    )
    await session.commit()


@router.get("/boards")
async def list_boards(session: Db, actor: BoardActor):
    boards = await rows(session, sa.select(board_roster_records).order_by(board_roster_records.c.board_name))
    members = await rows(session, sa.select(seats).order_by(seats.c.seat_name))
    for member in members:
        member["status"] = seat_status(member["member_name"], member["term_end"], date.today())
    meeting_list = await rows(session, sa.select(_meetings).order_by(_meetings.c.title))
    history = await rows(session, sa.select(attendance))
    return {"boards": boards, "seats": members, "meetings": meeting_list, "attendance": history}


@router.post("/boards", status_code=201)
async def create_board(data: BoardInput, session: Db, actor: BoardActor):
    identity = str(uuid4())
    board = register_board_stub(board_id=identity, board_name=data.board_name, liaison=data.liaison)
    now = datetime.now(UTC)
    await session.execute(board_roster_records.insert().values(
        board_id=identity, board_name=board.board_name, liaison=board.liaison,
        roster_notes=list(board.roster_notes), disclaimer=board.disclaimer, created_at=now, updated_at=now,
    ))
    await audit(session, actor, "create-board", "board", identity)
    return {"id": identity}


@router.post("/boards/seat")
async def save_seat(data: SeatInput, session: Db, actor: BoardActor):
    await require_row(session, sa.select(board_roster_records.c.board_id).where(
        board_roster_records.c.board_id == str(data.board_id)), "Board")
    values = data.model_dump()
    values["board_id"] = str(data.board_id)
    write = insert(seats).values(id=uuid4(), **values)
    statement = write.on_conflict_do_update(
        index_elements=[seats.c.board_id, seats.c.seat_name],
        set_={key: write.excluded[key] for key in ("member_name", "term_start", "term_end")},
    ).returning(seats.c.id)
    identity = await session.scalar(statement)
    await audit(session, actor, "record-seat", "board-seat", identity)
    return {"id": identity}


@router.post("/boards/attendance")
async def save_attendance(data: AttendanceInput, session: Db, actor: BoardActor):
    member = await require_row(session, sa.select(seats).where(seats.c.id == data.seat_id).with_for_update(), "Seat")
    if not member["member_name"]:
        raise HTTPException(409, "Record a member for this seat first.")
    await require_row(session, sa.select(_meetings.c.id).where(_meetings.c.id == data.meeting_id), "Meeting")
    write = insert(attendance).values(**data.model_dump(), member_name=member["member_name"])
    saved = await session.scalar(write.on_conflict_do_update(
        index_elements=[attendance.c.seat_id, attendance.c.meeting_id],
        set_={"present": write.excluded.present},
        where=attendance.c.member_name == member["member_name"],
    ).returning(attendance.c.seat_id))
    if saved is None:
        raise HTTPException(409, "The meeting already has attendance for a different member of this seat.")
    await audit(session, actor, "record-attendance", "board-seat", data.seat_id)
    return {"id": data.seat_id}


@router.get("/contracts")
async def list_contracts(session: Db, actor: ContractActor):
    return await rows(session, sa.select(*_agreement_fields).order_by(agreements.c.renewal_due, agreements.c.title))


@router.post("/contracts", status_code=201)
async def register_contract(data: SignedAgreement, session: Db, actor: ContractActor):
    identity = uuid4()
    await session.execute(agreements.insert().values(id=identity, status="signed", document_content=data.document_content,
        **data.model_dump(exclude={"document_content"})))
    await audit(session, actor, "register-signed-contract", "contract", identity)
    return {"id": identity}


@router.post("/contracts/{identity}/signed")
async def record_signed(identity: UUID, data: SignedAgreement, session: Db, actor: ContractActor):
    record = await require_row(session, sa.select(*_agreement_fields).where(
        agreements.c.id == identity).with_for_update(), "Contract")
    if record["status"] != "draft":
        raise HTTPException(409, "The agreement is already recorded as signed.")
    if record["procurement_id"] and data.vendor_name != record["vendor_name"]:
        raise HTTPException(409, "The signed agreement vendor must match the recorded award.")
    await session.execute(agreements.update().where(agreements.c.id == identity).values(
        status="signed", document_content=data.document_content,
        **data.model_dump(exclude={"document_content"})))
    await audit(session, actor, "register-signed-contract", "contract", identity)
    return {"id": identity}


@router.get("/contracts/{identity}/document")
async def retrieve_contract(identity: UUID, session: Db, actor: ContractActor):
    record = await require_row(session, sa.select(agreements.c.document_name, agreements.c.document_content).where(
        agreements.c.id == identity, agreements.c.status == "signed"), "Signed agreement")
    content = record["document_content"]
    return {"name": record["document_name"], "content": b64encode(content).decode(), "sha256": sha256(content).hexdigest()}


@router.get("/procurement")
async def list_procurement(session: Db, actor: ProcurementActor):
    drafts = await rows(session, sa.select(rfp_draft_records).order_by(rfp_draft_records.c.created_at.desc()))
    proposal_rows = await rows(session, sa.select(proposals).order_by(proposals.c.vendor_name))
    for proposal in proposal_rows:
        proposal["advisory_flags"] = extract_proposal_exceptions(
            vendor_name=proposal["vendor_name"], proposal_text=proposal["summary"]).flags
    award_rows = await rows(session, sa.select(awards))
    links = await rows(session, sa.select(agreements.c.id, agreements.c.procurement_id).where(
        agreements.c.procurement_id.is_not(None)))
    return {"drafts": drafts, "proposals": proposal_rows, "awards": award_rows, "contracts": links}


@router.post("/procurement", status_code=201)
async def save_rfp(data: RfpInput, session: Db, actor: ProcurementActor):
    identity = str(uuid4())
    outline = draft_rfp_outline(
        procurement_title=data.title, procurement_type=data.procurement_type, city_need=data.city_need)
    await session.execute(rfp_draft_records.insert().values(
        draft_id=identity, procurement_title=outline.procurement_title, procurement_type=outline.procurement_type,
        recommended_owner=outline.recommended_owner, sections=list(outline.sections), disclaimer=outline.disclaimer,
        created_at=datetime.now(UTC),
    ))
    await audit(session, actor, "save-rfp-draft", "procurement", identity)
    return {"id": identity}


async def lock_solicitation(session, identity):
    return await require_row(session, sa.select(rfp_draft_records).where(
        rfp_draft_records.c.draft_id == str(identity)).with_for_update(), "Solicitation")


@router.post("/procurement/{identity}/proposal", status_code=201)
async def save_proposal(identity: UUID, data: ProposalInput, session: Db, actor: ProcurementActor):
    await lock_solicitation(session, identity)
    if await session.scalar(sa.select(awards.c.proposal_id).where(awards.c.solicitation_id == str(identity))):
        raise HTTPException(409, "The recorded award closed proposal entry.")
    proposal_id = uuid4()
    await session.execute(proposals.insert().values(id=proposal_id, solicitation_id=str(identity), **data.model_dump()))
    await audit(session, actor, "record-proposal", "procurement", identity)
    return {"id": proposal_id}


@router.post("/procurement/{identity}/award", status_code=201)
async def record_award(identity: UUID, data: AwardInput, session: Db, actor: AwardActor):
    draft = await lock_solicitation(session, identity)
    await require_row(session, sa.select(proposals.c.id).where(
        proposals.c.id == data.proposal_id, proposals.c.solicitation_id == str(identity)), "Proposal")
    if await session.scalar(sa.select(awards.c.proposal_id).where(awards.c.solicitation_id == str(identity))):
        raise HTTPException(409, "This solicitation already has a recorded award.")
    await session.execute(awards.insert().values(
        solicitation_id=str(identity), recorded_by=actor.id, recorded_at=datetime.now(UTC), **data.model_dump()))
    packet = build_award_packet_checklist(solicitation_id=str(identity), title=draft["procurement_title"])
    await audit(session, actor, "record-staff-award", "procurement", identity)
    return {"id": identity, "checklist": packet.checklist}


@router.post("/procurement/{identity}/contract")
async def create_draft_contract(identity: UUID, session: Db, actor: AwardActor, contract_actor: ContractActor):
    draft = await lock_solicitation(session, identity)
    recorded = await require_row(session, sa.select(proposals.c.vendor_name).select_from(
        awards.join(proposals, awards.c.proposal_id == proposals.c.id)
    ).where(awards.c.solicitation_id == str(identity)), "Recorded award")
    existing = await session.scalar(sa.select(agreements.c.id).where(agreements.c.procurement_id == identity))
    if existing is not None:
        return {"id": existing}
    contract_id = uuid4()
    await session.execute(agreements.insert().values(
        id=contract_id, title=draft["procurement_title"], vendor_name=recorded["vendor_name"],
        owner=draft["recommended_owner"], procurement_id=identity, status="draft",
    ))
    await audit(session, actor, "create-contract-draft", "contract", contract_id)
    return {"id": contract_id}
