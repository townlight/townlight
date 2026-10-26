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
from civicinspect.connections import SourceUnavailable, search
from civicinspect.migrations import ready, source_engine
from civicinspect.workflow_models import Model, InspectionInput
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
