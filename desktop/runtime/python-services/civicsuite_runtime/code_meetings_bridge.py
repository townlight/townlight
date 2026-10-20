"""Authenticated native adapters for the bounded Code–Meetings connection."""
from __future__ import annotations

from datetime import date
from typing import Annotated, Literal
from uuid import UUID

import sqlalchemy as sa
from fastapi import APIRouter, Depends, HTTPException
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError

from .code_bridge import actor as code_actor
from .meetings_bridge import actor as meeting_actor, database_url
from civiccode.section_lifecycle import SectionLifecycleError
from civiccode.ordinance_handoff import OrdinanceHandoffError
from . import code_meetings as store

Key = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")]


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Proposal(_Strict):
    id: Key
    version_id: str = Field(min_length=1, max_length=255)
    meeting_id: UUID
    title: str = Field(min_length=1, max_length=500)
    ordinance_number: str = Field(min_length=1, max_length=120)
    proposed_text: str = Field(min_length=1, max_length=1_000_000)
    supersedes_id: Key | None = None
    reconciliation_note: str | None = None


class Decision(_Strict):
    id: Key
    outcome: Literal["adopted", "not_adopted", "deferred", "withdrawn"]
    decided_at: AwareDatetime | None = None
    decision_text: str = Field(min_length=1, max_length=1_000_000)
    supporting_references: list[str] = Field(default_factory=list)
    supersedes_decision_id: Key | None = None
    reconciliation_note: str | None = None


class Closeout(_Strict):
    decision_id: Key
    version_id: str = Field(min_length=1, max_length=255)
    source_id: str = Field(min_length=1, max_length=255)
    version_label: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=1_000_000)
    effective_start: date
    effective_end: date | None = None
    is_current: bool
    reconciliation_note: str | None = None


def run(fn, *args):
    engine = sa.create_engine(database_url(), pool_pre_ping=True, connect_args={"connect_timeout": 5})
    try:
        return fn(engine, *args)
    except store.ConnectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from None
    except (SectionLifecycleError, OrdinanceHandoffError) as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail()) from None
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Code/Meetings persistence unavailable.") from None
    finally:
        engine.dispose()


def _invalidate_code_caches() -> None:
    from civiccode import main as code
    for name in ("_section_lifecycle_repository", "_ordinance_handoff_repository"):
        repo = getattr(code, name, None)
        if repo is not None:
            repo.engine.dispose()
            setattr(code, name, None)


code_router = APIRouter(prefix="/desktop/v1/code")
meetings_router = APIRouter(prefix="/desktop/v1/meetings")


@code_router.get("/connections")
async def list_connections(actor=Depends(code_actor)):
    return run(store.list_connections)


@code_router.get("/connections/{connection_id}")
async def get_connection(connection_id: Key, actor=Depends(code_actor)):
    return run(store.get_connection, connection_id)


@code_router.post("/connections")
async def create_connection(payload: Proposal, actor=Depends(code_actor)):
    result = run(store.send_proposal, payload.model_dump(mode="json"), actor)
    _invalidate_code_caches()
    return result


@code_router.post("/connections/{connection_id}/closeout")
async def closeout_connection(connection_id: Key, payload: Closeout, actor=Depends(code_actor)):
    result = run(store.close_connection, connection_id, payload.model_dump(mode="json"), actor)
    _invalidate_code_caches()
    return result


@meetings_router.get("/code-connections")
async def list_code_connections(actor=Depends(meeting_actor)):
    return run(store.list_connections)


@meetings_router.get("/code-connections/{connection_id}")
async def get_code_connection(connection_id: Key, actor=Depends(meeting_actor)):
    return run(store.get_connection, connection_id)


@meetings_router.post("/code-connections/{connection_id}/decisions")
async def record_decision(connection_id: Key, payload: Decision, actor=Depends(meeting_actor)):
    result = run(store.record_decision, connection_id, payload.model_dump(mode="json"), actor)
    _invalidate_code_caches()
    return result
