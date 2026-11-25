"""Desktop parks maintenance endpoints.

Maintenance records are owned by the canonical 311 service.  This module
creates the canonical request and links it to a parks resource without
duplicating transition or upload behaviour in the parks API.
"""

from __future__ import annotations

import hashlib
import hmac
from typing import Annotated, Any
from uuid import UUID

from fastapi import HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StrictStr

from townlight_runtime.parks_base import Actor, Repo, _actor_id, _call, router
from townlight_runtime.service_requests import (
    Actor as RequestActor,
)
from townlight_runtime.service_requests import (
    Repository as Requests,
)
from townlight_runtime.service_requests import (
    audit_actor,
    call_repository,
)


class MaintenanceCreate(BaseModel):
    """Strict payload for creating a linked maintenance request."""

    model_config = ConfigDict(extra="forbid")

    command_id: UUID
    category: StrictStr = Field(min_length=1, max_length=64)
    description: StrictStr = Field(min_length=1, max_length=8000)
    contact: dict[StrictStr, StrictStr] = Field(default_factory=dict)


def _resource_snapshot(raw: dict[str, Any]) -> dict[str, Any]:
    """Reduce a catalog row to the fields needed for the 311 location."""
    snapshot = raw["snapshot"]
    return {
        "name": snapshot["name"],
        "address": snapshot["address"],
    }


def _resident_token(http_request: Request, command_id: str) -> str:
    """Create the resident HMAC token without exposing it in responses."""
    key = http_request.app.state.desktop_parks_key
    if not key:
        raise HTTPException(status_code=503, detail="parks key unavailable")

    return hmac.new(
        key,
        command_id.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def _require_same_actor(actor: Any, request_actor: Any) -> None:
    if _actor_id(actor) != str(request_actor.id):
        raise HTTPException(status_code=403, detail="actor mismatch")


@router.post("/resources/{resource_id}/maintenance")
async def create_maintenance(
    resource_id: UUID,
    payload: MaintenanceCreate,
    http_request: Request,
    actor: Actor,
    request_actor: RequestActor,
    repo: Repo,
    requests: Requests,
) -> dict[str, Any]:
    _require_same_actor(actor, request_actor)

    raw_resource = await _call(
        repo.catalog_get,
        "resource",
        str(resource_id),
    )
    snapshot = _resource_snapshot(raw_resource)

    command_id = str(payload.command_id)
    resident_token = _resident_token(http_request, command_id)

    request_record = await call_repository(
        requests.create_request,
        category=str(payload.category),
        description=str(payload.description),
        location=str(snapshot["address"]),
        contact=dict(payload.contact),
        resident_token=resident_token,
        idempotency_key="parks-maintenance:" + command_id,
        actor=audit_actor(actor),
    )
    request_id = request_record["id"]

    current = await call_repository(requests.get_staff, request_id)
    request_record = await call_repository(
        requests.link_record,
        request_id,
        current["revision"],
        audit_actor(actor),
        "parks",
        str(resource_id),
        snapshot["name"],
    )

    link_result = await _call(
        repo.maintenance_link,
        str(resource_id),
        _actor_id(actor),
        request_id,
        command_id,
    )

    link = await _call(repo.maintenance_get, link_result)
    staff_request = await call_repository(requests.get_staff, request_id)
    return {"link": link, "request": staff_request}


@router.get("/resources/{resource_id}/maintenance")
async def list_maintenance(
    resource_id: UUID,
    actor: Actor,
    request_actor: RequestActor,
    repo: Repo,
    requests: Requests,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict[str, Any]]:
    _require_same_actor(actor, request_actor)

    links = await _call(
        repo.maintenance_links,
        str(resource_id),
        limit=limit,
        offset=offset,
    )

    result: list[dict[str, Any]] = []
    for link in links:
        request_id = link["request_id"]
        staff_request = await call_repository(requests.get_staff, request_id)
        result.append({"link": link, "request": staff_request})
    return result


@router.get("/maintenance/{link_id}")
async def get_maintenance(
    link_id: UUID,
    actor: Actor,
    request_actor: RequestActor,
    repo: Repo,
    requests: Requests,
) -> dict[str, Any]:
    _require_same_actor(actor, request_actor)

    link = await _call(repo.maintenance_get, str(link_id))
    request_id = link["request_id"]
    staff_request = await call_repository(requests.get_staff, request_id)
    return {"link": link, "request": staff_request}
