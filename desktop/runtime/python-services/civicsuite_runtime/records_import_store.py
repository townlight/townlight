"""Transactional import of the supported native Records snapshot.

Not an activation command. The supervisor must fence the legacy writer before
calling this, and activate only after backup/recovery proof. Historical actor
labels are preserved; import attribution is not invented historical authorship.
"""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import re
from pathlib import Path
import uuid

import sqlalchemy as sa

from app.desktop_bridge.projection import request_view
from app.models.request import RecordsRequest, RequestStatus, RequestDocument
from app.models.records_evidence import RequestEvidenceNote, RequestExemptionDecision
from app.models.request_workflow import RequestTimeline, RequestPublicStatus, RequestMessage
from app.models.fees import FeeLineItem
from app.models.search import SearchSession, SearchQuery, SearchResult
from app.models.document import DataSource, SourceType, Document
from app.models.records_files import RequestFileEvidence, RequestReleaseCopy
from app.models.records_artifacts import RequestArtifact, RequestPublication
from app.models.notifications import NotificationLog
from app.models.user import User
from civicsuite_runtime.records_import import preflight, stable_id


metadata = sa.MetaData()
imports = sa.Table("native_records_imports", metadata,
    sa.Column("profile_id", sa.String(36), primary_key=True),
    sa.Column("source_sha256", sa.String(64), nullable=False),
    sa.Column("backup_path", sa.Text, nullable=False),
    sa.Column("actor_id", sa.String(36), nullable=False),
    sa.Column("counts", sa.JSON, nullable=False),
    sa.Column("demo_fixture", sa.JSON),
    sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False))
legacy_audit = sa.Table("native_legacy_audit", metadata,
    sa.Column("profile_id", sa.String(36), primary_key=True),
    sa.Column("position", sa.Integer, primary_key=True),
    sa.Column("legacy_id", sa.Text, nullable=False),
    sa.Column("module_id", sa.Text, nullable=False),
    sa.Column("action", sa.Text, nullable=False),
    sa.Column("summary", sa.Text, nullable=False),
    sa.Column("created_at_unix_seconds", sa.BigInteger, nullable=False),
    sa.Column("previous_hash", sa.Text),
    sa.Column("entry_hash", sa.Text))


def ensure_schema(engine):
    metadata.create_all(engine)


def timestamp(value):
    return datetime.fromtimestamp(value, timezone.utc) if value is not None else None


def identifier(root, kind, label):
    return uuid.UUID(stable_id(root, kind, label))


STATUS = {
    "public intake received": RequestStatus.RECEIVED,
    "received": RequestStatus.RECEIVED, "deadline reviewed": RequestStatus.RECEIVED,
    "deadline calculated": RequestStatus.RECEIVED, "message sent": RequestStatus.RECEIVED,
    "requester message received": RequestStatus.RECEIVED,
    "clarification": RequestStatus.CLARIFICATION_NEEDED, "assigned": RequestStatus.ASSIGNED,
    "searching": RequestStatus.SEARCHING, "search session recorded": RequestStatus.SEARCHING,
    "in review": RequestStatus.IN_REVIEW, "exemption decision recorded": RequestStatus.IN_REVIEW,
    "fee review": RequestStatus.IN_REVIEW, "fee waived": RequestStatus.IN_REVIEW,
    "document attached": RequestStatus.IN_REVIEW, "release copy attached": RequestStatus.IN_REVIEW,
    "ready": RequestStatus.READY_FOR_RELEASE, "drafted": RequestStatus.DRAFTED,
    "local AI draft ready for review": RequestStatus.DRAFTED,
    "release package built": RequestStatus.APPROVED, "response package exported": RequestStatus.APPROVED,
    "approved": RequestStatus.APPROVED, "exported": RequestStatus.APPROVED,
    "release package exported": RequestStatus.APPROVED,
    "fulfilled": RequestStatus.FULFILLED, "closed": RequestStatus.CLOSED,
}


async def import_record(session, root, view, actor_id, source_id):
    if view.status not in STATUS:
        raise ValueError(f"Unsupported legacy Records status: {view.status}")
    req = RecordsRequest(id=uuid.UUID(view.request_id), desktop_id=view.id,
        public_tracking_number=view.public_tracking_number or None,
        requester_name=view.requester, requester_contact=view.requester_contact,
        submitted_via=view.submitted_via, description=view.summary,
        deadline_label=view.deadline, deadline_basis=view.deadline_basis,
        display_status=view.status, status=STATUS[view.status], assigned_label=view.assigned_to,
        response_draft=view.response_draft, fee_estimate_text=view.fee_estimate,
        fee_waiver_reason=view.fee_waiver_reason, created_by=None,
        created_at=timestamp(view.created_at_unix_seconds), date_received=timestamp(view.created_at_unix_seconds),
        deadline_reviewed_at=timestamp(view.deadline_reviewed_at_unix_seconds),
        approved_at=timestamp(view.approved_at_unix_seconds),
        approved_response_sha256=hashlib.sha256(view.response_draft.encode()).hexdigest()
            if view.approved_at_unix_seconds is not None else None,
        fulfilled_at=timestamp(view.fulfilled_at_unix_seconds), closed_at=timestamp(view.closed_at_unix_seconds))
    session.add(req)
    await session.flush()
    for field, kind in (("clarification_notes", "clarification"), ("search_notes", "search"),
            ("exemption_reviews", "exemption"), ("citations", "citation"),
            ("approval_notes", "approval"), ("exports", "export")):
        for position, content in enumerate(getattr(view, field)):
            session.add(RequestEvidenceNote(request_id=req.id, kind=kind, position=position,
                content=content, actor_id=None, created_at=req.created_at))
    for position, row in enumerate(view.timeline):
        session.add(RequestTimeline(request_id=req.id, legacy_id=row.id, position=position,
            event_type=row.action, actor_label=row.actor, description=row.note,
            created_at=timestamp(row.created_at_unix_seconds)))
    for position, row in enumerate(view.public_status_events):
        session.add(RequestPublicStatus(request_id=req.id, legacy_id=row.id, position=position,
            label=row.label, summary=row.summary, status=row.status, created_at=timestamp(row.created_at_unix_seconds)))
    for position, row in enumerate(view.messages):
        session.add(RequestMessage(request_id=req.id, legacy_id=row.id, position=position,
            sender_label=row.author, sender_type=row.author_role, message_text=row.body,
            is_internal=row.visibility == "internal", created_at=timestamp(row.created_at_unix_seconds)))
    for position, row in enumerate(view.exemption_decisions):
        session.add(RequestExemptionDecision(request_id=req.id, legacy_id=row.id, position=position,
            source=row.source, kind=row.kind, finding=row.finding, decision=row.decision,
            basis=row.basis, reviewer_label=row.reviewer, created_at=timestamp(row.created_at_unix_seconds)))
    for position, row in enumerate(view.fee_line_items):
        amount = Decimal(row.amount_cents) / 100
        session.add(FeeLineItem(request_id=req.id, legacy_id=row.id, position=position,
            description=row.description, schedule_basis=row.schedule_basis, quantity=1,
            unit_price=amount, total=amount, created_at=timestamp(row.created_at_unix_seconds)))
    for position, row in enumerate(view.search_sessions):
        search_id = identifier(root, f"search:{view.id}", row.id)
        session.add(SearchSession(id=search_id, user_id=actor_id, created_at=timestamp(row.created_at_unix_seconds)))
        await session.flush()
        session.add(SearchQuery(id=search_id, session_id=search_id, request_id=req.id,
            legacy_id=row.id, position=position, query_text=row.query, locations=row.locations,
            reviewer_label=row.reviewer, results_count=len(row.results), created_at=timestamp(row.created_at_unix_seconds)))
        await session.flush()
        for rank, result in enumerate(row.results):
            session.add(SearchResult(query_id=search_id, legacy_id=result.id, rank=rank,
                title=result.title, citation=result.citation, summary=result.summary, review_status=result.status))
    for position, row in enumerate(view.documents):
        doc_id = identifier(root, f"file:{view.id}", row.id)
        attachment_id = uuid.UUID(row.attachment_id)
        path = Path(row.stored_path)
        session.add(Document(id=doc_id, source_id=source_id, source_path=row.stored_path,
            filename=path.name, file_type=path.suffix.lstrip(".")[:50], file_hash=row.sha256,
            file_size=row.size_bytes, display_name=row.title[:500], original_locked=True))
        await session.flush()
        session.add(RequestDocument(id=attachment_id, request_id=req.id, document_id=doc_id,
            attached_by=actor_id, attached_at=timestamp(row.created_at_unix_seconds)))
        await session.flush()
        session.add(RequestFileEvidence(id=attachment_id, request_id=req.id, legacy_id=row.id,
            position=position, title=row.title, original_path=row.original_path, citation=row.citation,
            added_by=row.added_by, created_at=timestamp(row.created_at_unix_seconds)))
        await session.flush()
        if row.release_stored_path:
            session.add(RequestReleaseCopy(request_id=req.id, attachment_id=attachment_id, position=0,
                original_path=row.release_original_path, stored_path=row.release_stored_path,
                file_name=row.release_file_name, sha256=row.release_sha256, size_bytes=row.release_size_bytes,
                status=row.release_status, note=row.release_note, added_by=row.release_added_by,
                actor_id=actor_id, created_at=timestamp(row.release_added_at_unix_seconds)))
    for position, row in enumerate(view.release_packages):
        content = Path(row.export_path).read_bytes().decode("utf-8")
        session.add(RequestArtifact(request_id=req.id, legacy_id=row.id, position=position, kind="release-package",
            content=content, sha256=row.package_hash, response_sha256="", export_path=row.export_path,
            actor_id=actor_id, created_at=timestamp(row.created_at_unix_seconds),
            completed_at=timestamp(row.created_at_unix_seconds), **{key:getattr(row, key) for key in
                ("document_count", "release_artifact_count", "search_session_count", "release_count", "redacted_count", "exempt_count")}))
    await session.flush()
    projected = await request_view(session, req)
    if projected != view:
        changed = [key for key, value in view.model_dump().items() if projected.model_dump()[key] != value]
        raise ValueError(f"Imported Records projection is not lossless: {', '.join(changed)}")


async def import_snapshot(session, root: Path, expected_sha256: str, backup_path: Path, actor_id):
    """Use a fresh session; commit all normalized rows and receipt, or none.

    The backup must already exist and match exact source bytes. This routine
    neither stops native writers nor changes the active authority.
    """
    snapshot = preflight(root)
    if snapshot.source_sha256 != expected_sha256 or backup_path.read_bytes() != snapshot.source_bytes:
        raise ValueError("Import source or verified backup changed; no import accepted.")
    if backup_path.resolve() == snapshot.source_path.resolve():
        raise ValueError("Import requires a separate preserved backup.")
    profile_id = stable_id(root, "profile", "records")
    async with (session.begin_nested() if session.in_transaction() else session.begin()):
        await session.execute(sa.text("SELECT pg_advisory_xact_lock(7265637)"))
        previous = (await session.execute(sa.select(imports).where(imports.c.profile_id == profile_id))).mappings().first()
        if previous:
            if previous["source_sha256"] != expected_sha256:
                raise ValueError("A different legacy source was already imported; no overwrite accepted.")
            return dict(previous)
        actor = await session.get(User, actor_id)
        if actor is None or not actor.is_active:
            raise ValueError("Import requires its actual mapped operator.")
        if await session.scalar(sa.select(sa.func.count()).select_from(RecordsRequest)):
            raise ValueError("Records database is not empty; merge/overwrite is not an import operation.")
        source_id = identifier(root, "source", "legacy-records")
        session.add(DataSource(id=source_id, name="Townlight imported Records evidence",
            source_type=SourceType.MANUAL_DROP, connection_config={}, created_by=actor_id))
        await session.flush()
        for view in snapshot.records:
            await import_record(session, root, view, actor_id, source_id)
        request_ids = {view.id:uuid.UUID(view.request_id) for view in snapshot.records}
        for row in snapshot.original.get("notification_events", []):
            if row["module_id"] != "civicrecords-ai":
                continue  # Unmigrated namespace stays in the original backup.
            if row["record_id"] not in request_ids:
                raise ValueError("Notification references a missing Records request.")
            session.add(NotificationLog(request_id=request_ids[row["record_id"]], legacy_id=row["id"],
                module_id=row["module_id"], audience=row["audience"], channel=row["channel"],
                recipient_email="", subject=row["subject"], body=row["body"], status=row["status"],
                created_at=timestamp(row["created_at_unix_seconds"]), sent_at=timestamp(row.get("sent_at_unix_seconds"))))
        for row in snapshot.original.get("publication_events", []):
            if row["source_module"] != "civicrecords-ai":
                continue
            if row["source_record_id"] not in request_ids or row["record_type"] != "records-response":
                raise ValueError("Unsupported Records publication reference/type.")
            if hashlib.sha256(row["public_payload"].encode()).hexdigest() != row["payload_hash"]:
                raise ValueError("Historical publication hash mismatch.")
            session.add(RequestPublication(request_id=request_ids[row["source_record_id"]],
                legacy_id=row["id"], payload=row["public_payload"], payload_hash=row["payload_hash"],
                actor_id=actor_id, created_at=timestamp(row["published_at_unix_seconds"])))
        for position, row in enumerate(snapshot.original["audit_entries"]):
            await session.execute(legacy_audit.insert().values(profile_id=profile_id, position=position,
                legacy_id=row["id"], **{key:row.get(key) for key in ("module_id", "action", "summary",
                    "created_at_unix_seconds", "previous_hash", "entry_hash")}))
        # Rehash files and original bytes immediately before the completion transaction.
        if preflight(root) != snapshot:
            raise ValueError("Legacy source/evidence changed during import; transaction refused.")
        counts = {"requests":len(snapshot.records), "files":len(snapshot.verified_files),
                  "legacy_audit":len(snapshot.original["audit_entries"]),
                  "unmigrated_objects":sum(len(snapshot.original.get(name, [])) for name in
                      ("meeting_bodies", "meeting_members", "agenda_intakes", "meetings", "code_sources", "code_handoffs", "adopted_legislation"))}
        receipt = dict(profile_id=profile_id, source_sha256=expected_sha256, backup_path=str(backup_path),
            actor_id=str(actor_id), counts=counts, demo_fixture=snapshot.original.get("demo_fixture"),
            completed_at=datetime.now(timezone.utc))
        from civicsuite_runtime.records_import_access import import_access
        counts["access_reviews"] = await import_access(session, root, snapshot.original.get("access", {}))
        await session.flush()
        # Imported public identifiers already occupy numbers in the native
        # namespace. Never reset the allocator or let new intake reuse them.
        tracking_floor = max((int(match.group(1)) for row in snapshot.records
            if (match := re.fullmatch(r"REQ-(\d+)", row.public_tracking_number))), default=0)
        if tracking_floor:
            await session.execute(sa.text("SELECT setval('records_public_tracking_seq', "
                "GREATEST(:floor, (SELECT last_value FROM records_public_tracking_seq)), true)"),
                {"floor": tracking_floor})
        await session.execute(imports.insert().values(**receipt))
        return receipt
