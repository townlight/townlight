"""Staff handoff of a Townlight 311 archive into the existing Records domain."""

from __future__ import annotations

import hashlib
import hmac
import os
import stat
from collections.abc import Mapping
from pathlib import Path
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.desktop_bridge.schemas import AttachDocument, ManagedFileReceipt
from townlight_records.models.records_files import RequestFileEvidence
from townlight_records.models.request import RecordsRequest
from townlight_records.models.user import User
from townlight_records.requests import files, service
from townlight_records.requests.workflow import RecordsActor

from townlight_runtime.service_requests import (
    SERVICE_REQUESTS_PREFIX,
    Actor,
    Db,
    Repository,
    call_repository,
)

router = APIRouter(prefix=SERVICE_REQUESTS_PREFIX)

_RECORDS_MODULE = "townlight_records"
_REQUESTER_NAME = "Townlight311archive"
_ARCHIVE_ROOT = "311"
_REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
_UNAVAILABLE_DETAIL = (
    "Townlight 311 archive handoff to Records is unavailable in this profile."
)


class ArchiveHandoff(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(gt=0, strict=True)
    expected_sha25664: str = Field(pattern=r"^[0-9a-f]{64}$")
    confirm: Literal[True]


class ArchiveHandoffRead(BaseModel):
    records_request_id: str
    tracking: str
    attachment_id: str
    sha256: str
    size: int
    path: str


async def records_handoff_actor(
    request: Request,
    session: Db,
    actor: Actor,
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
) -> User:
    """Use the existing Records native boundary, in addition to the 311 actor."""
    enabled = getattr(request.app.state, "desktop_enabled_modules", ())
    if _RECORDS_MODULE not in enabled:
        raise HTTPException(status_code=403, detail="Records is not enabled in this profile.")
    mapped = await mapped_native_actor(request, session, proof, _RECORDS_MODULE)
    if mapped.id != actor.id:
        raise HTTPException(
            status_code=403,
            detail="The service-request and Records identities do not match.",
        )
    return mapped


HandoffActor = Annotated[User, Depends(records_handoff_actor)]


def _is_reparse_or_symlink(info: os.stat_result) -> bool:
    return stat.S_ISLNK(info.st_mode) or bool(
        getattr(info, "st_file_attributes", 0) & _REPARSE_POINT
    )


def _check_components(root: Path, path: Path, *, final_directory: bool) -> None:
    try:
        relative = path.relative_to(root)
    except ValueError:
        raise ValueError("The staging path is outside the managed Records store.") from None

    current = root
    try:
        root_info = current.lstat()
    except OSError:
        raise ValueError("The managed Records store is unavailable.") from None
    if _is_reparse_or_symlink(root_info) or not stat.S_ISDIR(root_info.st_mode):
        raise ValueError("The managed Records store is not a real directory.")

    for part in relative.parts:
        current = current / part
        try:
            info = current.lstat()
        except FileNotFoundError:
            return
        except OSError:
            raise ValueError("The staging path could not be inspected.") from None
        if _is_reparse_or_symlink(info):
            raise ValueError("Reparse and symlink staging paths are not accepted.")
        if current != path and not stat.S_ISDIR(info.st_mode):
            raise ValueError("The staging path contains a non-directory component.")
    if final_directory:
        try:
            info = path.lstat()
        except OSError:
            raise ValueError("The staging directory is unavailable.") from None
        if _is_reparse_or_symlink(info) or not stat.S_ISDIR(info.st_mode):
            raise ValueError("The staging directory is not a real directory.")


def _ensure_directory(root: Path, directory: Path) -> None:
    _check_components(root, directory, final_directory=False)
    try:
        directory.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise ValueError("The staging directory could not be created.") from None
    _check_components(root, directory, final_directory=True)


def _verify_staged(path: Path, digest: str, size: int) -> None:
    try:
        info = path.lstat()
    except OSError:
        raise ValueError("The staged archive is missing.") from None
    if _is_reparse_or_symlink(info) or not stat.S_ISREG(info.st_mode):
        raise ValueError("The staged archive is not a regular file.")
    if info.st_size != size:
        raise ValueError("The staged archive size does not match its source bytes.")
    hasher = hashlib.sha256()
    try:
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                hasher.update(chunk)
    except OSError:
        raise ValueError("The staged archive could not be read.") from None
    if hasher.hexdigest() != digest:
        raise ValueError("The staged archive hash does not match its source bytes.")


def _stage_archive(profile_root: Path, request_id: UUID, digest: str, content: bytes) -> Path:
    root = files.managed_records_root(profile_root)
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise ValueError("The managed Records store could not be created.") from None
    _check_components(root, root, final_directory=True)
    directory = root / _ARCHIVE_ROOT / str(request_id)
    _ensure_directory(root, directory)
    target = directory / f"{digest}.zip"

    if target.is_symlink() or target.exists():
        _verify_staged(target, digest, len(content))
        return target

    temporary = directory / f".{uuid4().hex}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            os.link(temporary, target)
        except FileExistsError:
            _verify_staged(target, digest, len(content))
        else:
            _verify_staged(target, digest, len(content))
        return target
    except OSError:
        if target.is_symlink() or target.exists():
            _verify_staged(target, digest, len(content))
            return target
        raise ValueError("The archive could not be staged atomically.") from None
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            # The final archive is already verified; a stale temporary name is
            # not treated as a successful handoff or overwritten later.
            pass


def _revision(source: Mapping[str, object]) -> int:
    value = source.get("revision")
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise HTTPException(
            status_code=503,
            detail="The service-request source revision is unavailable.",
        )
    return value


def _advisory_key(identity: str) -> int:
    return int.from_bytes(
        hashlib.sha256(identity.encode("utf-8")).digest()[:8],
        "big",
        signed=True,
    )


@router.post(
    "/requests/{request_id}/records",
    response_model=ArchiveHandoffRead,
)
async def handoff_service_request_to_records(
    request_id: UUID,
    payload: ArchiveHandoff,
    request: Request,
    session: Db,
    actor: HandoffActor,
    repository: Repository,
):
    profile_root = getattr(request.app.state, "desktop_profile_root", None)
    if not isinstance(profile_root, Path):
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)

    source = await call_repository(repository.get_staff, str(request_id))
    if not isinstance(source, Mapping) or _revision(source) != payload.expected_revision:
        raise HTTPException(
            status_code=409,
            detail="The service request changed; refresh it before handing off its archive.",
        )

    content = await call_repository(repository.archive, str(request_id))
    if not isinstance(content, (bytes, bytearray)):
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL)
    content = bytes(content)
    digest = hashlib.sha256(content).hexdigest()
    if not hmac.compare_digest(digest, payload.expected_sha25664):
        raise HTTPException(
            status_code=409,
            detail="The service-request archive changed; refresh it before handoff.",
        )

    current = await call_repository(repository.get_staff, str(request_id))
    if not isinstance(current, Mapping) or _revision(current) != payload.expected_revision:
        raise HTTPException(
            status_code=409,
            detail="The service request changed while its archive was prepared; no handoff was recorded.",
        )

    try:
        staged_path = await run_in_threadpool(
            _stage_archive, profile_root, request_id, digest, content
        )
    except (OSError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="The archive could not be staged safely.",
        ) from exc

    identity = f"311-archive:{request_id}:{digest}"
    title = f"Townlight 311 archive {request_id}"
    citation = (
        f"Townlight 311 service request {request_id}; archive sha256 {digest}."
    )
    original_path = f"townlight311-archive:{request_id}:{digest}"
    source_description = (
        f"Staff archive handoff for Townlight 311 service request {request_id}; "
        f"source revision {payload.expected_revision}; archive sha256 {digest}."
    )
    receipt = ManagedFileReceipt(
        original_path=original_path,
        stored_path=str(staged_path),
        file_name=staged_path.name,
        sha256=digest,
        size_bytes=len(content),
    )
    attachment = AttachDocument(title=title, citation=citation, file=receipt)

    try:
        await session.execute(
            text("SELECT pg_advisory_xact_lock(:lock_key)"),
            {"lock_key": _advisory_key(identity)},
        )
        records_request = await session.scalar(
            select(RecordsRequest).where(RecordsRequest.desktop_id == identity).limit(1)
        )
        if records_request is None:
            records_request = await service.create_native_records_request(
                session,
                service.RequestIntake(
                    requester_name=_REQUESTER_NAME,
                    description=source_description,
                ),
                actor=actor,
                native_role=request.state.native_role,
                deadline_label="No deadline set",
                deadline_basis=(
                    "This is a staff archive handoff from 311; it does not "
                    "set or change a Records response deadline."
                ),
            )
            records_request.desktop_id = identity
            await session.flush()
        elif records_request.requester_name != _REQUESTER_NAME:
            raise ValueError("The existing Records handoff identity has different source data.")

        records_actor = RecordsActor(actor, request.state.native_role)
        await files.attach_document(
            session, records_request, records_actor, attachment, profile_root
        )

        evidence = await session.scalar(
            select(RequestFileEvidence)
            .where(
                RequestFileEvidence.request_id == records_request.id,
                RequestFileEvidence.original_path == original_path,
            )
            .limit(1)
        )
        if (
            evidence is None
            or evidence.title != title
            or evidence.citation != citation
            or records_request.desktop_id != identity
            or not isinstance(records_request.public_tracking_number, str)
            or not records_request.public_tracking_number
        ):
            raise ValueError("Records metadata could not be verified after attachment.")

        await run_in_threadpool(_verify_staged, staged_path, digest, len(content))
        result = ArchiveHandoffRead(
            records_request_id=str(records_request.id),
            tracking=records_request.public_tracking_number,
            attachment_id=str(evidence.id),
            sha256=digest,
            size=len(content),
            path=f"/records?request_id={records_request.id}",
        )
        await session.commit()
        return result
    except HTTPException:
        await session.rollback()
        raise
    except (OSError, TypeError, ValueError) as exc:
        await session.rollback()
        raise HTTPException(
            status_code=422,
            detail="Records archive handoff was not saved.",
        ) from exc
    except SQLAlchemyError as exc:
        await session.rollback()
        raise HTTPException(status_code=503, detail=_UNAVAILABLE_DETAIL) from exc
