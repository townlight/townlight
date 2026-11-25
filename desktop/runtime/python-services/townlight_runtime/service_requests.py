"""Native staff API adapter for the Townlight 311 service-request repository."""

from __future__ import annotations

import base64
import binascii
import hashlib
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from townlight_311.workflow import (
    Conflict,
    InvalidInput,
    NotFound,
    ServiceRequestRepository,
    Unauthorized,
)
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

from townlight_runtime.native_accounts import account_snapshot
from townlight_runtime.native_accounts import accounts as native_account_links

SERVICE_REQUESTS_PREFIX = "/desktop/v1/service-requests"
SERVICE_REQUESTS_MODULE = "townlight_311"
ASSIGNABLE_PRIORITIES = frozenset({"low", "normal", "high", "urgent"})
_ASSIGNABLE_NATIVE_ROLES = frozenset({"local-admin", "city-staff", "clerk"})
_MAX_ATTACHMENT_BASE64 = 13_981_016
_MAX_ASSIGNEE_CANDIDATES = 1000
_UNAVAILABLE_DETAIL = (
    "Townlight 311 service requests are unavailable in this profile."
)
_RECORD_LOOKUP_DETAIL = "Record not found."

router = APIRouter(prefix=SERVICE_REQUESTS_PREFIX)
Db = Annotated[AsyncSession, Depends(get_async_session)]


class CategorySave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=255)
    department: str = Field(min_length=1, max_length=255)
    active: bool = True


class ServiceRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=8000)
    location: str = Field(min_length=1, max_length=1000)
    contact: dict[str, str]
    resident_token: str = Field(min_length=32, max_length=128)
    idempotency_key: str = Field(min_length=1, max_length=128)


class ServiceRequestTransition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(gt=0)
    target: str = Field(min_length=1, max_length=32)
    reason: str = Field(min_length=1, max_length=10000)
    department: str | None = Field(default=None, min_length=1, max_length=255)
    assignee: str | None = Field(default=None, min_length=1, max_length=255)
    priority: Literal["low", "normal", "high", "urgent"] | None = None
    due_at: datetime | None = None
    duplicate_of: UUID | None = None


class ServiceRequestComment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(gt=0)
    message: str = Field(min_length=1, max_length=10000)
    public: bool = False


class ServiceRequestAttachment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=255)
    media_type: str = Field(min_length=1, max_length=127)
    content_base64: str = Field(min_length=1, max_length=_MAX_ATTACHMENT_BASE64)
    public: bool = False


class RecordLookup(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: Literal["parcel", "permit", "inspection"]
    identifier: str = Field(min_length=1, max_length=255)
    jurisdiction: str | None = Field(default=None, max_length=255)


class RecordLink(RecordLookup):
    expected_revision: int = Field(gt=0)
    confirm: Literal[True]


def service_request_repository(request: Request) -> ServiceRequestRepository:
    repository = getattr(request.app.state, "desktop_service_requests", None)
    if repository is None:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)
    return repository


Repository = Annotated[ServiceRequestRepository, Depends(service_request_repository)]


async def service_request_actor(
    request: Request,
    session: Db,
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
) -> User:
    return await mapped_native_actor(request, session, proof, SERVICE_REQUESTS_MODULE)


Actor = Annotated[User, Depends(service_request_actor)]


async def service_request_admin(request: Request, actor: Actor) -> User:
    if getattr(request.state, "native_role", None) != "local-admin":
        raise HTTPException(
            status_code=403,
            detail="A Townlight administrator must change the service-request catalog.",
        )
    return actor


AdminActor = Annotated[User, Depends(service_request_admin)]
ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]


async def call_repository(method: Any, *args: Any, **kwargs: Any) -> Any:
    """Run the synchronous repository off the event loop and translate its errors."""
    try:
        return await run_in_threadpool(method, *args, **kwargs)
    except InvalidInput as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Conflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Unauthorized as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc


def audit_actor(actor: User) -> str:
    return str(actor.id)


def _record_lookup_error() -> HTTPException:
    return HTTPException(status_code=404, detail=_RECORD_LOOKUP_DETAIL)


async def _resolve_record_lookup(
    request: Request,
    proof: str | None,
    payload: RecordLookup,
) -> dict[str, Any]:
    headers: dict[str, str] = {}
    if proof is not None:
        headers["X-Townlight-Session"] = proof

    record_id: str | None = None
    transport = httpx.ASGITransport(app=request.app)
    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url="http://townlight-internal",
            timeout=30.0,
            trust_env=False,
        ) as client:
            if payload.kind in ("permit", "inspection"):
                try:
                    record_id = str(UUID(payload.identifier))
                except ValueError as exc:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "identifier must be a UUID for permit and inspection "
                            "lookups."
                        ),
                    ) from exc
                path = (
                    f"/desktop/v1/permitting/cases/{record_id}"
                    if payload.kind == "permit"
                    else f"/desktop/v1/inspections/cases/{record_id}"
                )
                response = await client.get(path, headers=headers)
            else:
                response = await client.post(
                    "/desktop/v1/zoning/parcels/lookup",
                    json={
                        "jurisdiction": payload.jurisdiction,
                        "query": payload.identifier,
                    },
                    headers=headers,
                )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=503,
            detail="Receiving API unavailable.",
        ) from exc

    if response.status_code >= 400:
        raise HTTPException(
            status_code=response.status_code,
            detail="Receiving module request failed.",
        )

    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Receiving API returned an invalid response.",
        ) from exc

    if not isinstance(data, dict):
        raise HTTPException(
            status_code=502,
            detail="Receiving API returned an invalid response.",
        )

    if payload.kind == "parcel":
        if data.get("status") != "ok":
            raise _record_lookup_error()
        raw_target_id = data.get("parcel_id")
        if not isinstance(raw_target_id, str) or not raw_target_id:
            raise HTTPException(
                status_code=502,
                detail="Receiving API returned an invalid response.",
            )
        try:
            target_id = str(UUID(raw_target_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail="Receiving API returned an invalid response.",
            ) from exc
        if target_id != raw_target_id:
            raise HTTPException(
                status_code=502,
                detail="Receiving API returned an invalid response.",
            )
        label = data.get("label")
        if not isinstance(label, str) or not label:
            label = data.get("address") or data.get("parcel_number")
        if not isinstance(label, str) or not label:
            payload_data = data.get("payload")
            if isinstance(payload_data, dict):
                label = payload_data.get("address") or payload_data.get("parcel_number")
        if not isinstance(label, str) or not label:
            label = target_id
        return {
            "kind": payload.kind,
            "target_id": target_id,
            "label": label,
            "identifier": payload.identifier,
            "jurisdiction": payload.jurisdiction,
        }

    target_id = data.get("entity_id")
    if not isinstance(target_id, str) or not target_id:
        raise HTTPException(
            status_code=502,
            detail="Receiving API returned an invalid response.",
        )
    if payload.kind in ("permit", "inspection"):
        try:
            canonical_entity_id = str(UUID(target_id))
        except ValueError as exc:
            raise HTTPException(
                status_code=502,
                detail="Receiving API returned an invalid response.",
            ) from exc
        if canonical_entity_id != record_id:
            raise HTTPException(
                status_code=502,
                detail="Receiving API returned an invalid response.",
            )
    payload_data = data.get("payload")
    if not isinstance(payload_data, dict):
        payload_data = {}
    label = payload_data.get("project_name") or payload_data.get("property_reference")
    if not isinstance(label, str) or not label:
        label = target_id
    return {
        "kind": payload.kind,
        "target_id": target_id,
        "label": label,
        "identifier": payload.identifier,
        "jurisdiction": payload.jurisdiction,
    }


async def require_active_assignee(
    request: Request, session: AsyncSession, assignee: str | None
) -> None:
    if assignee is None:
        return
    identifier = assignee.strip()
    try:
        user_id = UUID(identifier)
    except (AttributeError, ValueError):
        raise HTTPException(
            status_code=422,
            detail="assignee must identify an active native staff account",
        ) from None

    try:
        # Fetch the account with the User.id UUID/GUID binder first. Joining
        # User.id to native_account_links.user_id in SQLite is unsafe because
        # fastapi-users GUID and SQLAlchemy Uuid render different text forms.
        user = (
            await session.execute(
                select(User)
                .where(
                    User.id == user_id,
                    User.is_active.is_(True),
                    User.is_verified.is_(True),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if user is None:
            raise HTTPException(
                status_code=422,
                detail="assignee must identify an active native staff account",
            )

        # The native-link table owns a typed Uuid column, so bind user.id
        # through that column rather than comparing it to User.id in SQL.
        link = (
            await session.execute(
                select(
                    native_account_links.c.email,
                    native_account_links.c.native_role,
                )
                .where(native_account_links.c.user_id == user.id)
                .limit(1)
            )
        ).first()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc

    if link is None:
        raise HTTPException(
            status_code=422,
            detail="assignee must identify an active native staff account",
        )

    link_email, link_role = link
    normalized_email = str(link_email).strip().lower()
    if str(user.email).strip().lower() != normalized_email:
        raise HTTPException(
            status_code=422,
            detail="assignee must identify an active native staff account",
        )

    root = getattr(request.app.state, "desktop_profile_root", None)
    if root is None:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)
    try:
        _, current_accounts = await run_in_threadpool(account_snapshot, root)
    except (OSError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc

    current = {
        str(item.get("email", "")).strip().lower(): item
        for item in current_accounts
    }
    native = current.get(normalized_email)
    if (
        native is None
        or native.get("active") is not True
        or native.get("role") != link_role
        or native.get("role") not in _ASSIGNABLE_NATIVE_ROLES
    ):
        raise HTTPException(
            status_code=422,
            detail="assignee must identify an active native staff account",
        )


@router.get("/assignees")
async def list_assignees(
    request: Request,
    session: Db,
    actor: Actor,
):
    root = getattr(request.app.state, "desktop_profile_root", None)
    if root is None:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)
    try:
        _, current_accounts = await run_in_threadpool(account_snapshot, root)
    except (OSError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc

    candidates = [
        item
        for item in current_accounts
        if item.get("active") is True
        and item.get("role") in _ASSIGNABLE_NATIVE_ROLES
    ][:_MAX_ASSIGNEE_CANDIDATES]
    if not candidates:
        return []

    emails = [str(item["email"]).strip().lower() for item in candidates]
    try:
        link_rows = (
            await session.execute(
                select(
                    native_account_links.c.email,
                    native_account_links.c.user_id,
                )
                .where(native_account_links.c.email.in_(emails))
                .limit(_MAX_ASSIGNEE_CANDIDATES)
            )
        ).all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc

    linked_ids = {
        str(email).strip().lower(): user_id for email, user_id in link_rows
    }
    user_ids = list({user_id for user_id in linked_ids.values()})
    if not user_ids:
        return []

    try:
        users = (
            await session.execute(select(User).where(User.id.in_(user_ids)))
        ).scalars().all()
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc
    users_by_id = {user.id: user for user in users}

    result: list[dict[str, Any]] = []
    seen: set[UUID] = set()
    for native in candidates:
        email = str(native["email"]).strip().lower()
        user_id = linked_ids.get(email)
        if user_id is None or user_id in seen:
            continue
        user = users_by_id.get(user_id)
        if user is None:
            continue
        try:
            await require_active_assignee(request, session, str(user_id))
        except HTTPException as exc:
            if exc.status_code == 422:
                continue
            raise
        seen.add(user_id)
        full_name = user.full_name
        if not isinstance(full_name, str):
            full_name = str(native.get("name", ""))
        department_id = getattr(user, "department_id", None)
        result.append(
            {
                "id": str(user.id),
                "full_name": full_name,
                "department_id": str(department_id) if department_id is not None else None,
            }
        )

    result.sort(key=lambda item: (item["full_name"], item["id"]))
    return result


@router.get("/categories")
async def list_categories(
    request: Request,
    actor: Actor,
    repository: Repository,
    include_inactive: bool = Query(default=False),
):
    if include_inactive and getattr(request.state, "native_role", None) != "local-admin":
        raise HTTPException(
            status_code=403,
            detail="A Townlight administrator must view inactive categories.",
        )
    return await call_repository(
        repository.categories,
        include_inactive=include_inactive,
    )


@router.post("/categories")
async def save_category(
    payload: CategorySave,
    actor: AdminActor,
    repository: Repository,
):
    return await call_repository(
        repository.save_category,
        payload.code,
        payload.name,
        payload.department,
        payload.active,
        audit_actor(actor),
    )


@router.get("/requests")
async def list_service_requests(
    actor: Actor,
    repository: Repository,
    department: str | None = Query(default=None, min_length=1, max_length=255),
    state: str | None = Query(default=None, min_length=1, max_length=32),
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return await call_repository(
        repository.list_requests,
        department=department,
        state=state,
        limit=limit,
        offset=offset,
    )


@router.post("/requests", status_code=201)
async def create_service_request(
    payload: ServiceRequestCreate,
    actor: Actor,
    repository: Repository,
):
    return await call_repository(
        repository.create_request,
        category=payload.category,
        description=payload.description,
        location=payload.location,
        contact=payload.contact,
        resident_token=payload.resident_token,
        idempotency_key=payload.idempotency_key,
        actor=audit_actor(actor),
    )


@router.get("/requests/{request_id}")
async def get_service_request(
    request_id: UUID,
    actor: Actor,
    repository: Repository,
):
    return await call_repository(repository.get_staff, str(request_id))


@router.post("/requests/{request_id}/transition")
async def transition_service_request(
    request_id: UUID,
    payload: ServiceRequestTransition,
    request: Request,
    session: Db,
    actor: Actor,
    repository: Repository,
):
    await require_active_assignee(request, session, payload.assignee)
    return await call_repository(
        repository.transition,
        str(request_id),
        payload.expected_revision,
        audit_actor(actor),
        payload.target,
        payload.reason,
        department=payload.department,
        assignee=payload.assignee,
        priority=payload.priority,
        due_at=payload.due_at,
        duplicate_of=str(payload.duplicate_of) if payload.duplicate_of else None,
    )


@router.post("/requests/{request_id}/comments")
async def comment_on_service_request(
    request_id: UUID,
    payload: ServiceRequestComment,
    actor: Actor,
    repository: Repository,
):
    return await call_repository(
        repository.add_comment,
        str(request_id),
        payload.expected_revision,
        audit_actor(actor),
        payload.message,
        payload.public,
    )


@router.post("/requests/{request_id}/attachments", status_code=201)
async def attach_to_service_request(
    request_id: UUID,
    payload: ServiceRequestAttachment,
    actor: Actor,
    repository: Repository,
):
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="attachment content_base64 must be valid base64",
        ) from exc
    return await call_repository(
        repository.add_attachment,
        str(request_id),
        payload.expected_revision,
        audit_actor(actor),
        name=payload.name,
        media_type=payload.media_type,
        content=content,
        public=payload.public,
    )


@router.get("/requests/{request_id}/attachments/{attachment_id}")
async def download_service_request_attachment(
    request_id: UUID,
    attachment_id: UUID,
    actor: Actor,
    repository: Repository,
):
    attachment = await call_repository(
        repository.get_attachment_staff,
        str(request_id),
        str(attachment_id),
    )
    content = attachment.get("content")
    media_type = attachment.get("media_type")
    name = attachment.get("name")
    digest = attachment.get("sha256")
    if (
        not isinstance(content, (bytes, bytearray))
        or not isinstance(media_type, str)
        or not isinstance(name, str)
        or not isinstance(digest, str)
    ):
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)

    filename = name.replace('"', "_")
    return Response(
        content=bytes(content),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-SHA256": digest,
            "X-Checksum-SHA256": digest,
            "X-Content-SHA256": digest,
            "Digest": f"sha-256={base64.b64encode(bytes.fromhex(digest)).decode('ascii')}",
            "Cache-Control": "no-store",
        },
    )


@router.get("/requests/{request_id}/archive")
async def archive_service_request(
    request_id: UUID,
    actor: Actor,
    repository: Repository,
):
    content = await call_repository(repository.archive, str(request_id))
    digest = hashlib.sha256(content).hexdigest()
    return Response(
        content=content,
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="service-request-{request_id}.zip"',
            "X-Content-SHA256": digest,
            "Cache-Control": "no-store",
        },
    )


@router.post("/record-lookup")
async def lookup_record(
    payload: RecordLookup,
    request: Request,
    actor: Actor,
    repository: Repository,
    proof: ProofHeader = None,
) -> dict[str, Any]:
    return await _resolve_record_lookup(request, proof, payload)


@router.post("/requests/{request_id}/links")
async def link_service_request_record(
    request_id: UUID,
    payload: RecordLink,
    request: Request,
    actor: Actor,
    repository: Repository,
    proof: ProofHeader = None,
) -> Any:
    resolved = await _resolve_record_lookup(request, proof, payload)
    return await call_repository(
        repository.link_record,
        str(request_id),
        payload.expected_revision,
        audit_actor(actor),
        resolved["kind"],
        resolved["target_id"],
        resolved["label"],
    )