"""Staff API for library program drafting, approval and source handoff."""

from __future__ import annotations

import json
import sqlite3
from typing import Annotated, Any
from uuid import UUID

from civiclibrary.publication import (
    Conflict,
    InvalidInput,
    LibraryPrincipal,
    LibraryPublicationRepository,
    NotFound,
    Unauthorized,
)
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from townlight_comms.models import records_receipts as records
from townlight_comms.models import revisions
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

from .communications_sources import _digest
from .library_schemas import (
    LibraryApproval,
    LibraryCreate,
    LibraryEdit,
    LibraryReceipts,
)

router = APIRouter(prefix="/desktop/v1/library", tags=["library"])

ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]
Db = Annotated[AsyncSession, Depends(get_async_session)]

_MODULE = "library"


def get_repository(request: Request) -> LibraryPublicationRepository:
    repo = getattr(request.app.state, "desktop_library", None)
    if repo is None:
        raise HTTPException(status_code=503, detail="library unavailable")
    return repo


Repo = Annotated[LibraryPublicationRepository, Depends(get_repository)]


async def current_actor(request: Request, session: Db, proof: ProofHeader = None) -> User:
    return await mapped_native_actor(request, session, proof, "townlight_library")


Actor = Annotated[User, Depends(current_actor)]


async def _call(func: Any, *args: Any, **kwargs: Any) -> Any:
    try:
        return await run_in_threadpool(func, *args, **kwargs)
    except InvalidInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Unauthorized as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except (sqlite3.Error, SQLAlchemyError) as exc:
        raise HTTPException(status_code=503, detail="library storage unavailable") from exc


def _actor_id(actor: User) -> str:
    identifier = getattr(actor, "id", None)
    if identifier is None:
        identifier = getattr(actor, "user_id", None)
    if identifier is None:
        identifier = getattr(actor, "subject", None)
    return "" if identifier is None else str(identifier)


def _display_name(actor: User, actor_id: str) -> str:
    for attribute in ("full_name", "email"):
        value = getattr(actor, attribute, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return actor_id


def _native_roles(request: Request) -> frozenset[str]:
    native = getattr(request.state, "native_role", None)
    roles: set[str] = set()
    if native == "clerk":
        roles.add("city-staff")
    elif native in {"city-staff", "local-admin"}:
        roles.add(native)
    return frozenset(roles)


def _principal(actor: User, request: Request) -> LibraryPrincipal:
    actor_id = _actor_id(actor)
    return LibraryPrincipal(
        actor_id=actor_id,
        display_name=_display_name(actor, actor_id),
        roles=_native_roles(request),
    )


def _read_comms(
    engine: Any, article_id: str, article_revision: int
) -> tuple[list[Any], dict[str, Any] | None] | None:
    with engine.connect() as conn:
        row = conn.execute(
            select(revisions.c.source_refs).where(
                revisions.c.article_id == article_id,
                revisions.c.revision == article_revision,
            )
        ).first()
        if row is None:
            return None
        raw = row[0]
        if isinstance(raw, str):
            refs = json.loads(raw)
        elif raw is None:
            refs = []
        else:
            refs = list(raw)
        record = conn.execute(
            select(
                records.c.article_id,
                records.c.revision,
                records.c.archive_sha256,
                records.c.records_id,
                records.c.file_id,
            ).where(
                records.c.article_id == article_id,
                records.c.revision == article_revision,
            )
        ).first()
    receipt = None
    if record is not None:
        receipt = {
            "article_id": str(record[0]),
            "revision": int(record[1]),
            "archive_sha256": record[2],
            "records_id": None if record[3] is None else str(record[3]),
            "file_id": None if record[4] is None else str(record[4]),
        }
    return refs, receipt


@router.get("/items")
async def list_items(actor: Actor, request: Request, repo: Repo) -> Any:
    return await _call(repo.list_items, _principal(actor, request))


@router.post("/items")
async def create_item(
    payload: LibraryCreate, actor: Actor, request: Request, repo: Repo
) -> Any:
    return await _call(repo.create, _principal(actor, request), **payload.model_dump())


@router.get("/items/{identifier}")
async def get_item(
    identifier: UUID,
    actor: Actor,
    request: Request,
    repo: Repo,
    revision: int | None = Query(default=None, ge=1),
) -> Any:
    return await _call(repo.get, _principal(actor, request), str(identifier), revision)


@router.post("/items/{identifier}/revisions")
async def edit_item(
    identifier: UUID,
    payload: LibraryEdit,
    actor: Actor,
    request: Request,
    repo: Repo,
) -> Any:
    data = payload.model_dump(exclude_unset=True)
    expected_revision = data.pop("expected_revision")
    return await _call(
        repo.edit,
        _principal(actor, request),
        str(identifier),
        expected_revision,
        **data,
    )


@router.post("/items/{identifier}/approval")
async def approve_item(
    identifier: UUID,
    payload: LibraryApproval,
    actor: Actor,
    request: Request,
    repo: Repo,
) -> Any:
    return await _call(
        repo.approve,
        _principal(actor, request),
        str(identifier),
        payload.expected_revision,
        payload.expected_sha256,
    )


@router.get("/items/{identifier}/source")
async def item_source(
    identifier: UUID,
    actor: Actor,
    request: Request,
    repo: Repo,
    revision: int | None = Query(default=None, ge=1),
) -> Any:
    return await _call(
        repo.public_snapshot, _principal(actor, request), str(identifier), revision
    )


@router.post("/items/{identifier}/receipts")
async def link_receipts(
    identifier: UUID,
    payload: LibraryReceipts,
    request: Request,
    actor: Actor,
    repo: Repo,
    session: Db,
    proof: ProofHeader = None,
) -> Any:
    principal = _principal(actor, request)
    comms_actor = await mapped_native_actor(request, session, proof, "townlight_comms")
    if _actor_id(comms_actor) != principal.actor_id:
        raise HTTPException(status_code=403, detail="actor mismatch")

    try:
        snapshot = await run_in_threadpool(
            repo.public_snapshot, principal, str(identifier), payload.source_revision
        )
    except NotFound as exc:
        raise HTTPException(
            status_code=409, detail="source revision is not approved"
        ) from exc
    except Unauthorized as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except InvalidInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        raise HTTPException(status_code=503, detail="library storage unavailable") from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="library storage unavailable") from exc

    comms = getattr(request.app.state, "desktop_communications", None)
    engine = getattr(comms, "engine", None)
    if engine is None:
        raise HTTPException(status_code=503, detail="communications unavailable")

    try:
        loaded = await run_in_threadpool(
            _read_comms,
            engine,
            str(payload.article_id),
            payload.article_revision,
        )
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503, detail="communications storage unavailable"
        ) from exc
    except (TypeError, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=503, detail="invalid communications source") from exc

    if loaded is None:
        raise HTTPException(status_code=409, detail="article revision not found")
    if _digest(snapshot["content"]) != snapshot["sha256"]:
        raise HTTPException(status_code=409, detail="source digest does not match")
    refs, receipt = loaded
    expected = {
        "kind": _MODULE,
        "id": str(identifier),
        "revision": snapshot["sha256"],
        "sha256": snapshot["sha256"],
        "title": snapshot["content"]["title"],
        "url": f"/desktop/v1/library/items/{identifier}/source",
        "eligible": True,
    }
    if not any(ref == expected for ref in refs if isinstance(ref, dict)):
        raise HTTPException(status_code=409, detail="source reference does not match")

    return await _call(
        repo.link_receipts,
        principal,
        str(identifier),
        payload.source_revision,
        str(payload.article_id),
        payload.article_revision,
        receipt,
    )


__all__ = ["current_actor", "get_repository", "router"]
