"""Staff API for the communications draft/review/approval workflow."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import asdict
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from townlight_access.access_review import review_accessibility
from townlight_comms.workflow import (
    CommunicationsRepository,
    Conflict,
    InvalidInput,
    NotFound,
    Unauthorized,
)
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

from .communications_schemas import (
    Approval,
    Draft,
    Review,
    RevisionDraft,
    Schedule,
    SourceLookup,
)
from .communications_sources import resolve_source, verify_sources

router = APIRouter(prefix="/desktop/v1/communications", tags=["communications"])

ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]
Db = Annotated[AsyncSession, Depends(get_async_session)]


def get_repository(request: Request) -> CommunicationsRepository:
    repo = getattr(request.app.state, "desktop_communications", None)
    if repo is None:
        raise HTTPException(status_code=503, detail="communications unavailable")
    return repo


Repo = Annotated[CommunicationsRepository, Depends(get_repository)]


async def current_actor(request: Request, session: Db, proof: ProofHeader = None) -> User:
    return await mapped_native_actor(request, session, proof, "townlight_comms")


Actor = Annotated[User, Depends(current_actor)]


async def _call(func: Any, *args: Any, **kwargs: Any) -> Any:
    """Run a synchronous repository method and translate store errors."""
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
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="communications storage unavailable") from exc


def _actor_id(actor: User) -> str:
    identifier = getattr(actor, "id", None)
    if identifier is None:
        identifier = getattr(actor, "user_id", None)
    if identifier is None:
        identifier = getattr(actor, "subject", None)
    return "" if identifier is None else str(identifier)


def _body_sha256(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _as_finding(result: Any) -> dict[str, Any]:
    return asdict(result)


async def _prepare_save(
    request: Request,
    proof: str | None,
    actor_id: str,
    draft: Draft,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    for selector in draft.sources:
        resolved = await resolve_source(
            request, proof, selector.kind, selector.id
        )
        refs.append(resolved["reference"])

    finding = _as_finding(
        await run_in_threadpool(
            review_accessibility,
            title=draft.title,
            body=draft.body,
            has_alt_text=False,
            language=draft.language,
        )
    )
    access_review = {
        "reviewed": draft.access_reviewed,
        "findings": [finding],
        "status": finding.get("status"),
        "disclaimer": finding.get("disclaimer"),
        "actor": actor_id,
        "body_sha256": _body_sha256(draft.body),
    }
    return refs, access_review


def _field(value: Any, name: str) -> Any:
    if isinstance(value, dict):
        return value.get(name)
    return getattr(value, name, None)


async def _require_current(
    repo: CommunicationsRepository,
    article_id: UUID,
    expected_revision: int,
    expected_sha256: str,
) -> tuple[Any, list[dict[str, Any]]]:
    current = await _call(repo.get, str(article_id))
    revision = _field(current, "current_revision")
    revision_data = _field(current, "revision")
    saved_refs = _field(revision_data, "source_refs")
    current_hash = _field(revision_data, "sha256")

    if revision is None or saved_refs is None or current_hash is None:
        raise HTTPException(status_code=409, detail="revision changed")
    if int(revision) != expected_revision:
        raise HTTPException(status_code=409, detail="revision changed")
    if not hmac.compare_digest(str(current_hash), expected_sha256):
        raise HTTPException(status_code=409, detail="revision changed")
    return current, list(saved_refs)


async def _resolve_saved_snapshots(
    request: Request,
    proof: str | None,
    saved_refs: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    refs: list[dict[str, Any]] = []
    snapshots: list[dict[str, Any]] = []
    for ref in saved_refs:
        if not isinstance(ref, dict):
            raise HTTPException(status_code=409, detail="source changed")
        kind = ref.get("kind")
        identifier = ref.get("id")
        if not isinstance(kind, str) or not isinstance(identifier, str):
            raise HTTPException(status_code=409, detail="source changed")
        resolved = await resolve_source(request, proof, kind, identifier)
        if resolved["reference"] != ref:
            raise HTTPException(status_code=409, detail="source changed")
        refs.append(resolved["reference"])
        snapshots.append(
            {
                "reference": resolved["reference"],
                "content": resolved["content"],
            }
        )
    return refs, snapshots


@router.get("/articles")
async def list_articles(
    request: Request,
    actor: Actor,
    repo: Repo,
    state: str | None = Query(default=None, min_length=1, max_length=32),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100_000),
) -> Any:
    _ = actor
    return await _call(repo.list_articles, state=state, limit=limit, offset=offset)


@router.get("/articles/{article_id}")
async def get_article(
    article_id: UUID,
    actor: Actor,
    repo: Repo,
) -> Any:
    _ = actor
    return await _call(repo.get, str(article_id))


@router.post("/sources/lookup")
async def lookup_source(
    payload: SourceLookup,
    request: Request,
    actor: Actor,
    proof: ProofHeader,
) -> Any:
    _ = actor
    return await resolve_source(
        request, proof, payload.kind, payload.id
    )


@router.post("/access-review")
async def access_review(
    payload: Draft,
    actor: Actor,
    request: Request,
    proof: ProofHeader,
) -> dict[str, Any]:
    _ = actor, request, proof
    finding = _as_finding(
        await run_in_threadpool(
            review_accessibility,
            title=payload.title,
            body=payload.body,
            has_alt_text=False,
            language=payload.language,
        )
    )
    return {
        "finding": finding,
        "status": finding.get("status"),
        "disclaimer": finding.get("disclaimer"),
    }


@router.post("/articles")
async def create_article(
    payload: Draft,
    request: Request,
    actor: Actor,
    repo: Repo,
    proof: ProofHeader,
) -> Any:
    actor_id = _actor_id(actor)
    refs, access_review = await _prepare_save(request, proof, actor_id, payload)
    return await _call(
        repo.create,
        actor_id,
        payload.kind,
        payload.title,
        payload.body,
        payload.language,
        refs,
        access_review,
        payload.translation_provenance,
    )


@router.post("/articles/{article_id}/revisions")
async def create_revision(
    article_id: UUID,
    payload: RevisionDraft,
    request: Request,
    actor: Actor,
    repo: Repo,
    proof: ProofHeader,
) -> Any:
    actor_id = _actor_id(actor)
    refs, access_review = await _prepare_save(request, proof, actor_id, payload)
    return await _call(
        repo.edit,
        str(article_id),
        actor_id,
        payload.expected_revision,
        payload.title,
        payload.body,
        payload.language,
        refs,
        access_review,
        payload.translation_provenance,
    )


@router.post("/articles/{article_id}/review")
async def review_article(
    article_id: UUID,
    payload: Review,
    actor: Actor,
    repo: Repo,
) -> Any:
    return await _call(
        repo.review,
        str(article_id),
        _actor_id(actor),
        payload.expected_revision,
        payload.note,
    )


@router.post("/articles/{article_id}/approval")
async def approve_article(
    article_id: UUID,
    payload: Approval,
    request: Request,
    actor: Actor,
    repo: Repo,
    proof: ProofHeader,
) -> Any:
    _current, saved_refs = await _require_current(
        repo,
        article_id,
        payload.expected_revision,
        payload.expected_sha256,
    )
    refs, snapshots = await _resolve_saved_snapshots(request, proof, saved_refs)
    result = await _call(
        repo.approve,
        str(article_id),
        payload.expected_revision,
        payload.expected_sha256,
        _actor_id(actor),
        refs,
    )
    await _call(
        repo.capture_source_snapshots,
        str(article_id),
        payload.expected_revision,
        payload.expected_sha256,
        snapshots,
    )
    return result


@router.post("/articles/{article_id}/schedule")
async def schedule_article(
    article_id: UUID,
    payload: Schedule,
    request: Request,
    actor: Actor,
    repo: Repo,
    proof: ProofHeader,
) -> Any:
    _current, saved_refs = await _require_current(
        repo,
        article_id,
        payload.expected_revision,
        payload.expected_sha256,
    )
    if payload.action != "withdraw":
        await verify_sources(request, proof, saved_refs)
        stored = await _call(
            repo.get_source_snapshots,
            str(article_id),
            payload.expected_revision,
            payload.expected_sha256,
        )
        if stored is None:
            raise HTTPException(status_code=409, detail="source snapshots unavailable")
        if isinstance(stored, dict):
            stored_hash = stored.get("sha256")
            if stored_hash is not None and not hmac.compare_digest(
                str(stored_hash), payload.expected_sha256
            ):
                raise HTTPException(
                    status_code=409, detail="source snapshots changed"
                )
    return await _call(
        repo.schedule,
        str(article_id),
        payload.expected_revision,
        payload.expected_sha256,
        _actor_id(actor),
        payload.due_at,
        list(payload.channels),
        payload.action,
    )
