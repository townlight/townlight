"""Booking, session, and registration routes for the desktop parks API."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query
from pydantic import AwareDatetime

from .parks_base import Actor, Repo, _actor_id, _call, router
from .parks_schemas import (
    Booking,
    BookingTransition,
    ReasonRevision,
    Registration,
    Reschedule,
    SessionCreate,
    SessionEdit,
)


@router.get("/bookings")
async def list_bookings(
    repo: Repo,
    actor: Actor,
    resource_id: UUID | None = None,
    household_id: UUID | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return await _call(
        repo.booking_list,
        resource_id=str(resource_id) if resource_id is not None else None,
        household_id=str(household_id) if household_id is not None else None,
        limit=limit,
        offset=offset,
    )


@router.post("/bookings")
async def create_booking(body: Booking, repo: Repo, actor: Actor):
    return await _call(
        repo.booking_create,
        str(body.resource_id),
        str(body.household_id),
        _actor_id(actor),
        body.expected_resource_revision,
        [window.model_dump() for window in body.occurrences],
        body.purpose,
    )


@router.get("/bookings/{booking_id}")
async def get_booking(booking_id: UUID, repo: Repo, actor: Actor):
    return await _call(repo.booking_get, str(booking_id))


@router.post("/bookings/{booking_id}/transition")
async def transition_booking(
    booking_id: UUID,
    body: BookingTransition,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.booking_transition,
        str(booking_id),
        _actor_id(actor),
        body.expected_revision,
        body.state,
        body.reason,
    )


@router.post("/bookings/{booking_id}/reschedule")
async def reschedule_booking(
    booking_id: UUID,
    body: Reschedule,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.booking_reschedule,
        str(booking_id),
        _actor_id(actor),
        body.expected_revision,
        body.starts_at,
        body.ends_at,
        body.reason,
    )


@router.get("/resources/{resource_id}/availability")
async def get_resource_availability(
    resource_id: UUID,
    start: AwareDatetime,
    end: AwareDatetime,
    repo: Repo,
    actor: Actor,
):
    return await _call(repo.availability, str(resource_id), start, end)


@router.get("/sessions")
async def list_sessions(
    repo: Repo,
    actor: Actor,
    program_id: UUID | None = None,
    public_only: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return await _call(
        repo.session_list,
        program_id=str(program_id) if program_id is not None else None,
        public_only=public_only,
        limit=limit,
        offset=offset,
    )


@router.post("/sessions")
async def create_session(body: SessionCreate, repo: Repo, actor: Actor):
    return await _call(
        repo.session_create,
        str(body.program_id),
        _actor_id(actor),
        body.starts_at,
        body.ends_at,
        body.capacity,
        body.fee_cents,
        body.currency,
    )


@router.get("/sessions/{session_id}")
async def get_session(session_id: UUID, repo: Repo, actor: Actor):
    return await _call(repo.session_get, str(session_id))


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: UUID,
    body: SessionEdit,
    repo: Repo,
    actor: Actor,
):
    changes: dict[str, object] = {}
    if body.capacity is not None:
        changes["capacity"] = body.capacity
    if body.state is not None:
        changes["state"] = body.state
    if body.starts_at is not None:
        changes["starts_at"] = body.starts_at
    if body.ends_at is not None:
        changes["ends_at"] = body.ends_at
    return await _call(
        repo.session_update,
        str(session_id),
        _actor_id(actor),
        body.expected_revision,
        **changes,
    )


@router.get("/sessions/{session_id}/roster")
async def get_session_roster(session_id: UUID, repo: Repo, actor: Actor):
    return await _call(repo.roster, str(session_id))


@router.post("/registrations")
async def create_registration(body: Registration, repo: Repo, actor: Actor):
    return await _call(
        repo.registration_create,
        str(body.session_id),
        str(body.participant_id),
        _actor_id(actor),
        body.expected_session_revision,
    )


@router.get("/registrations/{registration_id}")
async def get_registration(registration_id: UUID, repo: Repo, actor: Actor):
    return await _call(repo.registration_get, str(registration_id))


@router.post("/registrations/{registration_id}/cancel")
async def cancel_registration(
    registration_id: UUID,
    body: ReasonRevision,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.registration_cancel,
        str(registration_id),
        _actor_id(actor),
        body.expected_revision,
        body.reason,
    )


@router.post("/registrations/{registration_id}/check-in")
async def check_in_registration(
    registration_id: UUID,
    body: ReasonRevision,
    repo: Repo,
    actor: Actor,
):
    return await _call(
        repo.registration_check_in,
        str(registration_id),
        _actor_id(actor),
        body.expected_revision,
    )


@router.get("/households/{household_id}/registrations")
async def list_household_registrations(
    household_id: UUID,
    repo: Repo,
    actor: Actor,
):
    return await _call(repo.registrations_for_household, str(household_id))
