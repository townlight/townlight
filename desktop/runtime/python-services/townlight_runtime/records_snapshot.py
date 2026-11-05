"""Records milestone's permission-filtered shared snapshot and local search.

Unmigrated products are explicitly unavailable, never read from old JSON.
"""
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from townlight_records.auth.desktop_session import validate_native_session
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.audit.logger import write_audit_log
from townlight_records.database import get_async_session
from townlight_records.desktop_bridge.projection import records_state, epoch
from townlight_records.models.audit import AuditLog
from townlight_records.models.user import User
from townlight_runtime.access_bridge import state as access_state
from townlight_runtime.records_import_store import imports, legacy_audit

router = APIRouter(prefix="/desktop/v1/suite", tags=["native-records-snapshot"])


async def suite_actor(request: Request, session: AsyncSession = Depends(get_async_session),
                      proof: str | None = Header(default=None, alias="X-Townlight-Session")) -> User:
    try:
        principal = validate_native_session(proof, profile_root=request.app.state.desktop_profile_root)
    except PermissionError as error:
        raise HTTPException(401, str(error)) from None
    # The shell snapshot also serves accounts whose only capability is Code,
    # Meetings or a land-use product. Its data projection below still includes
    # Records/Access only when that exact capability is authorized.
    allowed = [module for module in ("townlight_records", "townlight_access", "townlight_code",
               "townlight_meetings", "townlight_notice", "townlight_zoning", "townlight_planning",
               "townlight_permitting", "townlight_inspections")
               if module in request.app.state.desktop_enabled_modules and principal.allows_module(module)]
    if not allowed:
        raise HTTPException(403, "No integrated capability is available to this account.")
    actor = await mapped_native_actor(request, session, proof, allowed[0])
    request.state.native_modules = allowed
    return actor


async def snapshot(session, allowed, actor_id):
    data = {"records_requests": [], "notification_events": [], "publication_events": [], "audit_entries": [],
            "access": {"reviews": [], "audit_events": []},
            "unavailable_modules": ["townlight_meetings", "townlight_code", "meeting-notices"],
            "authority": "python-records"}
    if "townlight_records" in allowed:
        data.update((await records_state(session)).model_dump())
    if "townlight_access" in allowed:
        data["access"] = await access_state(session)
    resource_types = (["request"] if "townlight_records" in allowed else []) + (["access"] if "townlight_access" in allowed else [])
    audits = (await session.execute(select(AuditLog).where(
        AuditLog.resource_type.in_(resource_types) |
        ((AuditLog.resource_type == "native-search") & (AuditLog.user_id == actor_id))
    ).order_by(AuditLog.id.desc()))).scalars().all()
    data["audit_entries"] = [dict(id=f"sql-audit-{row.id}",
        module_id={"request":"townlight_records", "access":"townlight_access"}.get(row.resource_type, "townlight_core"),
        action=row.action, summary=str((row.details or {}).get("note", row.action)),
        created_at_unix_seconds=epoch(row.timestamp), previous_hash=row.prev_hash, entry_hash=row.entry_hash) for row in audits]
    # Legacy hashes retain their original algorithm and identities, not SQL hashes.
    historical = (await session.execute(select(legacy_audit).where(
        legacy_audit.c.module_id.in_(allowed)).order_by(legacy_audit.c.position))).mappings().all()
    data["audit_entries"] = [dict(id=row["legacy_id"], **{key:row[key] for key in
        ("module_id", "action", "summary", "created_at_unix_seconds", "previous_hash", "entry_hash")})
        for row in historical] + data["audit_entries"]
    data["demo_fixture"] = await session.scalar(select(imports.c.demo_fixture).limit(1))
    return data


@router.get("/state")
async def suite_state(request: Request, session: AsyncSession = Depends(get_async_session), actor: User = Depends(suite_actor)):
    return await snapshot(session, request.state.native_modules, actor.id)


class SearchInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    query: str = Field(min_length=1, max_length=5000)


def values(value):
    if isinstance(value, dict):
        return " ".join(values(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(values(v) for v in value)
    return "" if value is None else str(value)


@router.post("/search")
async def search(data: SearchInput, request: Request, session: AsyncSession = Depends(get_async_session), actor: User = Depends(suite_actor)):
    current = await snapshot(session, request.state.native_modules, actor.id)
    query = data.query.lower()
    results = []
    fields = ("requester", "summary", "status", "assigned_to", "deadline", "deadline_basis", "fee_estimate",
              "fee_waiver_reason", "fee_line_items", "response_draft", "citations", "messages", "documents",
              "release_packages", "clarification_notes", "search_notes", "search_sessions", "exemption_reviews",
              "exemption_decisions", "approval_notes", "timeline", "public_status_events")
    for row in current["records_requests"]:
        if any(query in values(row.get(key)).lower() for key in fields):
            results.append(dict(module_id="townlight_records", record_id=row["id"], title=f"Records request: {row['requester']}",
                snippet=row["summary"], citation=next(iter(row["citations"]), "Local records request"), status=row["status"]))
    for row in current["access"]["reviews"]:
        if any(query in values(row[key]).lower() for key in ("title", "body", "language", "status", "findings")):
            results.append(dict(module_id="townlight_access", record_id=row["review_id"],
                title=f"Accessibility review: {row['title'] or '(no title)'}",
                snippet=f"{row['status']} ({len(row['findings'])} finding(s); language: {row['language']}; alt text: {'yes' if row['has_alt_text'] else 'no'})",
                citation=f"Accessibility advisory review {row['review_id']}", status=row["status"]))
    # Match the existing source permissions: an outbox hit cannot expose another module.
    for row in current["notification_events"]:
        if any(query in str(row.get(key, "")).lower() for key in ("module_id", "record_id", "audience", "channel", "subject", "body", "status")):
            results.append(dict(module_id="townlight_core", record_id=row["id"], title=f"Notification: {row['subject']}",
                snippet=row["body"], citation=row["channel"], status=row["status"]))
    await write_audit_log(session=session, action="search-city-knowledge", resource_type="native-search",
        resource_id=None, user_id=actor.id, details={"note": f"Searched local city knowledge for: {data.query}"}, commit=False)
    current = await snapshot(session, request.state.native_modules, actor.id)
    await session.commit()
    return {"accepted": True, "message": f"Local search completed across integrated permitted modules with {len(results)} result(s).",
            "search_results": results, "state": current}
