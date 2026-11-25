"""Explicitly reviewed public aggregates of private service requests."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import sqlite3
import uuid
import zipfile
from collections import Counter
from datetime import UTC as datetimeUTC
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select, text
from starlette.concurrency import run_in_threadpool
from townlight_data.public_dataset import PublicField, build_public_dataset
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.models.user import User

from townlight_runtime.data_staff import audit, configured, enqueue_dataset
from townlight_runtime.publisher_api import envelope, queue, require_configured
from townlight_runtime.service_request_data_model import (
    ServiceRequestPublicationRevision as Revision,
)
from townlight_runtime.service_requests import Actor, Db, Repository, call_repository

router = APIRouter(prefix="/desktop/v1/municipal-staff/data/service-requests")
STREAM = "539b73ba-08dd-47fc-bdcc-e269b3a3688f"
LOCK = text("SELECT pg_advisory_xact_lock(1275449968)")
FIELDS = [PublicField(key, kind, description) for key, kind, description in (
    ("category", "text", "Service category"),
    ("department", "text", "Responsible department"),
    ("state", "text", "Workflow state"),
    ("count", "integer", "Number of service requests"),
)]


async def data_actor(request: Request, session: Db, actor: Actor,
                     proof: str | None = Header(default=None, alias="X-Townlight-Session")) -> User:
    if "townlight_data" not in getattr(request.app.state, "desktop_enabled_modules", ()):
        raise HTTPException(403, "Townlight Data is not enabled.")
    mapped = await mapped_native_actor(request, session, proof, "townlight_data")
    if mapped.id != actor.id:
        raise HTTPException(403, "The module identities do not match.")
    return mapped


DataActor = Annotated[User, Depends(data_actor)]


async def aggregate_requests(repository):
    counts = Counter()
    offset = 0
    while offset < 10_000:
        page = await call_repository(repository.list_requests, limit=200, offset=offset)
        for row in page:
            counts[(row["category"], row["department"], row["state"])] += 1
        offset += len(page)
        if len(page) < 200:
            break
    if offset >= 10_000 and await call_repository(repository.list_requests, limit=1, offset=offset):
        raise HTTPException(413, "The aggregate source exceeds 10000 requests.")
    return [{"category": category, "department": department, "state": state, "count": count}
            for (category, department, state), count in sorted(counts.items())]


def dataset_bytes(rows):
    try:
        members = build_public_dataset(FIELDS, rows)
    except ValueError as exc:
        raise HTTPException(422, "The aggregate dataset could not be validated.") from exc
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
        for name, content in sorted(members.items()):
            archive.writestr(zipfile.ZipInfo(name), content)
    return output.getvalue()


@router.post("/preview")
async def preview(request: Request, session: Db, actor: DataActor, repository: Repository):
    rows = await aggregate_requests(repository)
    artifact = await run_in_threadpool(dataset_bytes, rows)
    revision = Revision(id=uuid.uuid4(), created_at=datetime.now(datetimeUTC), saved_by=actor.id,
                        approved_by=None, approved_at=None,
                        sha256=hashlib.sha256(artifact).hexdigest(), inner_zip=artifact)
    session.add(revision)
    await audit(session, actor, "preview-service-request-data", "dataset-revision", revision.id)
    result = {"id": str(revision.id), "sha256": revision.sha256, "rows": rows}
    await session.commit()
    return result


@router.get("")
async def status(request: Request, session: Db, actor: DataActor):
    revisions = (await session.execute(select(Revision).order_by(
        Revision.created_at.desc(), Revision.id.desc()).limit(30))).scalars().all()
    publications = []
    if configured():
        try:
            publications = await run_in_threadpool(queue(request).status, STREAM)
        except (OSError, sqlite3.Error) as exc:
            raise HTTPException(503, "The publication queue is unavailable.") from exc
    return {"configured": configured(), "publications": publications, "revisions": [
        {"id": str(row.id), "sha256": row.sha256, "created_at": row.created_at,
         "approved_at": row.approved_at} for row in revisions]}


@router.get("/revisions/{revision_id}")
async def revision(revision_id: uuid.UUID, session: Db, actor: DataActor):
    row = await session.get(Revision, revision_id)
    if row is None:
        raise HTTPException(404, "Dataset revision not found.")
    if hashlib.sha256(row.inner_zip).hexdigest() != row.sha256:
        raise HTTPException(409, "The stored dataset failed verification.")
    with zipfile.ZipFile(io.BytesIO(row.inner_zip)) as archive:
        rows = json.loads(archive.read("dataset.json"))
    return {"id": str(row.id), "sha256": row.sha256, "rows": rows,
            "content_base64": base64.b64encode(row.inner_zip).decode("ascii"),
            "size": len(row.inner_zip), "approved_at": row.approved_at}


class Publish(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    expected_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    confirm: StrictBool


@router.post("/publish", status_code=202)
async def publish(payload: Publish, request: Request, session: Db, actor: DataActor):
    if getattr(request.state, "native_role", None) != "local-admin":
        raise HTTPException(403, "A Townlight administrator must approve public delivery.")
    if payload.confirm is not True:
        raise HTTPException(422, "Confirm publication of the reviewed aggregate.")
    require_configured()
    await session.execute(LOCK)
    row = await session.scalar(select(Revision).order_by(
        Revision.created_at.desc(), Revision.id.desc()).limit(1).with_for_update())
    if row is None or row.id != payload.id or row.sha256 != payload.expected_sha256:
        raise HTTPException(409, "Review the current dataset revision before publication.")
    if hashlib.sha256(row.inner_zip).hexdigest() != row.sha256:
        raise HTTPException(409, "The stored dataset failed verification.")
    publisher = queue(request)
    try:
        history = await run_in_threadpool(publisher.status, STREAM)
        if row.approved_at and any(job["action"] == "withdraw" for job in history):
            raise HTTPException(409, "A withdrawn dataset requires a new preview and approval.")
        manifest = {**envelope(STREAM, "dataset", "publish"), "title": "Public service-request statistics",
                    "artifact_sha256": row.sha256, "artifact_size": len(row.inner_zip)}
        receipt = await run_in_threadpool(enqueue_dataset, publisher, manifest,
                                         str(actor.id), str(row.id), row.inner_zip)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "The publication queue is unavailable.") from exc
    if row.approved_at is None:
        row.approved_at = datetime.now(datetimeUTC)
        row.approved_by = actor.id
        await audit(session, actor, "approve-service-request-data", "dataset-revision", row.id)
    await session.commit()
    return receipt
