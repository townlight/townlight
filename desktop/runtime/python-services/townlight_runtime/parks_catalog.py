"""Catalog, closure, household, and participant routes for desktop parks."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import HTTPException, Query, Request

from townlight_runtime.parks_base import (
    Actor,
    Repo,
    _actor_id,
    _call,
    router,
)
from townlight_runtime.parks_schemas import (
    CatalogEdit,
    CatalogSave,
    Closure,
    HouseholdSave,
    ParticipantEdit,
    ParticipantSave,
    ReasonRevision,
)


@router.get("/catalog/{kind}")
async def list_catalog(
    kind: Literal["resource", "program"],
    repo: Repo,
    actor: Actor,
    public_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    return await _call(
        repo.catalog_list,
        kind,
        public_only=public_only,
        limit=limit,
        offset=offset,
    )


@router.post("/catalog/{kind}")
async def create_catalog_item(
    kind: Literal["resource", "program"],
    body: CatalogSave,
    repo: Repo,
    actor: Actor,
):
    return await _call(repo.catalog_create, kind, _actor_id(actor), body.payload)


@router.get("/catalog/{kind}/{item_id}")
async def get_catalog_item(
    kind: Literal["resource", "program"],
    item_id: UUID,
    repo: Repo,
    actor: Actor,
    public_only: bool = Query(default=False),
):
    return await _call(
        repo.catalog_get,
        kind,
        str(item_id),
        public_only=public_only,
    )


@router.put("/catalog/{kind}/{item_id}")
async def update_catalog_item(
    kind: Literal["resource", "program"],
    item_id: UUID,
    body: CatalogEdit,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.catalog_update,
        kind,
        str(item_id),
        _actor_id(actor),
        body.expected_revision,
        body.payload,
    )


@router.get("/resources/{resource_id}/closures")
async def list_closures(
    resource_id: UUID,
    repo: Repo,
    actor: Actor,
):
    return await _call(repo.closure_list, str(resource_id))


@router.post("/resources/{resource_id}/closures")
async def add_closure(
    resource_id: UUID,
    body: Closure,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.closure_add,
        str(resource_id),
        _actor_id(actor),
        body.expected_revision,
        body.starts_at,
        body.ends_at,
        body.reason,
    )


@router.delete("/resources/{resource_id}/closures/{closure_id}")
async def remove_closure(
    resource_id: UUID,
    closure_id: UUID,
    body: ReasonRevision,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.closure_remove,
        str(resource_id),
        str(closure_id),
        _actor_id(actor),
        body.expected_revision,
        body.reason,
    )


@router.post("/households")
async def create_household(
    request: Request,
    body: HouseholdSave,
    repo: Repo,
    actor: Actor,
):
    key = getattr(request.app.state, "desktop_parks_key", None)
    if not isinstance(key, bytes):
        raise HTTPException(status_code=503, detail="parks unavailable")
    return await _call(repo.household_create, _actor_id(actor), body.payload, key=key)


@router.get("/households")
async def search_households(
    repo: Repo,
    actor: Actor,
    search: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    return await _call(repo.household_search, search, limit, offset)


@router.get("/households/{household_id}")
async def get_household(
    household_id: UUID,
    repo: Repo,
    actor: Actor,
):
    return await _call(repo.household_get, str(household_id))


@router.get("/households/{household_id}/participants")
async def list_participants(
    household_id: UUID,
    repo: Repo,
    actor: Actor,
):
    return await _call(repo.participant_list, str(household_id))


@router.post("/participants")
async def create_participant(
    body: ParticipantSave,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.participant_create,
        str(body.household_id),
        _actor_id(actor),
        body.payload,
    )


@router.put("/participants/{participant_id}")
async def edit_participant(
    participant_id: UUID,
    body: ParticipantEdit,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.participant_update,
        str(participant_id),
        _actor_id(actor),
        body.expected_revision,
        body.payload,
    )
