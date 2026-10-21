"""Native desktop bridge for Zoning: geospatial imports and parcel lookup."""

from __future__ import annotations

import os
from datetime import date
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.native_identity import mapped_native_actor
from app.database import get_async_session
from civicsuite_runtime.services import _sync_database_url
from civiczone import geo_import
from civiczone import cited_rules, cited_questions
from civiczone import connected_sources as connected
from civicsuite_runtime.code_public import public_citation


router = APIRouter(prefix="/desktop/v1/zoning", tags=["native-zoning"])


async def actor(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
):
    user = await mapped_native_actor(request, session, proof, "civiczone")
    from civicsuite_runtime.services import _zoning_database_status

    if not _zoning_database_status()["ok"]:
        raise HTTPException(
            503, "Townlight Zoning database/schema is not ready; no work accepted."
        )
    actor_id = str(user.id)
    await session.commit()
    return actor_id


def _engine() -> Engine:
    try:
        raw = os.environ["DATABASE_URL"]
    except KeyError:
        raise HTTPException(503, "Zoning persistence unavailable.") from None
    url = _sync_database_url(raw)
    if not url.startswith("postgresql"):
        raise HTTPException(503, "Zoning persistence requires PostgreSQL.")
    return create_engine(url, pool_pre_ping=True, connect_args={"connect_timeout": 5})


class _ParcelLookupIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    jurisdiction: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=1, max_length=500)


@router.post("/imports")
async def imports(payload: dict, actor_id: str = Depends(actor)):
    engine = _engine()
    try:
        return await run_in_threadpool(
            geo_import.import_geojson, engine, payload, actor_id
        )
    except geo_import.GeoImportError as exc:
        detail = str(exc) or "Import rejected."
        raise HTTPException(422, detail) from None
    except SQLAlchemyError:
        raise HTTPException(503, "Zoning persistence unavailable.") from None
    finally:
        engine.dispose()


def _resolve_citation(section_number):
    try:
        return public_citation(section_number, date.today())
    except SQLAlchemyError:
        raise HTTPException(503, "Townlight Code persistence unavailable.") from None


@router.post("/parcels/lookup")
async def parcel_lookup(body: _ParcelLookupIn, _actor: str = Depends(actor)):
    engine = _engine()
    try:
        try:
            result = await run_in_threadpool(
                geo_import.lookup_parcel,
                engine,
                jurisdiction=body.jurisdiction,
                query=body.query,
            )
        except SQLAlchemyError:
            raise HTTPException(503, "Zoning persistence unavailable.") from None
    finally:
        engine.dispose()

    status = result.get("status")
    if status != "ok":
        return result

    from civicsuite_runtime.services import _code_database_status

    if not _code_database_status()["ok"]:
        raise HTTPException(
            503, "Townlight Code database/schema is not ready; no determination."
        )

    zone = result.get("zone") or {}
    section_number = zone.get("section_number")
    citation_ok = True

    if section_number:
        cit = _resolve_citation(section_number)
        if cit.get("status") == "ok":
            result["code_citation"] = cit
        else:
            citation_ok = False
    else:
        citation_ok = False

    for overlay in result.get("overlays") or []:
        sec = overlay.get("section_number")
        if not sec:
            continue
        ocit = _resolve_citation(sec)
        if ocit.get("status") == "ok":
            overlay["code_citation"] = ocit
        else:
            citation_ok = False

    if not citation_ok:
        result["status"] = "citation_unavailable"

    return result


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Question(Strict):
    jurisdiction: str = Field(min_length=1, max_length=255)
    query: str = Field(min_length=1, max_length=500)
    question: str = Field(min_length=1, max_length=2000)
    kind: Literal["use", "dimension"]
    key: str = Field(min_length=1, max_length=255)
    audience: Literal["resident", "staff"] = "resident"


class Rule(Strict):
    jurisdiction: str = Field(min_length=1, max_length=255)
    zone_code: str = Field(..., min_length=1, max_length=80)
    key: str = Field(..., min_length=1, max_length=120)
    section_number: str = Field(min_length=1, max_length=255)
    kind: Literal["use", "dimension"]
    value: str = Field(..., min_length=1, max_length=255)
    overlay_code: str | None = Field(default=None, max_length=255)


class Review(Strict):
    answer: str = Field(default="", max_length=10000)
    notes: str = Field(default="", max_length=10000)
    queue_status: Literal["open", "in_review", "resolved", "closed"] = "resolved"


class Outline(Strict):
    title: str = Field(min_length=1, max_length=255)
    question_ids: list[UUID] = Field(min_length=1, max_length=50)


class CodeContext(Strict):
    section_number: str = Field(min_length=1, max_length=255)
    as_of: date | None = None


class MeetingSearch(Strict):
    query: str = Field(min_length=1, max_length=500)


class MeetingLink(Strict):
    source_id: str = Field(min_length=1, max_length=200)
    expected_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    relation: Literal["hearing", "context", "precedent"]


class SourceSnapshot(Strict):
    visibility: Literal["public", "staff_only"]
    meeting_event_ids: list[UUID] = Field(default_factory=list, max_length=50)


def meeting_provider(request: Request):
    mods = getattr(request.app.state, "desktop_enabled_modules", ()) or ()
    sources = getattr(request.app.state, "desktop_meetings_sources", None)
    if "civicclerk" not in mods or not callable(sources):
        raise HTTPException(status_code=503, detail="meetings unavailable")
    return sources


@router.get("/questions/{question_id}/history")
async def question_history(
    question_id: UUID, actor_id=Depends(actor), provider=Depends(meeting_provider)
):
    return await db_call(connected.history, str(question_id), provider)


@router.post("/meetings/search")
async def search_meetings(
    p: MeetingSearch, actor_id=Depends(actor), provider=Depends(meeting_provider)
):
    try:
        rows = await run_in_threadpool(provider, query=p.query)
    except Exception:
        raise HTTPException(
            status_code=503, detail="Meeting search unavailable"
        ) from None
    return {
        "results": [
            {
                **{k: v for k, v in row.items() if k != "text"},
                "excerpt": row["text"][:500],
            }
            for row in rows[:50]
        ],
        "truncated": len(rows) > 50,
    }


def _aid(a):
    return a.get("id") if isinstance(a, dict) else getattr(a, "id", a)


@router.post("/questions/{question_id}/meetings")
async def link_meeting(
    question_id: UUID,
    p: MeetingLink,
    actor_id=Depends(actor),
    provider=Depends(meeting_provider),
):
    event_id = await db_call(
        connected.link_meeting,
        str(question_id),
        p.model_dump(),
        _aid(actor_id),
        provider,
    )
    return {"event_id": event_id}


@router.post("/questions/{question_id}/snapshots")
async def create_snapshot(
    question_id: UUID,
    p: SourceSnapshot,
    actor_id=Depends(actor),
    provider=Depends(meeting_provider),
):
    return await db_call(
        connected.create_snapshot,
        str(question_id),
        p.model_dump(mode="json"),
        _aid(actor_id),
        provider,
    )


async def db_call(fn, *args):
    engine = _engine()
    try:
        return await run_in_threadpool(fn, engine, *args)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid input") from None
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Service unavailable") from None
    finally:
        engine.dispose()


def current_citation(section):
    return public_citation(section, date.today())


@router.post("/rules")
async def create_rule(p: Rule, actor_id=Depends(actor)):
    return {
        "rule_id": await db_call(
            cited_rules.register_rule, p.model_dump(), actor_id, current_citation
        )
    }


@router.post("/questions")
async def create_question(p: Question, actor_id=Depends(actor)):
    return await db_call(_ask, p.model_dump(), actor_id)


def _ask(engine, p, actor_id):
    parcel = geo_import.lookup_parcel(
        engine, jurisdiction=p["jurisdiction"], query=p["query"]
    )
    result = cited_rules.answer(engine, parcel, p["kind"], p["key"], current_citation)
    return cited_questions.record(engine, p, actor_id, result)


@router.get("/workspace")
async def get_workspace(actor_id=Depends(actor)):
    return await db_call(cited_questions.workspace)


@router.post("/questions/{question_id}/reviews")
async def create_review(question_id: UUID, p: Review, actor_id=Depends(actor)):
    return await db_call(
        cited_questions.review, str(question_id), p.model_dump(), actor_id
    )


@router.post("/outlines")
async def create_outline(p: Outline, actor_id=Depends(actor)):
    return await db_call(
        cited_questions.outline, p.title, [str(i) for i in p.question_ids], actor_id
    )


@router.post("/code-context")
async def create_code_context(p: CodeContext, actor_id=Depends(actor)):
    asof = p.as_of or date.today()
    today = date.today()
    citation = public_citation(p.section_number, asof)
    temporal_context = (
        "current" if asof == today else ("historical" if asof < today else "future")
    )
    return {"citation": citation, "temporal_context": temporal_context}


def public_active(request: Request):
    state = request.app.state
    if (
        not state.desktop_domain_enabled
        or "civiczone" not in state.desktop_enabled_modules
    ):
        raise HTTPException(status_code=503, detail="civiczone disabled")
    from civicsuite_runtime.services import (
        _zoning_database_status,
        _code_database_status,
    )

    if not _zoning_database_status()["ok"] or not _code_database_status()["ok"]:
        raise HTTPException(status_code=503, detail="database unavailable")


public_router = APIRouter(prefix="/civiczone")


@public_router.post("/questions", dependencies=[Depends(public_active)])
async def public_question(p: Question):
    payload = p.model_dump()
    payload["audience"] = "resident"
    return await db_call(_ask, payload, "public-local")


def _public_parcel_lookup(engine, jurisdiction, query):
    return geo_import.lookup_parcel(engine, jurisdiction=jurisdiction, query=query)


@public_router.post("/parcels/lookup", dependencies=[Depends(public_active)])
async def public_parcel_lookup(p: _ParcelLookupIn):
    return await db_call(_public_parcel_lookup, p.jurisdiction, p.query)
