"""Native identity/transport adapter to the existing Meetings repositories.

Only explicitly integrated operations are exposed. No web-app mount with weaker authentication,
memory fallback, or parallel municipal implementation.
"""
import os
from uuid import UUID
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
from pydantic import BaseModel, ConfigDict, Field, AwareDatetime
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.native_identity import mapped_native_actor
from app.database import get_async_session
from civicclerk.agenda_lifecycle import AgendaItemRepository
from civicclerk.meeting_lifecycle import MeetingStore
from civicclerk.motion_vote import MotionVoteRepository
from civicclerk.minutes import MinutesDraftRepository, MinutesValidationError, MinutesSentence, SourceMaterial
from civicclerk.packet_notice import PacketStore
from civicclerk.packet_notice import evaluate_notice_compliance
from civicclerk.notice_checklist import NoticeChecklistRepository
from civicclerk.packet_assembly import PacketAssemblyRepository
from civicclerk.desktop_delivery import deliver_packet, deliver_notice, verify_source
from civicclerk.transcripts import TranscriptRepository
from civicclerk.public_archive import PublicArchiveRepository
from pathlib import Path

router = APIRouter(prefix="/desktop/v1/meetings", tags=["native-meetings"])
public_router = APIRouter(prefix="/public/meetings",tags=["public-meetings"])


def database_url():
    from civicsuite_runtime.services import _sync_database_url
    url = os.environ.get("DATABASE_URL", "")
    if not url.startswith(("postgresql", "postgres://")):
        raise HTTPException(503, "Meetings requires the configured PostgreSQL database.")
    return _sync_database_url(url)


def readiness():
    engine = None
    try:
        engine = create_engine(database_url(), pool_pre_ping=True, connect_args={"connect_timeout": 5})
        with engine.connect() as connection:
            for table in ("meetings", "agenda_items"):
                if connection.scalar(text("SELECT to_regclass(:name)"), {"name": f"civicclerk.{table}"}) is None:
                    return False
            # Query the required columns, not merely table names.
            connection.execute(text("SELECT id, title, meeting_type, audit_entries FROM civicclerk.meetings LIMIT 0"))
            connection.execute(text("SELECT id, title, department_name, meeting_id, audit_entries FROM civicclerk.agenda_items LIMIT 0"))
            connection.execute(text("SELECT id, decision_history FROM civicclerk.minutes LIMIT 0"))
            connection.execute(text("SELECT id, snapshot_content, delivery_history, audit_entries FROM civicclerk.packet_assembly_records LIMIT 0"))
            connection.execute(text("SELECT id, audit_entries FROM civicclerk.notice_checklist_records LIMIT 0"))
            connection.execute(text("SELECT id, transcript_text, correction_of_id, audit_entries FROM civicclerk.transcripts LIMIT 0"))
            connection.execute(text("SELECT id, audit_entries FROM civicclerk.public_meeting_records LIMIT 0"))
            connection.execute(text("SELECT id FROM civicclerk.public_comments LIMIT 0"))
            connection.execute(text("SELECT id, immutable_hash FROM civicclerk.motions LIMIT 0"))
            connection.execute(text("SELECT id, immutable_hash FROM civicclerk.votes LIMIT 0"))
            connection.execute(text("SELECT id FROM civicclerk.action_items LIMIT 0"))
            connection.execute(text("SELECT id, snapshot_hash FROM civicclerk.packet_versions LIMIT 0"))
        return True
    except (SQLAlchemyError, HTTPException):
        return False
    finally:
        if engine is not None:
            engine.dispose()


async def actor(request: Request, session: AsyncSession = Depends(get_async_session),
                proof: str | None = Header(default=None, alias="X-Townlight-Session")):
    user = await mapped_native_actor(request, session, proof, "civicclerk")
    if not readiness():
        raise HTTPException(503, "Meetings database/schema is not ready; no work accepted.")
    actor_id = str(user.id)
    await session.commit()  # Persist any validated native identity reconciliation first.
    return actor_id


class MeetingInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=255)
    scheduled_start: AwareDatetime
    location: str = Field(min_length=1, max_length=255)
    meeting_type: Literal["regular","special","emergency","closed_session","executive"] = "regular"


class AgendaInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=500)
    department_name: str = Field(min_length=1, max_length=255)


class MeetingStageInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to_status: Literal["SCHEDULED","NOTICED","PACKET_POSTED","IN_PROGRESS","RECESSED",
                       "ADJOURNED","TRANSCRIPT_READY","MINUTES_DRAFTED","MINUTES_POSTED",
                       "MINUTES_ADOPTED","MINUTES_SIGNED","ARCHIVED","CANCELLED"]
    statutory_basis: str | None = None


@router.post("/meetings/{meeting_id}/stages")
def record_meeting_stage(meeting_id: UUID, data: MeetingStageInput, actor_id: str = Depends(actor)):
    return operate("meeting",lambda store: store.record_human_stage(
        meeting_id=str(meeting_id),to_status=data.to_status,actor=actor_id,statutory_basis=data.statutory_basis))


def operate(kind, operation):
    # A SQL failure never retries a mutation or changes authority to memory.
    store = None
    try:
        store = (MeetingStore if kind == "meeting" else AgendaItemRepository)(db_url=database_url())
        result = operation(store)
        if result is None:
            raise HTTPException(404, "Meeting or agenda item not found.")
        return {**result.public_dict(), "audit_entries": result.audit_entries}
    except SQLAlchemyError:
        raise HTTPException(503, "Meetings operation unavailable; read back before retrying a write.") from None
    finally:
        if store is not None:
            store.engine.dispose()


@router.post("/meetings", status_code=201)
def create_meeting(data: MeetingInput, actor_id: str = Depends(actor)):
    return operate("meeting", lambda store: store.create(
        title=data.title, meeting_type=data.meeting_type, scheduled_start=data.scheduled_start,
        location=data.location, actor=actor_id,
    ))


@router.get("/meetings/{meeting_id}")
def get_meeting(meeting_id: UUID, actor_id: str = Depends(actor)):
    return operate("meeting", lambda store: store.get(str(meeting_id)))


@router.post("/agenda-items", status_code=201)
def create_agenda_item(data: AgendaInput, actor_id: str = Depends(actor)):
    return operate("agenda", lambda store: store.create(
        title=data.title, department_name=data.department_name, actor=actor_id,
    ))


@router.get("/agenda-items/{item_id}")
def get_agenda_item(item_id: UUID, actor_id: str = Depends(actor)):
    return operate("agenda", lambda store: store.get(str(item_id)))


class AgendaReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to_status: Literal["DRAFTED","SUBMITTED","DEPT_APPROVED","LEGAL_REVIEWED","CLERK_ACCEPTED",
                       "ON_AGENDA","IN_PACKET","POSTED","HEARD","DISPOSED","ARCHIVED"]


class AgendaAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid")
    meeting_id: UUID


@router.post("/agenda-items/{item_id}/reviews")
def record_agenda_review(item_id: UUID, data: AgendaReviewInput, actor_id: str = Depends(actor)):
    return operate("agenda", lambda store: store.record_human_stage(
        item_id=str(item_id), to_status=data.to_status, actor=actor_id))


@router.post("/agenda-items/{item_id}/meeting")
def assign_agenda(item_id: UUID, data: AgendaAssignment, actor_id: str = Depends(actor)):
    try:
        return operate("agenda", lambda store: store.assign_meeting(
            item_id=str(item_id), meeting_id=str(data.meeting_id), actor=actor_id))
    except ValueError as error:
        raise HTTPException(409, str(error)) from None


class MotionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1)
    seconded_by: str | None = Field(default=None, min_length=1)


class MotionCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class VoteInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    voter_name: str = Field(min_length=1)
    vote: str = Field(min_length=1)


class VoteCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    vote: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class SourceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    source_id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    text: str = Field(min_length=1)


class SentenceInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    text: str = Field(min_length=1)
    citations: list[str] = Field(default_factory=list)


class DraftInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_materials: list[SourceInput] = Field(default_factory=list)
    sentences: list[SentenceInput] = Field(min_length=1)


class MinutesDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["post", "adopt", "sign"]
    note: str = ""


class NoticeInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notice_type: Literal["regular","special","emergency","closed_session","executive"]
    posted_at: AwareDatetime
    minimum_notice_hours: int = Field(ge=0)
    statutory_basis: str | None = None
    approved_by: str | None = None


class NoticeProofInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    location: str = Field(min_length=1)
    note: str = ""
    document_delivery_id: str | None = None


class NoticeDocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=1)


@router.get("/notices/{notice_id}/template")
def notice_template(notice_id: UUID, actor_id: str = Depends(actor)):
    from civicnotice.notice_templates import build_notice_template
    from datetime import datetime
    record=legal_record(NoticeChecklistRepository,lambda store:store.get(str(notice_id)))
    meeting=operate("meeting",lambda store:store.get(record["meeting_id"]))
    template=build_notice_template(notice_type="special meeting" if record["notice_type"] in {"special","emergency"} else "general notice",
        matter_title=meeting["title"],event_date=datetime.fromisoformat(meeting["scheduled_start"]).date(),
        location=meeting.get("location") or "",contact="",source_module="civicclerk",
        statutory_basis=record["statutory_basis"] or "")
    return {"id":str(notice_id),"text":"\n".join(template.template_lines)+
            "\nMeeting start: "+meeting["scheduled_start"],
            "warnings":list(template.placeholders_remaining),"disclaimer":template.disclaimer}


@router.post("/notices/{notice_id}/document")
def notice_document(notice_id: UUID,data: NoticeDocumentInput,actor_id: str = Depends(actor)):
    try:
        result=deliver_notice(db_url=database_url(),profile=profile_root(),notice_id=str(notice_id),
            text=data.text,actor=actor_id)
        if result is None:
            raise HTTPException(404,"Notice not found.")
        return result
    except (ValueError,OSError):
        raise HTTPException(422,"Notice delivery not confirmed; existing documents were retained.") from None
    except SQLAlchemyError:
        raise HTTPException(503,"Notice history write not confirmed; read saved work before retrying.") from None


@router.post("/meetings/{meeting_id}/notice-checks",status_code=201)
def check_notice(meeting_id: UUID, data: NoticeInput, actor_id: str = Depends(actor)):
    from datetime import datetime
    meeting = operate("meeting",lambda store:store.get(str(meeting_id)))
    if not meeting.get("scheduled_start"):
        raise HTTPException(422,"A scheduled start is needed to calculate a notice deadline.")
    result = evaluate_notice_compliance(meeting_id=str(meeting_id),notice_type=data.notice_type,
        scheduled_start=datetime.fromisoformat(meeting["scheduled_start"]),posted_at=data.posted_at,
        minimum_notice_hours=data.minimum_notice_hours,statutory_basis=data.statutory_basis,
        approved_by=data.approved_by)
    return legal_record(NoticeChecklistRepository,lambda store:store.record_check(
        meeting_id=str(meeting_id),notice_type=data.notice_type,compliant=result.compliant,
        http_status=result.http_status,warnings=result.warnings,deadline_at=result.deadline_at,
        posted_at=result.posted_at,minimum_notice_hours=data.minimum_notice_hours,
        statutory_basis=data.statutory_basis,approved_by=data.approved_by,actor=actor_id))


@router.post("/notices/{notice_id}/proof")
def record_notice_proof(notice_id: UUID, data: NoticeProofInput, actor_id: str = Depends(actor)):
    try:
        return legal_record(NoticeChecklistRepository,lambda store:store.attach_posting_proof(
            record_id=str(notice_id),actor=actor_id,posting_proof=data.model_dump()))
    except ValueError as error:
        raise HTTPException(422,str(error)) from None


class PacketInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agenda_item_ids: list[UUID]
    source_files: list["ManagedSource"] = Field(default_factory=list)


class TranscriptInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_label: str = Field(min_length=1)
    transcript_text: str = Field(min_length=1)
    correction_of_id: UUID | None = None


class ActionItemInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    description: str = Field(min_length=1)
    assigned_to: str | None = None
    source_motion_id: UUID | None = None


class ArchiveInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    visibility: Literal["public","closed_session"]
    packet_id: UUID | None = None
    minutes_id: UUID | None = None
    plain_language_summary: str = ""


@router.post("/meetings/{meeting_id}/transcripts",status_code=201)
def capture_transcript(meeting_id: UUID,data: TranscriptInput,actor_id: str = Depends(actor)):
    meeting=operate("meeting",lambda store:store.get(str(meeting_id)))
    try:
        return legal_record(TranscriptRepository,lambda store:store.capture(
            meeting_id=str(meeting_id),source_label=data.source_label,transcript_text=data.transcript_text,
            actor=actor_id,closed_session=meeting["meeting_type"] in {"closed_session","executive"},
            correction_of_id=str(data.correction_of_id) if data.correction_of_id else None))
    except ValueError as error:
        raise HTTPException(422,str(error)) from None


@router.post("/meetings/{meeting_id}/action-items",status_code=201)
def capture_action_item(meeting_id: UUID,data: ActionItemInput,actor_id: str = Depends(actor)):
    operate("meeting",lambda store:store.get(str(meeting_id)))
    if data.source_motion_id:
        motion=legal_record(MotionVoteRepository,lambda store:store.get_motion(str(data.source_motion_id)))
        if motion["meeting_id"] != str(meeting_id):
            raise HTTPException(422,"Motion belongs to another meeting.")
    return legal_record(MotionVoteRepository,lambda store:store.create_action_item(
        meeting_id=str(meeting_id),description=data.description,assigned_to=data.assigned_to,
        source_motion_id=str(data.source_motion_id) if data.source_motion_id else None,actor=actor_id))


@router.post("/meetings/{meeting_id}/archive",status_code=201)
def archive_meeting(meeting_id: UUID,data: ArchiveInput,actor_id: str = Depends(actor)):
    meeting=operate("meeting",lambda store:store.get(str(meeting_id)))
    agenda_text=packet_text=minutes_text=""
    adopted_at=signed_by=None
    if data.packet_id:
        packet=legal_record(PacketAssemblyRepository,lambda store:store.get(str(data.packet_id)))
        if packet["meeting_id"] != str(meeting_id):
            raise HTTPException(422,"Packet belongs to another meeting.")
        agenda_text="\n".join(f"{i+1}. {item['title']}" for i,item in enumerate(packet["snapshot_content"]))
        packet_text=f"{packet['title']} — Packet version {packet['packet_version']}\n\n{agenda_text}"
    if data.minutes_id:
        minutes=legal_record(MinutesDraftRepository,lambda store:store.get_draft(str(data.minutes_id)))
        if minutes["meeting_id"] != str(meeting_id):
            raise HTTPException(422,"Minutes belong to another meeting.")
        minutes_text=minutes["publication_label"]+"\n\n"+"\n".join(
            s["text"]+(" ["+", ".join(s["citations"])+"]" if s["citations"] else "")
            for s in minutes["sentences"])
        if minutes["source_materials"]:
            minutes_text+="\n\nSource references:\n"+"\n".join(
                f"{source['source_id']}: {source['label']}" for source in minutes["source_materials"])
        signed_by=minutes["signed_by"]
        if minutes["adopted"]:
            adopted_at=next((entry["timestamp"] for entry in minutes["decision_history"]
                if entry["action"]=="minutes.human_adopt"),None)
    def save(store):
        record=store.publish(meeting_id=str(meeting_id),title=meeting["title"],visibility=data.visibility,
            posted_agenda=agenda_text,posted_packet=packet_text,approved_minutes=minutes_text,
            plain_language_summary=data.plain_language_summary,minutes_adopted_at=adopted_at,
            minutes_signed_by=signed_by,actor=actor_id,
            source_references={"packet_id":str(data.packet_id) if data.packet_id else None,
                               "minutes_id":str(data.minutes_id) if data.minutes_id else None})
        return record.public_dict(include_closed=True) if record else None
    return legal_record(PublicArchiveRepository,save)


def public_active(request: Request):
    if not getattr(request.app.state,"desktop_domain_enabled",False):
        raise HTTPException(503,"Meetings archive inactive.")
    if not readiness():
        raise HTTPException(503,"Meetings archive schema unavailable.")


@public_router.get("",response_class=HTMLResponse,dependencies=[Depends(public_active)])
def public_archive_index(q: str = ""):
    import html
    records=legal_record(PublicArchiveRepository,lambda store:[r.public_dict() for r in store.search(query=q)])
    links="".join(f'<li><a href="/public/meetings/{r["id"]}">{html.escape(r["title"])}</a></li>' for r in records)
    return '<!doctype html><html lang="en"><meta charset="utf-8"><title>Townlight Meetings archive</title><main><h1>Meetings archive</h1><form><label>Search <input name="q"></label><button>Search</button></form><ul>'+links+'</ul></main></html>'


@public_router.get("/{record_id}",response_class=HTMLResponse,dependencies=[Depends(public_active)])
def public_archive_detail(record_id: UUID):
    import html
    record=legal_record(PublicArchiveRepository,lambda store:store.public_detail(str(record_id)))
    links="".join(f'<li><a href="/public/meetings/{record_id}/{kind}.txt">Download {kind}</a></li>' for kind in ("agenda","packet","minutes"))
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><title>'+html.escape(record["title"])+'</title><main><h1>'+
        html.escape(record["title"])+'</h1><p>'+html.escape(record["plain_language_summary"] or "")+
        '</p><ul>'+links+'</ul><h2>Minutes</h2><pre>'+html.escape(record["approved_minutes"])+'</pre></main></html>')


@public_router.get("/{record_id}/{kind}.txt",dependencies=[Depends(public_active)])
def public_archive_download(record_id: UUID,kind: Literal["agenda","packet","minutes"]):
    record=legal_record(PublicArchiveRepository,lambda store:store.public_detail(str(record_id)))
    key={"agenda":"posted_agenda","packet":"posted_packet","minutes":"approved_minutes"}[kind]
    return Response(record[key],media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition":f'attachment; filename="{record_id}-{kind}.txt"'})


class ManagedSource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    original_path: str
    stored_path: str
    file_name: str
    sha256: str = Field(pattern="^[0-9a-f]{64}$")
    size_bytes: int = Field(ge=0)


def profile_root() -> Path:
    root = os.environ.get("TOWNLIGHT_PROFILE_ROOT")
    if not root:
        raise HTTPException(503,"Profile location unavailable.")
    return Path(root).resolve()


@router.post("/meetings/{meeting_id}/packet-snapshots", status_code=201)
def capture_packet(meeting_id: UUID, data: PacketInput, actor_id: str = Depends(actor)):
    meeting = operate("meeting", lambda store: store.get(str(meeting_id)))
    agenda = []
    for item_id in data.agenda_item_ids:
        agenda.append(operate("agenda",lambda store: store.get(str(item_id))))
    files = [file.model_dump() for file in data.source_files]
    try:
        for file in files:
            verify_source(profile_root(),file)
    except (OSError,ValueError) as error:
        raise HTTPException(422,str(error)) from None
    snapshot = legal_record(PacketStore,lambda store: store.create_snapshot(
        meeting_id=str(meeting_id),agenda_item_ids=[str(i) for i in data.agenda_item_ids],actor=actor_id))
    assembly = legal_record(PacketAssemblyRepository,lambda store:store.create_draft(
        meeting_id=str(meeting_id),packet_snapshot_id=snapshot["id"],packet_version=snapshot["version"],
        title=meeting["title"],actor=actor_id,agenda_item_ids=[str(i) for i in data.agenda_item_ids],
        source_references=files,citations=[],snapshot_content=agenda))
    return {**snapshot,"packet_id":assembly["id"]}


@router.post("/packets/{packet_id}/deliver")
def export_packet(packet_id: UUID, actor_id: str = Depends(actor)):
    try:
        result = deliver_packet(db_url=database_url(),profile=profile_root(),packet_id=str(packet_id),actor=actor_id)
        if result is None:
            raise HTTPException(404,"Packet not found.")
        return result
    except (OSError,ValueError) as error:
        raise HTTPException(422,str(error)) from None
    except SQLAlchemyError:
        raise HTTPException(503,"Packet delivery not confirmed. Inspect saved work before retrying.") from None


@router.post("/minutes/{draft_id}/decisions")
def decide_minutes(draft_id: UUID, data: MinutesDecision, actor_id: str = Depends(actor)):
    return legal_record(MinutesDraftRepository, lambda store: store.record_decision(
        draft_id=str(draft_id), action=data.action, actor=actor_id, note=data.note))


def legal_record(repository, operation):
    store = None
    try:
        store = repository(db_url=database_url())
        result = operation(store)
        if result is None:
            raise HTTPException(404, "Referenced legal record not found.")
        if isinstance(result, MinutesValidationError):
            raise HTTPException(422, {"message": result.message, "fix": result.fix})
        return result.public_dict() if hasattr(result, "public_dict") else result
    except SQLAlchemyError:
        raise HTTPException(503, "Meetings operation unavailable; read back before retrying a write.") from None
    finally:
        if store is not None:
            store.engine.dispose()


@router.post("/meetings/{meeting_id}/motions", status_code=201)
def capture_motion(meeting_id: UUID, data: MotionInput, actor_id: str = Depends(actor)):
    operate("meeting", lambda store: store.get(str(meeting_id)))
    return legal_record(MotionVoteRepository, lambda store: store.capture_motion(
        meeting_id=str(meeting_id), text=data.text, seconded_by=data.seconded_by, actor=actor_id))


@router.post("/motions/{motion_id}/corrections", status_code=201)
def correct_motion(motion_id: UUID, data: MotionCorrection, actor_id: str = Depends(actor)):
    return legal_record(MotionVoteRepository, lambda store: store.correct_motion(
        original_motion_id=str(motion_id), text=data.text, reason=data.reason, actor=actor_id))


@router.post("/motions/{motion_id}/votes", status_code=201)
def capture_vote(motion_id: UUID, data: VoteInput, actor_id: str = Depends(actor)):
    return legal_record(MotionVoteRepository, lambda store: store.capture_vote(
        motion_id=str(motion_id), voter_name=data.voter_name, vote=data.vote, actor=actor_id))


@router.post("/votes/{vote_id}/corrections", status_code=201)
def correct_vote(vote_id: UUID, data: VoteCorrection, actor_id: str = Depends(actor)):
    return legal_record(MotionVoteRepository, lambda store: store.correct_vote(
        original_vote_id=str(vote_id), vote=data.vote, reason=data.reason, actor=actor_id))


@router.post("/meetings/{meeting_id}/minutes/drafts", status_code=201)
def create_minutes(meeting_id: UUID, data: DraftInput, actor_id: str = Depends(actor)):
    operate("meeting", lambda store: store.get(str(meeting_id)))
    return legal_record(MinutesDraftRepository, lambda store: store.create_draft(
        meeting_id=str(meeting_id), model="manual", prompt_version="minutes_draft@0.1.0",
        human_approver=actor_id, human_authored=True, source_materials=[SourceMaterial(**item.model_dump()) for item in data.source_materials],
        sentences=[MinutesSentence(**item.model_dump()) for item in data.sentences]))


@router.get("/meetings/{meeting_id}/proceedings")
def proceedings(meeting_id: UUID, actor_id: str = Depends(actor)):
    meeting = operate("meeting", lambda store: store.get(str(meeting_id)))
    def captured(store):
        motions = store.list_motions(str(meeting_id))
        return {"motions": [m.public_dict() for m in motions],
                "action_items":[item.public_dict() for item in store.list_action_items(str(meeting_id))],
                "votes": [v.public_dict() for m in motions for v in store.list_votes(m.id)]}
    return {"meeting": meeting, **legal_record(MotionVoteRepository, captured),
            "packet_snapshots":legal_record(PacketStore,lambda store:[p.public_dict() for p in store.list_snapshots(str(meeting_id))]),
            "packets":legal_record(PacketAssemblyRepository,lambda store:[p.public_dict() for p in store.list_for_meeting(str(meeting_id))]),
            "notices":legal_record(NoticeChecklistRepository,lambda store:[p.public_dict() for p in store.list_for_meeting(str(meeting_id))]),
            "transcripts":legal_record(TranscriptRepository,lambda store:store.list_for_meeting(str(meeting_id))),
            "archive_records":legal_record(PublicArchiveRepository,lambda store:[r.public_dict(include_closed=True)
                for r in store.search(query="",include_closed=True) if r.meeting_id==str(meeting_id)]),
            "minutes": legal_record(MinutesDraftRepository,
                lambda store: [d.public_dict() for d in store.list_drafts(str(meeting_id))])}


# SPDX-License-Identifier: AGPL-3.0-only
@router.get("/station/catalog")
def station_catalog(actor_id: str = Depends(actor)):
    """Authorized name-based operator selection from canonical Meetings data."""
    engine = create_engine(database_url(), pool_pre_ping=True)
    try:
        with engine.connect() as conn:
            meetings = [dict(r) for r in conn.execute(text(
                "SELECT id,title,scheduled_start FROM civicclerk.meetings ORDER BY scheduled_start DESC NULLS LAST LIMIT 100")).mappings()]
            agenda = [dict(r) for r in conn.execute(text(
                "SELECT id,title,meeting_id FROM civicclerk.agenda_items WHERE meeting_id IN "
                "(SELECT id FROM civicclerk.meetings ORDER BY scheduled_start DESC NULLS LAST LIMIT 100) "
                "ORDER BY title LIMIT 1000")).mappings()]
        return {'meetings': meetings, 'agenda': agenda}
    finally:
        engine.dispose()
