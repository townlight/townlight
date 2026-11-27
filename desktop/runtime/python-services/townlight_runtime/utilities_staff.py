"""Staff desktop API for Townlight utility policy workflows."""

from __future__ import annotations

import sqlite3
from collections.abc import Mapping
from typing import Annotated, Any
from uuid import UUID

from civicutility.workflow import (
    UtilityPolicyVersion,
    UtilityPrincipal,
    UtilityWorkflowRepository,
)
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from townlight_311.store import NotFound as RequestNotFound
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

from .utilities_schemas import PolicyApproval as Approval
from .utilities_schemas import PolicyDraft as Draft
from .utilities_schemas import PolicyRegistration
from .utilities_schemas import PolicyRetry as Retry

router = APIRouter(prefix="/desktop/v1/utilities", tags=["utilities"])

Db = Annotated[AsyncSession, Depends(get_async_session)]
ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]

_ROLE_MAP = {
    "clerk": "utilities-clerk",
    "city-staff": "city-staff",
    "local-admin": "local-admin",
}
_CONFLICT_MARKERS = ("stale", "already approved", "delivered", "immutable")
_SAFE_FIELDS = (
    "id",
    "request_id",
    "resident_id",
    "title",
    "description",
    "status",
    "category",
    "location",
    "state",
    "summary",
    "address",
    "jurisdiction",
    "priority",
    "revision",
    "created_at",
    "updated_at",
    "tracking",
    "reference",
)


async def current_actor(
    request: Request,
    session: Db,
    proof: ProofHeader = None,
) -> User:
    modules = getattr(request.app.state, "desktop_enabled_modules", ()) or ()
    if "townlight_utilities" not in modules:
        raise HTTPException(status_code=403, detail="utilities module disabled")
    return await mapped_native_actor(
        request,
        session,
        proof,
        "townlight_utilities",
    )


AnnotatedActor = Annotated[User, Depends(current_actor)]


async def current_principal(
    request: Request,
    actor: AnnotatedActor,
) -> UtilityPrincipal:
    role = _ROLE_MAP.get(getattr(request.state, "native_role", None))
    if role is None:
        raise HTTPException(status_code=403, detail="role not permitted")
    name = (actor.full_name or "").strip()
    if not name:
        raise HTTPException(status_code=403, detail="actor name required")
    return UtilityPrincipal(
        actor_id=str(actor.id),
        display_name=name,
        roles=frozenset({role}),
    )


def get_repository(request: Request) -> UtilityWorkflowRepository:
    repo = getattr(request.app.state, "desktop_utilities", None)
    if repo is None:
        raise HTTPException(status_code=503, detail="utilities unavailable")
    return repo


Principal = Annotated[UtilityPrincipal, Depends(current_principal)]
Repo = Annotated[Any, Depends(get_repository)]


def _is_conflict(message: str) -> bool:
    lowered = message.lower()
    return any(marker in lowered for marker in _CONFLICT_MARKERS)


def _http_error(exc: BaseException) -> HTTPException:
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=403, detail=str(exc) or "forbidden")
    if isinstance(exc, RequestNotFound):
        return HTTPException(status_code=404, detail=str(exc) or "not found")
    if isinstance(exc, KeyError):
        detail = str(exc.args[0]) if exc.args else "not found"
        return HTTPException(status_code=404, detail=detail)
    if isinstance(exc, ValueError):
        message = str(exc)
        if message == "workpaper not found":
            return HTTPException(status_code=404, detail=message)
        if _is_conflict(message):
            return HTTPException(status_code=409, detail=message)
        return HTTPException(status_code=422, detail=message)
    if isinstance(exc, TypeError):
        return HTTPException(status_code=422, detail=str(exc))
    if isinstance(exc, sqlite3.Error):
        return HTTPException(status_code=503, detail="utilities storage unavailable")
    return HTTPException(status_code=500, detail="utilities failure")


async def _call(func: Any, *args: Any) -> Any:
    try:
        normalized = tuple(
            str(value) if isinstance(value, UUID) else value for value in args
        )
        return await run_in_threadpool(func, *normalized)
    except (
        PermissionError,
        RequestNotFound,
        KeyError,
        ValueError,
        TypeError,
        sqlite3.Error,
    ) as exc:
        raise _http_error(exc) from exc


async def _workpaper_or_none(
    repo: Any,
    principal: UtilityPrincipal,
    request_id: UUID,
) -> Any:
    try:
        return await run_in_threadpool(
            repo.get_workpaper,
            principal,
            str(request_id),
        )
    except ValueError as exc:
        if str(exc) == "workpaper not found":
            return None
        raise _http_error(exc) from exc
    except (PermissionError, KeyError, TypeError, sqlite3.Error) as exc:
        raise _http_error(exc) from exc


def _revision(workpaper: Any) -> Any:
    if isinstance(workpaper, Mapping):
        return workpaper.get("revision")
    return getattr(workpaper, "revision", None)


def _safe_projection(value: Any) -> dict[str, Any] | None:
    if value is None:
        return None
    if isinstance(value, Mapping):
        data = dict(value)
    elif hasattr(value, "model_dump"):
        data = value.model_dump()
    else:
        data = {
            key: item
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return {key: data.get(key) for key in _SAFE_FIELDS if key in data}


@router.get("/policies")
async def list_policies(principal: Principal, repo: Repo) -> Any:
    return await _call(repo.list_policies, principal)


@router.post("/policies")
async def register_policy(
    body: PolicyRegistration,
    principal: Principal,
    repo: Repo,
) -> Any:
    if "local-admin" not in principal.roles:
        raise HTTPException(status_code=403, detail="local administrator required")
    version = UtilityPolicyVersion(**body.model_dump())
    return await _call(repo.register_policy, principal, version)


@router.get("/requests/{request_id}")
async def get_request(
    request_id: UUID,
    principal: Principal,
    repo: Repo,
) -> Any:
    await _call(repo.open_request, principal, request_id)
    bridged = await _call(repo.bridge.read_request, principal, request_id)
    workpaper = await _workpaper_or_none(repo, principal, request_id)
    return {"request": _safe_projection(bridged), "workpaper": workpaper}


@router.post("/requests/{request_id}/draft")
async def save_draft(
    request_id: UUID,
    body: Draft,
    principal: Principal,
    repo: Repo,
) -> Any:
    current = await _workpaper_or_none(repo, principal, request_id)
    if current is None:
        if body.expected_revision is not None:
            raise HTTPException(
                status_code=409,
                detail="expected_revision must be null",
            )
    else:
        if body.expected_revision is None:
            raise HTTPException(
                status_code=409,
                detail="expected_revision is required",
            )
        if body.expected_revision != _revision(current):
            raise HTTPException(status_code=409, detail="stale revision")
    return await _call(
        repo.save_draft,
        principal,
        request_id,
        body.policy_id,
        body.policy_version,
        body.body,
        body.private_notes,
        body.expected_revision,
    )


@router.post("/requests/{request_id}/approve")
async def approve_reply(
    request_id: UUID,
    body: Approval,
    principal: Principal,
    repo: Repo,
) -> Any:
    return await _call(
        repo.approve_reply,
        principal,
        request_id,
        body.expected_revision,
    )


@router.post("/requests/{request_id}/retry")
async def retry_reply(
    request_id: UUID,
    body: Retry,
    principal: Principal,
    repo: Repo,
) -> Any:
    current = await _workpaper_or_none(repo, principal, request_id)
    if current is None:
        raise HTTPException(status_code=404, detail="workpaper not found")
    if body.expected_revision != _revision(current):
        raise HTTPException(status_code=409, detail="stale revision")
    return await _call(repo.retry_reply, principal, request_id)
