"""Native Planning transport. SQL repositories own all municipal business state."""
from __future__ import annotations

import base64
import os
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.native_identity import mapped_native_actor
from app.database import get_async_session
from civicplan.connections import ConnectionUnavailable, search
from civicplan.migrations import source_engine
from civicplan.policy_service import PolicyService
from civicplan.public_explore import explore
from civicplan.source_bundle import BundleModel, PlanBundle
from civicplan.source_store import PlanSourceRepository, SourceConflict, SourcesUnavailable
from civicplan.workflow_models import AnalysisInput
from civicplan.workflow_store import WorkflowRepository
from civicplan.municipal import MunicipalRepository, InitiativeInput, AmendmentInput
from civicsuite_runtime.services import _sync_database_url

router = APIRouter(prefix="/desktop/v1/planning", tags=["native-planning"])
public_router = APIRouter(prefix="/civicplan", tags=["local-public-planning"])


def available(request: Request):
    from civicsuite_runtime.services import _planning_database_status
    required = {"civicplan", "civicrecords-ai", "civicclerk", "civiccode", "civiczone", "civicaccess"}
    providers = getattr(request.app.state, "planning_providers", {})
    if (not required.issubset(request.app.state.desktop_enabled_modules)
            or not request.app.state.desktop_domain_enabled
            or not _planning_database_status()["ok"]
            or set(providers) != {"meetings", "zoning"}
            or not all(callable(provider) for provider in providers.values())):
        raise HTTPException(503, "Planning is unavailable; check the development profile and migrations.")


async def actor(request: Request, session: AsyncSession = Depends(get_async_session),
                proof: str | None = Header(default=None, alias="X-Townlight-Session")):
    user = await mapped_native_actor(request, session, proof, "civicplan")
    available(request)
    identity = str(user.id)
    await session.commit()
    return identity


async def call(request, operation):
    def execute():
        engine = source_engine(_sync_database_url(os.environ["DATABASE_URL"]))
        try:
            sources = PlanSourceRepository(engine)
            workflow = WorkflowRepository(sources, request.app.state.planning_providers,
                                         request.app.state.planning_access_rewrite)
            return operation(sources, workflow)
        finally:
            engine.dispose()
    try:
        return await run_in_threadpool(execute)
    except SourceConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except (SQLAlchemyError, SourcesUnavailable, ConnectionUnavailable):
        raise HTTPException(503, "Planning persistence or connected evidence is unavailable.") from None
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None


class Import(BundleModel):
    bundle: dict
    expected_previous_revision: str | None = Field(default=None, min_length=36, max_length=36)


@router.post("/imports/preview")
async def preview_import(body: Import, identity=Depends(actor)):
    try:
        bundle = PlanBundle.model_validate({**body.bundle, "reviewer_label": identity})
    except ValueError:
        raise HTTPException(422, "Invalid source bundle; verify metadata, excerpts, anchors and original hashes.") from None
    return bundle.model_dump(mode="json", exclude={"documents": {"__all__": {"content_base64"}}})


@router.post("/imports")
async def import_source(request: Request, body: Import, identity=Depends(actor)):
    def operation(sources, _):
        bundle = PlanBundle.model_validate({**body.bundle, "reviewer_label": identity})
        return sources.import_bundle(bundle, actor_id=identity,
                                     expected_previous_revision=body.expected_previous_revision)
    return await call(request, operation)


@router.get("/sources")
async def source_list(request: Request, limit: int = Query(50, ge=1, le=100),
                      offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda s, _: s.inventory(limit=limit, offset=offset))


@router.get("/sources/{plan_id}/history")
async def source_history(request: Request, plan_id: str, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda s, _: s.history_page(plan_id, offset=offset))


@router.get("/revisions/{revision_id}")
async def revision(request: Request, revision_id: UUID, identity=Depends(actor)):
    return await call(request, lambda s, _: s.revision(str(revision_id), staff=True))


def original(sources, revision_id, document_id, *, staff):
    if not staff and not PolicyService(sources).public_permitted(revision_id):
        raise HTTPException(404, "Public source unavailable.")
    item = sources.original_document(revision_id, document_id, staff=staff)
    if item is None:
        raise HTTPException(404, "Source document unavailable.")
    import hashlib
    if hashlib.sha256(item["original_bytes"]).hexdigest() != item["sha256"]:
        raise ValueError("Original source integrity failed.")
    return {"filename": item["filename"], "media_type": item["media_type"],
            "sha256": item["sha256"], "content_base64": base64.b64encode(item["original_bytes"]).decode()}


@router.get("/revisions/{revision_id}/documents/{document_id}")
async def staff_original(request: Request, revision_id: UUID, document_id: str, identity=Depends(actor)):
    return await call(request, lambda s, _: original(s, str(revision_id), document_id, staff=True))


class Search(BundleModel):
    query: str = Field(min_length=1, max_length=2000)
    plan_type: str | None = Field(default=None, max_length=40)


@router.post("/policies/search")
async def policies(request: Request, body: Search, identity=Depends(actor)):
    return await call(request, lambda s, _: PolicyService(s).answer(body.query, staff=True, plan_type=body.plan_type))


@router.get("/analyses")
async def analyses(request: Request, limit: int = Query(50, ge=1, le=100),
                   offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda _, w: w.inventory(limit=limit, offset=offset))


def attributed(body, identity):
    # Only this transport derives review attribution. Existing service-key and
    # historical repository contracts retain their original immutable evidence.
    return AnalysisInput.model_validate({**body, "reviewer_label": identity if body.get("review_state") == "reviewed" else "",
                                        "reviewed_on": date.today() if body.get("review_state") == "reviewed" else None})


@router.post("/analyses")
async def create_analysis(request: Request, body: dict, identity=Depends(actor)):
    def operation(_, w):
        data = attributed(body, identity)
        if data.expected_previous_revision is not None:
            raise ValueError("New analyses have no previous revision.")
        return w.save(data, identity)
    return await call(request, operation)


@router.post("/analyses/{analysis_id}/revisions")
async def revise_analysis(request: Request, analysis_id: UUID, body: dict, identity=Depends(actor)):
    def operation(_, w):
        data = attributed(body, identity)
        if data.expected_previous_revision is None:
            raise ValueError("Reload the current analysis revision before saving.")
        return w.save(data, identity, str(analysis_id))
    return await call(request, operation)


@router.get("/analyses/{analysis_id}")
async def analysis(request: Request, analysis_id: UUID, identity=Depends(actor)):
    return await call(request, lambda _, w: w.get(str(analysis_id)))


@router.get("/analyses/{analysis_id}/history")
async def analysis_history(request: Request, analysis_id: UUID, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda _, w: w.history_page(str(analysis_id), offset=offset))


class Snapshot(BundleModel):
    expected_revision: UUID
    visibility: Literal["staff_only", "public"]


@router.post("/analyses/{analysis_id}/snapshot-preview")
async def preview_snapshot(request: Request, analysis_id: UUID, body: Snapshot, identity=Depends(actor)):
    return await call(request, lambda _, w: w.preview_snapshot(str(analysis_id), str(body.expected_revision), body.visibility))


@router.post("/analyses/{analysis_id}/snapshots")
async def snapshot(request: Request, analysis_id: UUID, body: Snapshot, identity=Depends(actor)):
    return await call(request, lambda _, w: w.snapshot(str(analysis_id), str(body.expected_revision), body.visibility, identity))


@router.get("/snapshots")
async def snapshots(request: Request, limit: int = Query(50, ge=1, le=100),
                    offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda _, w: w.snapshot_inventory(limit=limit, offset=offset, staff=True))


@router.get("/snapshots/{snapshot_id}")
async def document(request: Request, snapshot_id: UUID, identity=Depends(actor)):
    return await call(request, lambda _, w: w.document(str(snapshot_id), staff=True))


@router.post("/snapshots/{snapshot_id}/access-advice")
async def access_advice(request: Request, snapshot_id: UUID, identity=Depends(actor)):
    return await call(request, lambda _, w: w.access_advice(str(snapshot_id)))


class ConnectionSearch(BundleModel):
    provider: Literal["meetings", "zoning"]
    query: str = Field(min_length=1, max_length=500)


@router.post("/connections/search")
async def connections(request: Request, body: ConnectionSearch, identity=Depends(actor)):
    return await call(request, lambda _, w: search(w.providers, body.provider, body.query))


@public_router.post("/policies/search", dependencies=[Depends(available)])
async def public_policies(request: Request, body: Search):
    return await call(request, lambda s, _: PolicyService(s).answer(body.query, plan_type=body.plan_type))


class PublicExplore(BundleModel):
    goal: str = Field(default="", max_length=500)
    topic: str = Field(default="", max_length=160)
    neighborhood: str = Field(default="", max_length=255)
    plan_type: str = Field(default="", max_length=120)


@public_router.post("/plan-explore", dependencies=[Depends(available)])
async def public_plan_explore(request: Request, body: PublicExplore):
    """Topic/goal/plan-type exploration over adopted public plan sources only."""

    def operation(sources, _workflow):
        result = explore(PolicyService(sources), goal=body.goal, topic=body.topic,
                         plan_type=body.plan_type, neighborhood=body.neighborhood, staff=False)
        return {"goal": result.goal, "topic": result.topic, "plan_type": result.plan_type,
                "neighborhood": result.neighborhood,
                "total": result.total, "plans": result.plans, "facets": result.facets,
                "empty_reason": result.empty_reason,
                "review_required": True, "disclaimer": result.disclaimer}

    return await call(request, operation)


@public_router.get("/snapshots", dependencies=[Depends(available)])
async def public_snapshots(request: Request, limit: int = Query(50, ge=1, le=100),
                           offset: int = Query(0, ge=0, le=100000)):
    return await call(request, lambda _, w: w.snapshot_inventory(limit=limit, offset=offset))


@public_router.get("/snapshots/{snapshot_id}", dependencies=[Depends(available)])
async def public_document(request: Request, snapshot_id: UUID):
    return await call(request, lambda _, w: w.document(str(snapshot_id)))


@public_router.get("/revisions/{revision_id}/documents/{document_id}", dependencies=[Depends(available)])
async def public_original(request: Request, revision_id: UUID, document_id: str):
    return await call(request, lambda s, _: original(s, str(revision_id), document_id, staff=False))


@router.get("/progress/targets")
async def municipal_progress(request: Request, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda sources, _: MunicipalRepository(sources).list("initiative", offset=offset))


@router.get("/amendments/history")
async def municipal_amendments(request: Request, offset: int = Query(0, ge=0, le=100000), identity=Depends(actor)):
    return await call(request, lambda sources, _: MunicipalRepository(sources).list("amendment", offset=offset))


@router.get("/municipal-work/{item_id}/history")
async def municipal_history(request: Request, item_id: UUID, identity=Depends(actor)):
    return {"revisions": await call(request, lambda sources, _: MunicipalRepository(sources).history(str(item_id)))}


@router.post("/initiatives")
async def create_initiative(request: Request, body: InitiativeInput, identity=Depends(actor)):
    return await call(request, lambda sources, _: MunicipalRepository(sources).save(body, identity))


@router.post("/initiatives/{item_id}/revisions")
async def update_initiative(request: Request, item_id: UUID, body: InitiativeInput, identity=Depends(actor)):
    return await call(request, lambda sources, _: MunicipalRepository(sources).save(body, identity, str(item_id)))


@router.post("/amendments")
async def create_amendment(request: Request, body: AmendmentInput, identity=Depends(actor)):
    return await call(request, lambda sources, _: MunicipalRepository(sources).save(body, identity))


@router.post("/amendments/{item_id}/revisions")
async def update_amendment(request: Request, item_id: UUID, body: AmendmentInput, identity=Depends(actor)):
    return await call(request, lambda sources, _: MunicipalRepository(sources).save(body, identity, str(item_id)))
