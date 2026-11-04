"""Native transport for Notice-owned staff work and canonical Records evidence."""
import base64
import binascii
import os
from uuid import UUID, NAMESPACE_URL, uuid5

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_notice.workflow import NoticeDraft, NoticeWorkflow, Conflict

router = APIRouter(prefix="/desktop/v1/notice", tags=["native-notice"])


async def actor(request: Request, session: AsyncSession = Depends(get_async_session),
                proof: str | None = Header(default=None, alias="X-Townlight-Session")):
    user = await mapped_native_actor(request, session, proof, "townlight_notice")
    await session.commit()
    return str(user.id)


async def call(operation):
    def run():
        from townlight_runtime.services import _sync_database_url
        engine = create_engine(_sync_database_url(os.environ["DATABASE_URL"]))
        try:
            return operation(NoticeWorkflow(engine, initialize=False))
        finally:
            engine.dispose()
    try:
        return await run_in_threadpool(run)
    except Conflict as error:
        raise HTTPException(409, str(error)) from None
    except LookupError as error:
        raise HTTPException(404, str(error)) from None
    except ValueError as error:
        raise HTTPException(422, str(error)) from None
    except SQLAlchemyError:
        raise HTTPException(503, "Notice storage unavailable. Saved work is retained; check System Health before retrying.") from None


class Version(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    sequence: int = Field(ge=1, strict=True)


class Revision(Version):
    document: NoticeDraft


class Review(Version):
    note: str = Field(min_length=1, max_length=5000)


class Proof(Version):
    filename: str = Field(min_length=1, max_length=150)
    content_base64: str = Field(min_length=1, max_length=7_000_000)
    location: str = Field(min_length=1, max_length=2000)
    published_at: str = Field(min_length=1, max_length=80)


@router.get("/notices")
async def inventory(identity=Depends(actor)):
    return {"notices": await call(lambda store: store.inventory())}


@router.post("/notices", status_code=201)
async def create(document: NoticeDraft, identity=Depends(actor)):
    return await call(lambda store: store.create(document, identity))


@router.get("/notices/{notice_id}")
async def read(notice_id: UUID, identity=Depends(actor)):
    return await call(lambda store: {"notice": store.get(str(notice_id)),
                                     "history": store.history(str(notice_id))})


@router.post("/notices/{notice_id}/revisions")
async def edit(notice_id: UUID, body: Revision, identity=Depends(actor)):
    return await call(lambda store: store.edit(str(notice_id), body.sequence, body.document, identity))


@router.post("/notices/{notice_id}/review")
async def review(notice_id: UUID, body: Review, identity=Depends(actor)):
    return await call(lambda store: store.review(str(notice_id), body.sequence, identity, body.note))


@router.post("/notices/{notice_id}/approval")
async def approve(notice_id: UUID, body: Version, identity=Depends(actor)):
    return await call(lambda store: store.approve(str(notice_id), body.sequence, identity))


@router.post("/notices/{notice_id}/proof")
async def proof(notice_id: UUID, body: Proof, identity=Depends(actor)):
    try:
        content = base64.b64decode(body.content_base64, validate=True)
    except (ValueError, binascii.Error):
        raise HTTPException(422, "Posting proof is not valid encoded file content.") from None
    return await call(lambda store: store.proof(str(notice_id), body.sequence, identity,
        filename=body.filename, content=content, location=body.location, published_at=body.published_at))


@router.post("/notices/{notice_id}/archive")
async def archive(notice_id: UUID, body: Version, identity=Depends(actor)):
    return await call(lambda store: store.archive(str(notice_id), body.sequence, identity))


@router.get("/archives/{archive_id}")
async def export(archive_id: UUID, identity=Depends(actor)):
    item = await call(lambda store: store.get_archive(str(archive_id)))
    return {"archive_id": item["archive_id"], "sha256": item["sha256"],
            "content_base64": base64.b64encode(item["content"]).decode("ascii")}


class Handoff(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: UUID


@router.post("/archives/{archive_id}/records")
async def handoff(archive_id: UUID, body: Handoff, request: Request,
                  session: AsyncSession = Depends(get_async_session), identity=Depends(actor),
                  proof: str | None = Header(default=None, alias="X-Townlight-Session")):
    from townlight_records.desktop_bridge.router import native_records_user
    from townlight_records.desktop_bridge.schemas import AttachDocument, ManagedFileReceipt
    from townlight_records.models.request import RecordsRequest
    from townlight_records.requests import files, workflow
    records_actor = await native_records_user(request, session, proof)
    req = await session.get(RecordsRequest, body.request_id, with_for_update=True)
    if req is None:
        raise HTTPException(404, "Records request not found.")
    item = await call(lambda store: store.get_archive(str(archive_id)))
    identity_key = uuid5(NAMESPACE_URL, f"{req.id}:notice:{archive_id}:{item['sha256']}")
    directory = files.managed_records_root(request.app.state.desktop_profile_root) / "notice" / str(identity_key)
    path = directory / "notice-archive.zip"
    try:
        workflow.ensure_active(req)
        directory.mkdir(parents=True, exist_ok=True)
        try:
            with path.open("xb") as output:
                output.write(item["content"])
                output.flush()
                os.fsync(output.fileno())
        except FileExistsError:
            if path.read_bytes() != item["content"]:
                raise ValueError("Existing archive copy differs; no evidence was overwritten.") from None
        data = AttachDocument(title=f"Notice archive {item['notice_id']}",
            citation=f"Townlight Notice archive {archive_id}; SHA256 {item['sha256']}",
            file=ManagedFileReceipt(original_path=f"townlight-notice:archive:{archive_id}",
                stored_path=str(path), file_name=path.name, sha256=item["sha256"], size_bytes=len(item["content"])))
        message = await files.attach_document(session, req,
            workflow.RecordsActor(records_actor, request.state.native_role), data, request.app.state.desktop_profile_root)
        await session.commit()
        return {"message": message, "request_id": str(req.id), "archive_id": str(archive_id),
                "sha256": item["sha256"], "size_bytes": len(item["content"])}
    except (ValueError, OSError):
        await session.rollback()
        raise HTTPException(422, "Archive handoff not confirmed. Existing evidence retained; refresh Records before retrying.") from None
