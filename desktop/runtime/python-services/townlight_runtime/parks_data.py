"""Explicitly reviewed public aggregates of parks and recreation data."""
from __future__ import annotations

import base64
import hashlib
import io
import json
import sqlite3
import uuid
import zipfile
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
from townlight_runtime.parks_base import Actor, Db, Repo, _call
from townlight_runtime.parks_data_model import (
    ParksPublicationRevision as Revision,
)
from townlight_runtime.publisher_api import envelope, queue, require_configured

router = APIRouter(prefix="/desktop/v1/municipal-staff/data/parks")
STREAM = "f74f2c30-37b8-4b35-93b4-d0e7184355e7"
LOCK = text("SELECT pg_advisory_xact_lock(1275449969)")
FIELDS = [PublicField(key, kind, description) for key, kind, description in (
    ("metric", "text", "Recreation metric"),
    ("state", "text", "Reporting state"),
    ("count", "integer", "Number of observations"),
    ("amount_cents", "integer", "Amount in cents"),
    ("minutes", "integer", "Minutes recorded"),
)]
ROW_KEYS = frozenset(("metric", "state", "count", "amount_cents", "minutes"))
MAX_TEXT = 200


async def data_actor(request: Request, session: Db, actor: Actor,
                     proof: str | None = Header(default=None, alias="X-Townlight-Session")) -> User:
    if "townlight_data" not in getattr(request.app.state, "desktop_enabled_modules", ()):
        raise HTTPException(403, "Townlight Data is not enabled.")
    mapped = await mapped_native_actor(request, session, proof, "townlight_data")
    if mapped.id != actor.id:
        raise HTTPException(403, "The module identities do not match.")
    return mapped


DataActor = Annotated[User, Depends(data_actor)]


def _invalid_aggregate() -> HTTPException:
    return HTTPException(422, "The parks aggregate report could not be validated.")


def validate_rows(rows):
    if not isinstance(rows, list):
        raise _invalid_aggregate()
    validated = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != ROW_KEYS:
            raise _invalid_aggregate()
        metric = row["metric"]
        state = row["state"]
        if not isinstance(metric, str) or not isinstance(state, str):
            raise _invalid_aggregate()
        if not metric or not state or len(metric) > MAX_TEXT or len(state) > MAX_TEXT:
            raise _invalid_aggregate()
        for key in ("count", "amount_cents", "minutes"):
            value = row[key]
            if isinstance(value, bool) or not isinstance(value, int) or value < 0:
                raise _invalid_aggregate()
        validated.append({
            "metric": metric,
            "state": state,
            "count": row["count"],
            "amount_cents": row["amount_cents"],
            "minutes": row["minutes"],
        })
    return validated


async def aggregate_requests(repository):
    rows = await _call(repository.aggregate_report)
    return validate_rows(rows)


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
async def preview(request: Request, session: Db, actor: DataActor, repository: Repo):
    rows = await aggregate_requests(repository)
    artifact = await run_in_threadpool(dataset_bytes, rows)
    revision = Revision(id=uuid.uuid4(), created_at=datetime.now(datetimeUTC), saved_by=actor.id,
                        approved_by=None, approved_at=None,
                        sha256=hashlib.sha256(artifact).hexdigest(), inner_zip=artifact)
    session.add(revision)
    await audit(session, actor, "preview-parks-data", "dataset-revision", revision.id)
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
        manifest = {**envelope(STREAM, "dataset", "publish"),
                    "title": "Parks and recreation statistics",
                    "artifact_sha256": row.sha256, "artifact_size": len(row.inner_zip)}
        receipt = await run_in_threadpool(enqueue_dataset, publisher, manifest,
                                         str(actor.id), str(row.id), row.inner_zip)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "The publication queue is unavailable.") from exc
    if row.approved_at is None:
        row.approved_at = datetime.now(datetimeUTC)
        row.approved_by = actor.id
        await audit(session, actor, "approve-parks-data", "dataset-revision", row.id)
    await session.commit()
    return receipt
