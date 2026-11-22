from hashlib import sha256
from sqlite3 import Error as QueueError
from uuid import NAMESPACE_URL, UUID, uuid5

from fastapi import HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from starlette.concurrency import run_in_threadpool

from .budget_export import budget_artifact
from .budget_hearing import canonical_budget_text
from .budget_staff import ActorDep, _readback, router
from .data_staff import enqueue_dataset
from .municipal_staff import Db, audit
from .publisher_api import envelope, queue, require_configured


class PublishBudget(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    confirm: StrictBool


@router.get("/{revision_id}/attachment")
async def read_attachment(revision_id: UUID, session: Db, actor: ActorDep):
    row = await _readback(session, revision_id)
    if row["finance_reviewed_at"] is None:
        raise HTTPException(409, "Review the revision before preparing the hearing attachment.")
    try:
        return {
            "file_name": "budget-revision.txt",
            "text": canonical_budget_text(row),
            "sha256": row["content_sha256"],
        }
    except ValueError as exc:
        raise HTTPException(409, "The stored revision no longer matches its review.") from exc


@router.post("/{revision_id}/publish", status_code=202)
async def publish_budget(
    revision_id: UUID, body: PublishBudget, request: Request, session: Db, actor: ActorDep
):
    if request.state.native_role != "local-admin":
        raise HTTPException(403, "A Townlight administrator must approve public delivery.")
    if body.confirm is not True:
        raise HTTPException(422, "Confirm publication of the adopted budget and resident summary.")
    row = await _readback(session, revision_id)
    if row["adopted_at"] is None or body.content_sha256 != row["content_sha256"]:
        raise HTTPException(409, "Confirm the exact adopted budget revision.")
    require_configured()
    try:
        canonical_budget_text(row)
        artifact = budget_artifact(row)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    fiscal_year = row["fiscal_year"]
    stream = str(uuid5(NAMESPACE_URL, f"townlight:adopted-budget:{fiscal_year}"))
    manifest = dict(
        envelope(stream, "dataset", "publish"),
        title=f"Adopted budget for fiscal year {fiscal_year}",
        artifact_sha256=sha256(artifact).hexdigest(),
        artifact_size=len(artifact),
    )
    try:
        receipt = await run_in_threadpool(
            enqueue_dataset, queue(request), manifest, str(actor.id), str(revision_id), artifact,
        )
    except (OSError, QueueError) as exc:
        raise HTTPException(503, "The publication queue is unavailable.") from exc
    await audit(session, actor, "publish-adopted-budget", "budget-revision", revision_id)
    return receipt
