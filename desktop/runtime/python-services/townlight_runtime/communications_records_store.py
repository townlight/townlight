"""Records persistence for communications archive handoffs."""

from __future__ import annotations

from pathlib import Path
from uuid import UUID

from sqlalchemy import select, text
from starlette.concurrency import run_in_threadpool
from townlight_records.desktop_bridge.schemas import AttachDocument, ManagedFileReceipt
from townlight_records.models.records_files import RequestFileEvidence
from townlight_records.models.request import RecordsRequest
from townlight_records.models.user import User
from townlight_records.requests import files, service
from townlight_records.requests.workflow import RecordsActor

from townlight_runtime.service_request_records import _advisory_key, _verify_staged

_REQUESTER_NAME = "TownlightCommunicationsarchive"
_PARKS_REQUESTER_NAME = "TownlightParksarchive"
_PARK_SOURCE_LABELS = {
    "parks-resource": "resource",
    "parks-program": "program",
    "parks-booking": "booking",
    "parks-registration": "registration",
}


async def persist_archive(
    session,
    actor: User,
    native_role: str | None,
    profile_root: Path,
    article_id: UUID | str,
    revision: int,
    digest: str,
    content: bytes,
    staged_path: Path,
    *,
    source: str = "communications",
) -> dict:
    """Persist one verified archive into the existing Records domain."""
    if source != "communications" and source not in _PARK_SOURCE_LABELS:
        raise ValueError("The archive source is not supported.")
    if source == "communications":
        identity = f"communications-archive:{article_id}:{revision}:{digest}"
        original_path = f"townlight-comms-archive:{article_id}:{revision}:{digest}"
        requester_name = _REQUESTER_NAME
        title = f"Townlight communications archive {article_id}"
        citation = (
            f"Townlight communications article {article_id}; revision {revision}; "
            f"archive sha256 {digest}."
        )
        source_description = (
            f"Staff archive handoff for Townlight communications article {article_id}; "
            f"source revision {revision}; archive sha256 {digest}."
        )
        deadline_basis_source = "communications"
    else:
        source_label = _PARK_SOURCE_LABELS[source]
        identity = f"{source}-archive:{article_id}:{revision}:{digest}"
        original_path = (
            f"townlight-{source}-archive:{article_id}:{revision}:{digest}"
        )
        requester_name = _PARKS_REQUESTER_NAME
        title = f"Townlight Parks {source_label} archive {article_id}"
        citation = (
            f"Townlight Parks {source_label} entity {article_id}; "
            f"revision {revision}; archive sha256 {digest}."
        )
        source_description = (
            f"Staff archive handoff for Townlight Parks {source_label} article "
            f"{article_id}; source revision {revision}; archive sha256 {digest}."
        )
        deadline_basis_source = f"Townlight Parks {source_label}"
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
                    requester_name=requester_name,
                    description=source_description,
                ),
                actor=actor,
                native_role=native_role,
                deadline_label="No deadline set",
                deadline_basis=(
                    f"This is a staff archive handoff from {deadline_basis_source}; "
                    "it does not set or change a Records response deadline."
                ),
            )
            records_request.desktop_id = identity
            await session.flush()
        elif records_request.requester_name != requester_name:
            raise ValueError(
                "The existing Records handoff identity has different source data."
            )

        records_actor = RecordsActor(actor, native_role)
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
        tracking = records_request.public_tracking_number
        if (
            evidence is None
            or evidence.title != title
            or evidence.citation != citation
            or records_request.desktop_id != identity
            or not isinstance(tracking, str)
            or not tracking
        ):
            raise ValueError("Records metadata could not be verified after attachment.")

        await run_in_threadpool(_verify_staged, staged_path, digest, len(content))
        result = {
            "records_request_id": str(records_request.id),
            "tracking": tracking,
            "attachment_id": str(evidence.id),
            "sha256": digest,
            "size": len(content),
            "path": f"/records?request_id={records_request.id}",
        }
        await session.commit()
        return result
    except BaseException:
        await session.rollback()
        raise
