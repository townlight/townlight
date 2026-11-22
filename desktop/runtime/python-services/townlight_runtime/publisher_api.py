# SPDX-License-Identifier: AGPL-3.0-only
"""Staff authorization and exact release checks before handing off to the queue."""
import hashlib
import os
import sqlite3
from pathlib import Path
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from townlight_meetings.packet_assembly import PacketAssemblyRepository
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_runtime.meetings_bridge import legal_record, operate
from townlight_runtime.portal_publication import Selection, build_manifest
from townlight_runtime.publisher_queue import PublisherQueue

router = APIRouter(prefix="/desktop/v1/portal/publications", tags=["portal-publisher"])


class PacketApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")
    packet_id: UUID
    approval_id: UUID
    expected_manifest_sha256: str = Field(pattern="^[0-9a-f]{64}$")


class Withdrawal(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: StrictBool


def envelope(meeting_id, kind, action):
    return {"version": 2, "meeting_id": str(meeting_id), "kind": kind, "action": action}


def queue(request):
    return PublisherQueue(request.app.state.desktop_profile_root)


def configured():
    return os.getenv("TOWNLIGHT_SHARED_STAFF_HOST") == "1" and bool(os.getenv("TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN"))


def require_configured():
    if not configured():
        raise HTTPException(503, "The shared Windows host has not configured website publication")


def approved_packet(profile, data):
    from townlight_runtime.council_packet import approved_public_packet

    def read_packet(store):
        packet = store.get(str(data.packet_id))
        if packet is None:
            raise ValueError("No saved packet")
        return approved_public_packet(profile, packet, approval_id=str(data.approval_id))

    approved, directory = legal_record(PacketAssemblyRepository, read_packet)
    meeting = operate("meeting", lambda store: store.get(approved["meeting_id"]))
    if meeting["meeting_type"] in ("closed_session", "executive"):
        raise ValueError("Closed meeting")
    if (approved["audience"] != "public" or approved["packet_id"] != str(data.packet_id)
            or approved["approval_id"] != str(data.approval_id)):
        raise ValueError("Approval identity mismatch")
    record = approved["files"]["packet.pdf"]
    if not 0 < record["size_bytes"] <= 64 * 1024**2:
        raise ValueError("Approved packet changed or too large")
    document = Path(directory, "manifest.json").read_bytes()
    if hashlib.sha256(document).hexdigest() != data.expected_manifest_sha256:
        raise ValueError("Approved packet manifest changed")
    data = dict(envelope(approved["meeting_id"], "packet", "publish"),
                title=approved["title"], scheduled_start=approved["scheduled_start"], agenda=approved["agenda"],
                index=approved.get("index", []),
                artifact_sha256=record["sha256"], artifact_size=record["size_bytes"])
    return data, Path(directory) / "packet.pdf"


@router.post("/packet", status_code=202)
async def publish_packet(data: PacketApproval, request: Request,
                         proof: str | None = Header(default=None, alias="X-Townlight-Session"),
                         session: AsyncSession = Depends(get_async_session)):
    actor = await mapped_native_actor(request, session, proof, "townlight_meetings")
    require_configured()
    try:
        manifest, path = await run_in_threadpool(approved_packet, request.app.state.desktop_profile_root, data)
        return await run_in_threadpool(queue(request).enqueue, manifest, str(actor.id), str(data.approval_id), path)
    except (ValueError, KeyError, TypeError):
        raise HTTPException(409, "The exact approved public packet is unavailable or changed") from None
    except (sqlite3.Error, OSError):
        raise HTTPException(503, "The publication queue is unavailable") from None


@router.post("/recording", status_code=202)
async def publish_recording(data: Selection, request: Request,
                            proof: str | None = Header(default=None, alias="X-Townlight-Session"),
                            session: AsyncSession = Depends(get_async_session)):
    actor = await mapped_native_actor(request, session, proof, "townlight_meetings")
    await mapped_native_actor(request, session, proof, "townlight_records")
    require_configured()
    if data.action != "publish" or not data.approve_publication:
        raise HTTPException(422, "Explicit public recording approval is required")
    try:
        manifest, path = await build_manifest(data, request, session, proof)
        release = manifest["release"]
        projected = dict(envelope(data.meeting_id, "recording", "publish"),
                         title=manifest["title"], scheduled_start=manifest["scheduled_start"],
                         artifact_sha256=release["sha256"], artifact_size=release["size"],
                         media_type=release["media_type"])
        return await run_in_threadpool(queue(request).enqueue, projected, str(actor.id), str(data.release_copy_id), path)
    except (ValueError, KeyError, TypeError, httpx.HTTPError):
        raise HTTPException(409, "The exact approved public recording is unavailable or changed") from None
    except (sqlite3.Error, OSError):
        raise HTTPException(503, "The publication queue is unavailable") from None


@router.post("/{meeting_id}/{kind}/withdraw", status_code=202)
async def withdraw(meeting_id: UUID, kind: Literal["packet", "recording"], data: Withdrawal, request: Request,
                   proof: str | None = Header(default=None, alias="X-Townlight-Session"),
                   session: AsyncSession = Depends(get_async_session)):
    actor = await mapped_native_actor(request, session, proof, "townlight_meetings")
    if kind == "recording":
        await mapped_native_actor(request, session, proof, "townlight_records")
    require_configured()
    if data.confirm is not True:
        raise HTTPException(422, "Explicit withdrawal confirmation is required")
    try:
        return await run_in_threadpool(queue(request).enqueue, envelope(meeting_id, kind, "withdraw"), str(actor.id))
    except ValueError:
        raise HTTPException(409, "There is no managed publication for this meeting") from None
    except (sqlite3.Error, OSError):
        raise HTTPException(503, "The publication queue is unavailable") from None


@router.get("/{meeting_id}")
async def status(meeting_id: UUID, request: Request,
                 proof: str | None = Header(default=None, alias="X-Townlight-Session"),
                 session: AsyncSession = Depends(get_async_session)):
    await mapped_native_actor(request, session, proof, "townlight_meetings")
    try:
        return {"configured": configured(), "publications": await run_in_threadpool(queue(request).status, meeting_id)}
    except (sqlite3.Error, OSError):
        raise HTTPException(503, "The publication queue is unavailable") from None
