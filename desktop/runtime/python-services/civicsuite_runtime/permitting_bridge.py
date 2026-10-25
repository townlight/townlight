"""Authenticated native transport; Permitting owns persistent intake business state."""
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
from civicpermit.connections import SourceUnavailable, search
from civicpermit.migrations import ready, source_engine
from civicpermit.workflow_models import Model, RequirementBundle, IntakeInput
from civicpermit.workflow_store import IntakeRepository, Conflict
from civicsuite_runtime.services import _sync_database_url

router = APIRouter(prefix="/desktop/v1/permitting", tags=["native-permitting"])
REQUIRED = {"civicpermit", "civicrecords-ai", "civiccode", "civiczone"}


def providers(app):
    def provider(module, attribute):
        def resolve(**kwargs):
            if module not in app.state.desktop_enabled_modules:
                raise SourceUnavailable("Connected module disabled.")
            return getattr(app.state, attribute)(**kwargs)
        return resolve
    return {"code": provider("civiccode", "desktop_code_sources"),
            "zoning": provider("civiczone", "desktop_zoning_sources")}


def configured_repository(app):
    if not REQUIRED.issubset(app.state.desktop_enabled_modules) or not app.state.desktop_domain_enabled:
        raise SourceUnavailable("Select the Permitting staff candidate and activate the canonical runtime.")
    engine = source_engine(_sync_database_url(os.environ["DATABASE_URL"]))
    return engine, providers(app)


def configure(app):
    def documents(**kwargs):
        engine, links = configured_repository(app)
        try:
            return IntakeRepository(engine, links).records_documents(**kwargs)
        finally:
            engine.dispose()
    app.state.desktop_permitting_sources = documents


async def actor(request: Request, session: AsyncSession = Depends(get_async_session),
                proof: str | None = Header(default=None, alias="X-Townlight-Session")):
    user = await mapped_native_actor(request, session, proof, "civicpermit")
    identity = str(user.id)
    await session.commit()
    return identity


async def call(request, operation):
    def execute():
        engine, links = configured_repository(request.app)
        try:
            return operation(IntakeRepository(engine, links))
        finally:
            engine.dispose()
    try:
        return await run_in_threadpool(execute)
    except Conflict as exc:
        raise HTTPException(409, str(exc)) from None
    except (SourceUnavailable, SQLAlchemyError):
        raise HTTPException(503, "Permitting database or connected evidence unavailable; saved work retained. Check System Health and source permissions.") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


class Import(Model):
    bundle: RequirementBundle
    expected_revision: UUID | None = None


@router.post("/requirements")
async def import_requirements(request: Request, body: Import, identity=Depends(actor)):
    return await call(request, lambda r: r.import_requirements(body.bundle, identity,
        str(body.expected_revision) if body.expected_revision else None))


@router.get("/requirements")
async def requirements(request: Request, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda r: r.inventory("requirement", offset))


@router.get("/requirements/{revision_id}")
async def requirement(request: Request, revision_id: UUID, identity=Depends(actor)):
    return await call(request, lambda r: r.revision(str(revision_id), "requirement"))


@router.get("/cases")
async def cases(request: Request, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda r: r.inventory("case", offset))


@router.post("/cases")
async def create_case(request: Request, body: IntakeInput, identity=Depends(actor)):
    return await call(request, lambda r: r.save_case(body, identity))


@router.get("/cases/{case_id}")
async def case(request: Request, case_id: UUID, identity=Depends(actor)):
    return await call(request, lambda r: r.get_case(str(case_id)))


@router.post("/cases/{case_id}/revisions")
async def revise(request: Request, case_id: UUID, body: IntakeInput, identity=Depends(actor)):
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
    provider: Literal["code", "zoning"]
    query: str = Field(min_length=1, max_length=500)


@router.post("/connections/search")
async def connections(request: Request, body: Search, identity=Depends(actor)):
    return await call(request, lambda r: search(r.providers, body.provider, body.query))


def database_status():
    engine = None
    try:
        engine = source_engine(_sync_database_url(os.environ["DATABASE_URL"]))
        ok = ready(engine)
        return {"ok": ok, "reason": "permitting-schema-ready" if ok else "permitting-schema-unavailable"}
    except Exception:
        return {"ok": False, "reason": "permitting-schema-unavailable"}
    finally:
        if engine is not None:
            engine.dispose()
