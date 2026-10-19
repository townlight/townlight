"""Native adapter for the existing Access engine and qualified Access tables.

Records does not own a second accessibility implementation or storage blob.
All writes include Access's audit event and the shared actor audit transaction.
"""
from dataclasses import asdict
from datetime import datetime, timezone
from typing import Annotated, Literal
import uuid
import hashlib
import json
from pathlib import Path

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from civicaccess.access_review import (
    accessibility_review_records as reviews, audit_events, review_accessibility,
)
from app.auth.native_identity import mapped_native_actor
from app.audit.logger import write_audit_log
from app.database import get_async_session
from app.models.user import User
from civicaccess import workflows
from civicaccess.access_review import DISCLAIMER
from civicaccess.plain_language import rewrite_plain_language
from civicaccess.multilingual import create_language_variant

router = APIRouter(prefix="/desktop/v1/access", tags=["native-access"])
extension_metadata = sa.MetaData()
legacy_audit_ids = sa.Table(
    "native_legacy_audit_ids", extension_metadata,
    sa.Column("event_id", sa.String(36), primary_key=True),
    sa.Column("legacy_id", sa.Text, nullable=False),
    schema="civicaccess",
)
review_advice = sa.Table(
    "native_review_advice", extension_metadata,
    sa.Column("review_id", sa.String(36), primary_key=True),
    sa.Column("legacy_id", sa.Text),
    sa.Column("ai_analysis", sa.Text),
    sa.Column("ai_analysis_model", sa.String(200)),
    sa.Column("ai_outcome", sa.String(40), nullable=False),
    schema="civicaccess",
)
review_exports = sa.Table(
    "native_review_exports", extension_metadata,
    sa.Column("artifact_id", sa.String(36), primary_key=True),
    sa.Column("review_id", sa.String(36), nullable=False),
    sa.Column("actor_id", sa.String(36), nullable=False),
    sa.Column("sha256", sa.String(64), nullable=False),
    sa.Column("content", sa.Text, nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    sa.Column("export_path", sa.Text),
    schema="civicaccess",
)


def ensure_native_schema(engine):
    # Called only by the existing migration runner, after Access's bootstrap.
    extension_metadata.create_all(engine)


class ReviewInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(default="", max_length=500)
    body: str = Field(default="", max_length=5000)
    hasAltText: bool = False
    language: str = Field(default="en", max_length=80)


class SaveReview(ReviewInput):
    # Native model transport supplies advice, never authoritative findings.
    ai_analysis: str | None = Field(default=None, max_length=100000)
    ai_analysis_model: str | None = Field(default=None, max_length=200)
    ai_outcome: Literal["generated", "unavailable", "failed"]


class ToolInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class FormPlan(ToolInput):
    action: Literal["form-plan"]
    formName: str = Field(default="", max_length=500)
    fields: list[str] = Field(default_factory=list, max_length=50)


class PublishingPlan(ToolInput):
    action: Literal["publishing-workflow"]
    title: str = Field(default="", max_length=500)
    hasReview: bool = False
    hasPlainLanguage: bool = False
    hasTranslationReview: bool = False


class AdaPlan(ToolInput):
    action: Literal["ada-title-ii"]
    serviceArea: str = Field(min_length=1, max_length=500)
    hasCoordinatorReview: bool = False


class TaggedPlan(ToolInput):
    action: Literal["tagged-pdf"]
    headingLevels: list[Annotated[int, Field(ge=0, le=4294967295, strict=True)]] = Field(default_factory=list, max_length=50)


AccessTool = Annotated[FormPlan | PublishingPlan | AdaPlan | TaggedPlan, Field(discriminator="action")]


class RewriteInput(ToolInput):
    action: Literal["plain-language", "language-variant"]
    text: str = Field(min_length=1, max_length=5000)
    language: str = Field(default="", max_length=80)


class RewriteResult(RewriteInput):
    outcome: Literal["generated", "unavailable"]
    generated: str | None = Field(default=None, max_length=100000)
    model: str | None = Field(default=None, max_length=200)


class ExportReceipt(ToolInput):
    export_path: str = Field(min_length=1, max_length=32768)


async def access_actor(request: Request, session: AsyncSession = Depends(get_async_session),
                       proof: str | None = Header(default=None, alias="X-Townlight-Session")) -> User:
    return await mapped_native_actor(request, session, proof, "civicaccess")


def evaluate(data: ReviewInput):
    return review_accessibility(title=data.title, body=data.body,
                                has_alt_text=data.hasAltText, language=data.language or "en")


async def audit(session, actor, action, subject_id, note):
    await session.execute(audit_events.insert().values(
        event_id=str(uuid.uuid4()), action=action, subject_id=subject_id,
        actor=str(actor.id), created_at=datetime.now(timezone.utc)))
    await write_audit_log(session=session, action=action, resource_type="access",
                          resource_id=subject_id, user_id=actor.id,
                          details={"note": note}, commit=False)


async def state(session):
    rows = (await session.execute(sa.select(reviews, review_advice.c.legacy_id, review_advice.c.ai_analysis,
                review_advice.c.ai_analysis_model).outerjoin(review_advice,
                reviews.c.review_id == review_advice.c.review_id)
                .order_by(reviews.c.created_at))).mappings().all()
    result = []
    for row in rows:
        item = dict(row)
        item["canonical_review_id"] = item["review_id"]
        item["review_id"] = item.pop("legacy_id") or item["review_id"]
        item["created_at_unix_seconds"] = int(item.pop("created_at").timestamp())
        result.append(item)
    events = (await session.execute(sa.select(audit_events, legacy_audit_ids.c.legacy_id)
        .outerjoin(legacy_audit_ids, audit_events.c.event_id == legacy_audit_ids.c.event_id)
        .order_by(audit_events.c.created_at))).mappings().all()
    return {"reviews": result, "audit_events": [
        {**{k: v for k, v in row.items() if k not in {"created_at", "legacy_id"}},
         "event_id": row["legacy_id"] or row["event_id"],
         "created_at_unix_seconds": int(row["created_at"].timestamp())} for row in events]}


@router.get("/state")
async def access_state(session: AsyncSession = Depends(get_async_session), actor: User = Depends(access_actor)):
    return await state(session)


@router.post("/review-context")
async def review_context(data: ReviewInput, actor: User = Depends(access_actor)):
    result = evaluate(data)
    findings = "\n".join(f"{f.code} ({f.severity}): {f.message}" for f in result.findings) or "none"
    return {"prompt": (
        "You are helping city staff review a public document for accessibility. "
        "Deterministic checks already produced these findings (do not add or remove findings):\n"
        f"{findings}\n\nDocument title: {data.title}\nLanguage: {data.language or 'en'}\n"
        f"Alt text present: {'yes' if data.hasAltText else 'no'}\nDocument text:\n{data.body}\n\n"
        "Write a short, prioritized remediation analysis for staff: which finding to fix first and why, "
        "plus any plain-language or structure concerns a human reviewer should double-check. "
        "Advisory only; a qualified human reviewer makes the final call.")}


@router.post("/reviews")
async def save_review(data: SaveReview, session: AsyncSession = Depends(get_async_session),
                      actor: User = Depends(access_actor)):
    if data.ai_outcome == "generated":
        if not data.ai_analysis or not data.ai_analysis_model:
            raise HTTPException(422, "Generated advice requires its text and model identity.")
    elif data.ai_analysis is not None or data.ai_analysis_model is not None:
        raise HTTPException(422, "Unavailable/failed AI cannot claim generated advice.")
    result = evaluate(data)
    review_id = str(uuid.uuid4())
    await session.execute(reviews.insert().values(
        review_id=review_id, title=data.title, body=data.body, has_alt_text=data.hasAltText,
        language=data.language or "en", status=result.status,
        findings=[asdict(f) for f in result.findings], disclaimer=result.disclaimer,
        created_at=datetime.now(timezone.utc)))
    await session.execute(review_advice.insert().values(review_id=review_id,
        ai_analysis=data.ai_analysis, ai_analysis_model=data.ai_analysis_model, ai_outcome=data.ai_outcome))
    note = (f"Local AI analysis ({data.ai_analysis_model}) — advisory, human review required:\n{data.ai_analysis}"
            if data.ai_outcome == "generated" else
            "Local AI analysis was skipped (generation failed); the review saved with deterministic findings."
            if data.ai_outcome == "failed" else
            "AI engine not ready — the review saved with deterministic findings only.")
    await audit(session, actor, "review.create", review_id,
                f"Accessibility review {review_id}: {result.status}; AI outcome: {data.ai_outcome}")
    response = {"message": f"Accessibility review saved as {review_id}: {result.status}.\n{note}",
                "next_steps": result.next_steps, "disclaimer": result.disclaimer, "access": await state(session)}
    await session.commit()
    return response


@router.post("/reviews/{review_id}/delete")
async def delete_review(review_id: uuid.UUID, session: AsyncSession = Depends(get_async_session),
                        actor: User = Depends(access_actor)):
    key = str(review_id)
    found = (await session.execute(sa.select(reviews.c.review_id).where(reviews.c.review_id == key).with_for_update())).first()
    if found is None:
        raise HTTPException(404, "Saved accessibility review not found.")
    await session.execute(review_advice.delete().where(review_advice.c.review_id == key))
    await session.execute(reviews.delete().where(reviews.c.review_id == key))
    await audit(session, actor, "review.delete", key, f"Accessibility review {key} deleted; audit retained.")
    response = {"message": "Accessibility review deleted from the saved-review list; audit retained.",
                "access": await state(session)}
    await session.commit()
    return response


@router.post("/tools")
async def tool(data: AccessTool, session: AsyncSession = Depends(get_async_session), actor: User = Depends(access_actor)):
    if isinstance(data, FormPlan):
        result = workflows.build_accessible_form_plan(form_name=data.formName, fields=tuple(data.fields))
        action = "form.plan"
    elif isinstance(data, PublishingPlan):
        result = workflows.build_publishing_workflow_plan(title=data.title, has_review=data.hasReview,
                    has_plain_language=data.hasPlainLanguage, has_translation_review=data.hasTranslationReview)
        action = "publishing.plan"
    elif isinstance(data, AdaPlan):
        result = workflows.build_ada_title_ii_review_plan(service_area=data.serviceArea, has_coordinator_review=data.hasCoordinatorReview)
        action = "ada_title_ii.plan"
    else:
        result = workflows.build_tagged_pdf_expectations(heading_levels=tuple(data.headingLevels))
        action = "tagged_pdf.plan"
    details = asdict(result)
    steps = details.get("checklist", details.get("steps", ()))
    blockers = details.get("blockers", details.get("missing_fields", ()))
    message = f"{data.action}: {result.status}. " + "; ".join(steps)
    if blockers:
        message += " Blockers: " + ", ".join(blockers)
    if result.fix:
        message += " " + result.fix
    await audit(session, actor, action, None, message)
    response = {"message": message, "next_steps": steps, "disclaimer": result.disclaimer,
                "result": details, "access": await state(session)}
    await session.commit()
    return response


@router.post("/rewrite-context")
async def rewrite_context(data: RewriteInput, actor: User = Depends(access_actor)):
    if data.action == "language-variant":
        if not data.language:
            raise HTTPException(422, "Enter the target language.")
        prompt = (f"Translate the following public-facing city text into {data.language}. Keep the meaning exact; "
                  "keep dates, amounts, addresses, and names unchanged. Use plain, resident-friendly wording. "
                  f"Return only the translation, no commentary.\n\nText:\n{data.text}")
    else:
        prompt = ("Rewrite the following public-facing city text in plain language for residents. Keep every fact, "
                  "date, deadline, dollar amount, name, and legal obligation exactly as written. Do not add "
                  f"information that is not in the original. Do not shorten it into a summary.\n\nText:\n{data.text}")
    return {"prompt": prompt}


@router.post("/rewrite-result")
async def rewrite_result(data: RewriteResult, session: AsyncSession = Depends(get_async_session), actor: User = Depends(access_actor)):
    if data.action == "language-variant" and not data.language:
        raise HTTPException(422, "Enter the target language.")
    if data.outcome == "generated":
        if not data.generated or not data.model:
            raise HTTPException(422, "Generated output requires text and model identity.")
        message = f"Local AI {data.action} draft ({data.model}): {data.generated}\nHuman review required before publication."
    else:
        if data.generated is not None or data.model is not None:
            raise HTTPException(422, "Unavailable AI cannot claim generated text.")
        if data.action == "plain-language":
            sample = rewrite_plain_language(data.text)
            message = f"AI engine not ready — deterministic sample only: {sample.rewritten}"
        else:
            sample = create_language_variant(text=data.text, language=data.language)
            message = f"AI engine not ready — sample variant returned. {sample.status}: {sample.text}"
        message += "\nHuman review required before publication."
    action = "plain_language.rewrite" if data.action == "plain-language" else "multilingual.variant"
    await audit(session, actor, action, None, f"{data.action}: {data.outcome}; human review required.")
    response = {"message": message, "disclaimer": DISCLAIMER,
                "next_steps": ["Have a qualified human review before publication."], "access": await state(session)}
    await session.commit()
    return response


@router.post("/reviews/{review_id}/export")
async def prepare_export(review_id: uuid.UUID, session: AsyncSession = Depends(get_async_session), actor: User = Depends(access_actor)):
    row = (await session.execute(sa.select(reviews).where(reviews.c.review_id == str(review_id)).with_for_update())).mappings().first()
    if row is None:
        raise HTTPException(404, "Saved accessibility review not found.")
    findings = "\n".join(f"- **{f['severity']}** {f['message']} — fix: {f['fix']} ({f['wcag_reference']})" for f in row["findings"]) or "- none recorded"
    content = (f"# Records-ready accessibility export\n\nReview id: {review_id}\nTitle: {row['title'] or '(untitled)'}\n"
               f"Status: {row['status']}\nLanguage: {row['language']}\nAlt text: {'present' if row['has_alt_text'] else 'missing'}\n\n"
               f"## Findings\n\n{findings}\n\n## Advisory notice\n\n{row['disclaimer']}\n")
    artifact_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    digest = hashlib.sha256(content.encode()).hexdigest()
    await session.execute(review_exports.insert().values(artifact_id=artifact_id, review_id=str(review_id),
        actor_id=str(actor.id), sha256=digest, content=content, created_at=now))
    await session.commit()
    return {"artifact_id": artifact_id, "file_name": f"access-{artifact_id}.md", "content": content,
            "sha256": digest, "created_at_unix_seconds": int(now.timestamp())}


@router.post("/exports/{artifact_id}/complete")
async def complete_export(artifact_id: uuid.UUID, data: ExportReceipt, request: Request,
                          session: AsyncSession = Depends(get_async_session), actor: User = Depends(access_actor)):
    row = (await session.execute(sa.select(review_exports).where(review_exports.c.artifact_id == str(artifact_id)).with_for_update())).mappings().first()
    if row is None or row["actor_id"] != str(actor.id):
        raise HTTPException(404, "Prepared Access export not found for this actor.")
    # Same configured data location as native file handling, fixed Access directory.
    from app.requests.files import managed_records_root
    try:
        root = managed_records_root(request.app.state.desktop_profile_root).parent.parent / "exports" / "access"
        path = Path(data.export_path).resolve(strict=True)
        if not path.is_relative_to(root.resolve()) or not path.is_file():
            raise ValueError("Outside managed export root")
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        manifest = json.loads(path.with_name(path.name + ".manifest.json").read_text(encoding="utf-8"))
        if (digest != row["sha256"] or manifest.get("sha256") != digest or
                manifest.get("size_bytes") != path.stat().st_size or manifest.get("export_file") != path.name):
            raise ValueError("Invalid bytes or manifest")
        if row["export_path"] and row["export_path"] != str(path):
            raise ValueError("Already finalized elsewhere")
    except (OSError, ValueError, TypeError, AttributeError):
        raise HTTPException(400, "The Access export and integrity manifest do not match the prepared bytes.") from None
    if not row["export_path"]:
        await session.execute(review_exports.update().where(review_exports.c.artifact_id == str(artifact_id)).values(export_path=str(path)))
        await audit(session, actor, "review.records_export", row["review_id"], f"Verified Access export: {path}; sha256 {digest}")
    response = {"message": f"Records-ready accessibility export written and verified at {path}.",
                "access": await state(session)}
    await session.commit()
    return response
