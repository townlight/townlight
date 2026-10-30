"""Authenticated native transport; Inspections owns persistent intake business state."""
import os
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.native_identity import mapped_native_actor
from app.database import get_async_session
from civicinspect.adapters import (
    ConfigurationError,
    configured_analysis_providers,
    configured_transcription_provider,
    configured_vision_provider,
)
from civicinspect.connections import SourceUnavailable, search
from civicinspect.media_analysis import (
    EvidenceRejected,
    analyse_evidence,
    retain_evidence,
)
from civicinspect.migrations import ready, source_engine
from civicinspect.workflow_models import AnalysisRecord, Model, InspectionInput
from civicinspect.workflow_store import InspectionRepository, Conflict
from civicinspect.notice_draft import draft_notice
from civicsuite_runtime.services import _sync_database_url

router = APIRouter(prefix="/desktop/v1/inspections", tags=["native-inspections"])
REQUIRED = {"civicinspect", "civicrecords-ai", "civiccode"}


def providers(app):
    def provider(module, attribute):
        def resolve(**kwargs):
            if module not in app.state.desktop_enabled_modules:
                raise SourceUnavailable("Connected module disabled.")
            return getattr(app.state, attribute)(**kwargs)
        return resolve
    return {"code": provider("civiccode", "desktop_code_sources")}


def configured_repository(app):
    if not REQUIRED.issubset(app.state.desktop_enabled_modules) or not app.state.desktop_domain_enabled:
        raise SourceUnavailable("Select the Inspections staff candidate and activate the canonical runtime.")
    engine = source_engine(_sync_database_url(os.environ["DATABASE_URL"]))
    return engine, providers(app)


def configure(app):
    def documents(**kwargs):
        engine, links = configured_repository(app)
        try:
            return InspectionRepository(engine, links).records_documents(**kwargs)
        finally:
            engine.dispose()
    app.state.desktop_inspections_sources = documents


async def actor(request: Request, session: AsyncSession = Depends(get_async_session),
                proof: str | None = Header(default=None, alias="X-Townlight-Session")):
    user = await mapped_native_actor(request, session, proof, "civicinspect")
    identity = str(user.id)
    await session.commit()
    return identity


async def call(request, operation):
    def execute():
        engine, links = configured_repository(request.app)
        try:
            return operation(InspectionRepository(engine, links))
        finally:
            engine.dispose()
    try:
        return await run_in_threadpool(execute)
    except Conflict as exc:
        raise HTTPException(409, str(exc)) from None
    except (SourceUnavailable, SQLAlchemyError):
        raise HTTPException(503, "Inspections database or connected evidence unavailable; saved work retained. Check System Health and source permissions.") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


class RepeatLookup(Model):
    property_reference: str = Field(min_length=1, max_length=1000)


@router.post("/repeat-cases")
async def repeat_cases(request: Request, body: RepeatLookup, identity=Depends(actor)):
    return await call(request, lambda r: r.repeat_cases(body.property_reference))


@router.post("/notice-draft")
async def notice(request: Request, body: InspectionInput, identity=Depends(actor)):
    result = draft_notice(case_id=body.inspection_reference, property_reference=body.property_reference,
        violation_type="inspector-selected matter", observations=tuple([body.inspector_notes, *body.photo_observations]))
    return {"draft": result.draft_body, "review_required": True}


@router.get("/cases")
async def cases(request: Request, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda r: r.inventory("case", offset))


@router.post("/cases")
async def create_case(request: Request, body: InspectionInput, identity=Depends(actor)):
    return await call(request, lambda r: r.save_case(body, identity))


@router.get("/cases/{case_id}")
async def case(request: Request, case_id: UUID, identity=Depends(actor)):
    return await call(request, lambda r: r.get_case(str(case_id)))


@router.post("/cases/{case_id}/revisions")
async def revise(request: Request, case_id: UUID, body: InspectionInput, identity=Depends(actor)):
    return await call(request, lambda r: r.save_case(body, identity, str(case_id)))


@router.get("/cases/{case_id}/history")
async def history(request: Request, case_id: UUID, identity=Depends(actor)):
    return await call(request, lambda r: r.history(str(case_id)))


class Packet(Model):
    expected_revision: UUID
    visibility: Literal["staff_only", "records_copy"]


@router.post("/cases/{case_id}/packets")
async def packet(request: Request, case_id: UUID, body: Packet, identity=Depends(actor)):
    return await call(request, lambda r: r.packet(str(case_id), str(body.expected_revision), body.visibility, identity))


@router.get("/packets/{packet_id}")
async def document(request: Request, packet_id: UUID, identity=Depends(actor)):
    return await call(request, lambda r: r.document(str(packet_id)))


class EvidenceItem(Model):
    filename: str = Field(min_length=1, max_length=151)
    media_type: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=2000)
    content_base64: str = Field(min_length=1, max_length=14_000_000)
    sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class EvidenceItems(Model):
    items: list[EvidenceItem] = Field(min_length=1, max_length=10)


class CodeLink(Model):
    provider: Literal["code"] = "code"
    source_id: str = Field(min_length=1, max_length=500)
    expected_sha256: str = Field(pattern=r"^[a-f0-9]{64}$")


class MediaAnalysis(Model):
    items: list[EvidenceItem] = Field(min_length=1, max_length=10)
    code_links: list[CodeLink] = Field(default_factory=list, max_length=30)
    inspector_supplied_text: str = Field(default="", max_length=10000)


def _retain(items):
    try:
        return [retain_evidence(filename=item.filename, media_type=item.media_type,
                                description=item.description,
                                content_base64=item.content_base64,
                                expected_sha256=item.sha256) for item in items]
    except EvidenceRejected as exc:
        raise HTTPException(422, f"Evidence retained nothing: {exc}") from None


@router.get("/evidence/supported-types")
async def supported_types(identity=Depends(actor)):
    """The media types this deployment's product model actually accepts."""

    from civicinspect.media_analysis import SUPPORTED_MEDIA_TYPES

    return {"media_types": list(SUPPORTED_MEDIA_TYPES)}


@router.post("/evidence/retain")
async def retain(request: Request, body: EvidenceItems, identity=Depends(actor)):
    retained = _retain(body.items)
    return {"retained_evidence": [item.as_record() for item in retained],
            "count": len(retained),
            "raw_audio_retained": any(item.media_type.startswith("audio/")
                                      for item in retained),
            "disclaimer": ("Original bytes retained with their SHA256. Retention is "
                           "not a finding, citation, notice or enforcement action.")}


@router.post("/media/analyse")
async def media_analyse(request: Request, body: MediaAnalysis,
                        identity=Depends(actor)):
    """Run the configured adapters over retained originals; draft only.

    The result carries the same observations/citations the product route returns
    plus ``analysis_record``: the exact ``AnalysisRecord`` the caller puts on its
    case payload, so the reviewed draft is the analysed one.
    """

    retained = _retain(body.items)
    try:
        vision, model = configured_vision_provider()
        # Resolve precisely the same active Code evidence used by saved cases.
        analysis_providers = providers(request.app)
        transcription = configured_transcription_provider()
    except ConfigurationError as exc:
        raise HTTPException(503, str(exc)) from None
    payload = await analyse_evidence(
        evidence=retained,
        code_links=[link.model_dump() for link in body.code_links],
        providers=analysis_providers, vision_provider=vision,
        transcription_provider=transcription, model=model,
        inspector_supplied_text=body.inspector_supplied_text)
    result = payload.to_payload()
    result["analysis_record"] = (
        AnalysisRecord.from_media_analysis(result).model_dump(mode="json"))
    return result


class Search(Model):
    provider: Literal["code"]
    query: str = Field(min_length=1, max_length=500)


@router.post("/connections/search")
async def connections(request: Request, body: Search, identity=Depends(actor)):
    return await call(request, lambda r: search(r.providers, body.provider, body.query))


def database_status():
    engine = None
    try:
        engine = source_engine(_sync_database_url(os.environ["DATABASE_URL"]))
        ok = ready(engine)
        return {"ok": ok, "reason": "inspections-schema-ready" if ok else "inspections-schema-unavailable"}
    except Exception:
        return {"ok": False, "reason": "inspections-schema-unavailable"}
    finally:
        if engine is not None:
            engine.dispose()
