"""Preserve native Access reviews without re-running or rewriting findings."""
from pydantic import BaseModel, ConfigDict, Field
import sqlalchemy as sa

from civicsuite_runtime.access_bridge import reviews, review_advice, audit_events, legacy_audit_ids
from civicsuite_runtime.records_import import stable_id
from civicsuite_runtime.records_import_store import timestamp


class Finding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str
    severity: str
    message: str
    fix: str
    wcag_reference: str


class Review(BaseModel):
    model_config = ConfigDict(extra="forbid")
    review_id: str
    title: str
    body: str
    has_alt_text: bool = False
    language: str = ""
    status: str = ""
    findings: list[Finding] = Field(default_factory=list)
    disclaimer: str = ""
    ai_analysis: str | None = None
    ai_analysis_model: str | None = None
    created_at_unix_seconds: int


class Event(BaseModel):
    model_config = ConfigDict(extra="forbid")
    event_id: str
    action: str
    subject_id: str | None
    actor: str
    created_at_unix_seconds: int


async def import_access(session, root, data):
    if set(data) - {"reviews", "audit_events"}:
        raise ValueError("Unknown Access history field; refusing lossy import.")
    items = [Review.model_validate(row, strict=True) for row in data.get("reviews", [])]
    events = [Event.model_validate(row, strict=True) for row in data.get("audit_events", [])]
    if len({row.review_id for row in items}) != len(items) or len({row.event_id for row in events}) != len(events):
        raise ValueError("Duplicate Access history identity.")
    if await session.scalar(sa.select(sa.func.count()).select_from(reviews)) or await session.scalar(sa.select(sa.func.count()).select_from(audit_events)):
        raise ValueError("Access database is not empty; no overwrite accepted.")
    for row in items:
        canonical_id = stable_id(root, "access-review", row.review_id)
        await session.execute(reviews.insert().values(review_id=canonical_id,
            **row.model_dump(exclude={"review_id", "ai_analysis", "ai_analysis_model", "created_at_unix_seconds"}),
            created_at=timestamp(row.created_at_unix_seconds)))
        await session.execute(review_advice.insert().values(review_id=canonical_id, legacy_id=row.review_id,
            ai_analysis=row.ai_analysis, ai_analysis_model=row.ai_analysis_model, ai_outcome="legacy-preserved"))
    # Legacy event and subject labels are historical evidence, not API target IDs.
    # The current engine's event_id field is bounded to UUID-length strings.
    for row in events:
        event_id = row.event_id
        if len(row.event_id) > 36:
            event_id = stable_id(root, "access-audit", row.event_id)
            await session.execute(legacy_audit_ids.insert().values(event_id=event_id, legacy_id=row.event_id))
        await session.execute(audit_events.insert().values(
            **row.model_dump(exclude={"event_id", "created_at_unix_seconds"}), event_id=event_id,
            created_at=timestamp(row.created_at_unix_seconds)))
    return len(items)
