from __future__ import annotations

import hashlib
import io
import json
import sqlite3
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import DateTime, LargeBinary, String, schema, select, text
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from starlette.concurrency import run_in_threadpool

from townlight_data.public_dataset import PublicField, build_public_dataset
from townlight_contracts.staff_workflow import agreements
from .municipal_staff import ContractActor, Db, audit, rows
from .publisher_api import configured, envelope, queue, require_configured

MAX_TOTAL_BYTES = 16 * 1024 * 1024


class _Base(DeclarativeBase):
    pass


class ContractPublicationRevision(_Base):
    __tablename__ = "contract_publication_revisions"
    __table_args__ = {"schema": "townlight_data"}

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    saved_by: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    inner_zip: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)


def ensure_data_schema(engine) -> None:
    with engine.begin() as conn:
        conn.execute(schema.CreateSchema("townlight_data", if_not_exists=True))
        _Base.metadata.create_all(conn)


router = APIRouter(prefix="/desktop/v1/municipal-staff/data", tags=["municipal-staff-data"])


class PreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    agreement_ids: Annotated[list[uuid.UUID], Field(min_length=1, max_length=500)]


_FIELDS = [
    ("contract_id", "text", "Agreement identifier"),
    ("title", "text", "Agreement title"),
    ("vendor_name", "text", "Vendor name"),
    ("start_date", "date", "Start date"),
    ("expiration_date", "date", "Expiration date"),
]


@router.post("/preview")
async def preview(
    payload: PreviewRequest,
    request: Request,
    session: Db,
    actor: ContractActor,
) -> dict:
    enabled = getattr(request.app.state, "desktop_enabled_modules", None) or ()
    if "townlight_data" not in enabled:
        raise HTTPException(404, "not_found")

    ids = payload.agreement_ids
    if len(set(ids)) != len(ids):
        raise HTTPException(400, "duplicate_agreement_ids")

    stmt = (
        select(
            agreements.c.id,
            agreements.c.title,
            agreements.c.vendor_name,
            agreements.c.start_date,
            agreements.c.expiration_date,
        )
        .where(agreements.c.id.in_(ids))
        .where(agreements.c.status == "signed")
        .order_by(agreements.c.id.asc())
    )
    raw = await rows(session, stmt)
    if len(raw) != len(ids):
        raise HTTPException(404, "unknown_or_unsigned_agreement")

    fields = [
        PublicField(n, t, d)
        for n, t, d in _FIELDS
    ]
    out_rows = [
        {
            "contract_id": str(r["id"]),
            "title": r["title"],
            "vendor_name": r["vendor_name"],
            "start_date": r["start_date"].isoformat() if r["start_date"] else None,
            "expiration_date": r["expiration_date"].isoformat() if r["expiration_date"] else None,
        }
        for r in raw
    ]

    try:
        dataset = build_public_dataset(fields, out_rows)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        for name, data in dataset.items():
            zf.writestr(zipfile.ZipInfo(name), data)
    zip_bytes = buf.getvalue()
    if len(zip_bytes) > MAX_TOTAL_BYTES:
        raise HTTPException(413, "dataset_too_large")

    revision_id = uuid.uuid4()
    sha256 = hashlib.sha256(zip_bytes).hexdigest()
    session.add(ContractPublicationRevision(
        id=revision_id,
        created_at=datetime.now(timezone.utc),
        saved_by=actor.id,
        approved_by=None,
        approved_at=None,
        sha256=sha256,
        inner_zip=zip_bytes,
    ))
    await audit(
        session,
        actor,
        action="data.preview",
        resource=f"contract_publication_revisions/{revision_id}",
        identity=str(revision_id),
    )

    return {
        "id": str(revision_id),
        "sha256": sha256,
        "fields": [
            {"name": f.name, "data_type": f.data_type, "description": f.description}
            for f in fields
        ],
        "rows": out_rows,
    }



STREAM = "4c05d26f-23e8-47d9-8fe3-3a603f860a9f"
PUBLICATION_LOCK = text("SELECT pg_advisory_xact_lock(1275449967)")


class PublishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    expected_sha256: str = Field(pattern="^[0-9a-f]{64}$")
    confirm: StrictBool


def require_data_admin(request: Request) -> None:
    if "townlight_data" not in request.app.state.desktop_enabled_modules:
        raise HTTPException(403, "Townlight Data is unavailable in this profile.")
    if request.state.native_role != "local-admin":
        raise HTTPException(403, "A Townlight administrator must approve public delivery.")


def enqueue_dataset(publisher, manifest, actor, revision, artifact):
    with TemporaryDirectory() as temporary:
        path = Path(temporary) / "dataset.zip"
        path.write_bytes(artifact)
        return publisher.enqueue(manifest, actor, revision, path)


@router.post("/publish", status_code=202)
async def publish(body: PublishRequest, request: Request, session: Db, actor: ContractActor):
    require_data_admin(request)
    require_configured()
    if body.confirm is not True:
        raise HTTPException(422, "Confirm publication of the reviewed dataset.")
    await session.execute(PUBLICATION_LOCK)
    rev = await session.scalar(
        select(ContractPublicationRevision)
        .order_by(ContractPublicationRevision.created_at.desc(), ContractPublicationRevision.id.desc())
        .limit(1)
    )
    if rev is None or rev.id != body.id or rev.sha256 != body.expected_sha256:
        raise HTTPException(409, "Prepare and review the current dataset revision.")
    digest = hashlib.sha256(rev.inner_zip).hexdigest()
    if digest != rev.sha256:
        raise HTTPException(409, "The preview bytes changed. Prepare a new preview.")
    manifest = dict(
        envelope(STREAM, "dataset", "publish"),
        title="Public contracts register",
        artifact_sha256=digest,
        artifact_size=len(rev.inner_zip),
    )
    publisher = queue(request)
    try:
        latest = await run_in_threadpool(publisher.status, STREAM)
        if rev.approved_at and any(job["action"] == "withdraw" for job in latest):
            raise HTTPException(409, "A withdrawn dataset requires a new preview and approval.")
        status = await run_in_threadpool(
            enqueue_dataset, publisher, manifest, str(actor.id), str(rev.id), rev.inner_zip,
        )
    except (OSError, sqlite3.Error):
        raise HTTPException(503, "The publication queue is unavailable.") from None
    if rev.approved_at is None:
        rev.approved_by = actor.id
        rev.approved_at = datetime.now(timezone.utc)
        await audit(session, actor, "approve-data-publication", "dataset-revision", rev.id)
    return status


class WithdrawRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm: StrictBool


@router.get("")
async def data_status(request: Request, session: Db, actor: ContractActor):
    if "townlight_data" not in (getattr(request.app.state, "desktop_enabled_modules", None) or ()):
        raise HTTPException(404, "not_found")
    choices = await rows(
        session,
        select(agreements.c.id, agreements.c.title, agreements.c.vendor_name)
        .where(agreements.c.status == "signed")
        .order_by(agreements.c.title, agreements.c.id),
    )
    revisions = await rows(
        session,
        select(
            ContractPublicationRevision.id,
            ContractPublicationRevision.created_at,
            ContractPublicationRevision.sha256,
            ContractPublicationRevision.approved_at,
        )
        .order_by(ContractPublicationRevision.created_at.desc(), ContractPublicationRevision.id.desc())
        .limit(30),
    )
    is_configured = configured()
    publications = []
    if is_configured:
        try:
            publications = await run_in_threadpool(queue(request).status, STREAM)
        except (OSError, sqlite3.Error):
            raise HTTPException(503, "The publication queue is unavailable.") from None
    return {"choices": choices, "revisions": revisions, "configured": is_configured, "publications": publications}


@router.post("/withdraw", status_code=202)
async def withdraw_dataset(body: WithdrawRequest, request: Request, session: Db, actor: ContractActor):
    require_data_admin(request)
    require_configured()
    if body.confirm is not True:
        raise HTTPException(422, "Confirm withdrawal of the public dataset.")
    await session.execute(PUBLICATION_LOCK)
    try:
        job = await run_in_threadpool(
            queue(request).enqueue, envelope(STREAM, "dataset", "withdraw"), str(actor.id),
        )
    except ValueError:
        raise HTTPException(409, "There is no publication to withdraw.") from None
    except (OSError, sqlite3.Error):
        raise HTTPException(503, "The publication queue is unavailable.") from None
    await audit(session, actor, "withdraw-data-publication", "dataset", STREAM)
    return job


@router.get("/revisions/{revision_id}")
async def get_revision(revision_id: uuid.UUID, request: Request, session: Db, actor: ContractActor):
    if "townlight_data" not in (getattr(request.app.state, "desktop_enabled_modules", None) or ()):
        raise HTTPException(status_code=404)
    rev = await session.get(ContractPublicationRevision, revision_id)
    if rev is None:
        raise HTTPException(status_code=404)
    with zipfile.ZipFile(io.BytesIO(rev.inner_zip)) as zf:
        loaded_rows = json.loads(zf.read("dataset.json"))
    return {
        "id": str(rev.id),
        "sha256": rev.sha256,
        "fields": [{"name": n, "data_type": t, "description": d} for n, t, d in _FIELDS],
        "rows": loaded_rows,
    }
