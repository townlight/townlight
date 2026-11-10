"""Staff links from saved external meeting evidence to existing module records."""

from typing import Literal
from uuid import UUID

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from townlight_records.auth.native_identity import mapped_native_actor


Destination = Literal["boards", "contracts", "procurement", "zoning", "planning", "permitting", "inspections"]

_TARGETS = {
    "boards": "SELECT board_id AS id, board_name AS title FROM townlight_boards.board_roster_records",
    "contracts": "SELECT CAST(id AS text) AS id, title FROM townlight_contracts.staff_agreements",
    "procurement": "SELECT draft_id AS id, procurement_title AS title FROM townlight_procurement.rfp_draft_records",
    "zoning": "SELECT id, question_text AS title FROM townlight_zoning.staff_question_records",
    "planning": """
        SELECT head.analysis_id AS id, COALESCE(revision.payload->>'project_name', head.analysis_id) AS title
        FROM townlight_planning.workflow_analyses AS head
        JOIN townlight_planning.workflow_analysis_revisions AS revision
          ON revision.revision_id = head.latest_revision_id
    """,
    "permitting": """
        SELECT head.entity_id AS id, revision.payload->>'project_name' AS title
        FROM townlight_permitting.connected_heads AS head
        JOIN townlight_permitting.connected_revisions AS revision USING (revision_id)
        WHERE head.kind = 'case'
    """,
    "inspections": """
        SELECT head.entity_id AS id, revision.payload->>'title' AS title
        FROM townlight_inspections.connected_heads AS head
        JOIN townlight_inspections.connected_revisions AS revision USING (revision_id)
        WHERE head.kind = 'case'
    """,
}


async def authorize_destination(
    request: Request, session: AsyncSession, proof: str | None, destination: Destination, target_id: UUID | None = None,
) -> None:
    module = f"townlight_{destination}"
    if module not in request.app.state.desktop_enabled_modules:
        raise HTTPException(403, "This destination is unavailable in the current profile.")
    grant = "townlight_meetings" if destination == "boards" else module
    await mapped_native_actor(request, session, proof, grant)
    if target_id is not None:
        target = text(f"SELECT id FROM ({_TARGETS[destination]}) AS target_record WHERE id = :target")
        if await session.scalar(target, {"target": str(target_id)}) is None:
            raise HTTPException(404, "The destination record was not found.")


async def choices(
    session: AsyncSession, destination: Destination, target_query: str, meeting_query: str,
) -> dict:
    targets = await session.execute(text(f"""
        SELECT id, LEFT(COALESCE(title, id), 160) AS title
        FROM ({_TARGETS[destination]}) AS target_record
        WHERE STRPOS(LOWER(COALESCE(title, id) || ' ' || id), LOWER(:query)) > 0 OR :query = ''
        ORDER BY title, id LIMIT 100
    """), {"query": target_query})
    imports = await session.execute(text("""
        SELECT meeting_id, payload->>'title' AS title,
               COALESCE(payload->>'meeting_date', LEFT(payload->>'scheduled_start', 10)) AS meeting_date
        FROM townlight_meetings.external_meeting_imports
        WHERE STRPOS(LOWER((payload->>'title') || ' ' || CAST(meeting_id AS text)), LOWER(:query)) > 0 OR :query = ''
        ORDER BY imported_at DESC LIMIT 100
    """), {"query": meeting_query})
    return {"targets": [dict(row) for row in targets.mappings()], "imports": [dict(row) for row in imports.mappings()]}


async def list_links(session: AsyncSession, destination: Destination, target_id: UUID) -> list[dict]:
    rows = await session.execute(text("""
        SELECT link.meeting_id, link.linked_at, source.source->>'connector' AS connector,
               source.source->>'url' AS source_url, source.payload->>'title' AS title,
               source.payload->>'meeting_date' AS meeting_date
        FROM townlight_meetings.external_meeting_links AS link
        JOIN townlight_meetings.external_meeting_imports AS source USING (meeting_id)
        WHERE link.destination = :destination AND link.target_id = :target
        ORDER BY link.linked_at DESC
    """), {"destination": destination, "target": target_id})
    return [dict(row) for row in rows.mappings()]


async def link_meeting(
    session: AsyncSession, destination: Destination, target_id: UUID, meeting_id: UUID, actor_id: str,
) -> list[dict]:
    if await session.scalar(text("""
        SELECT meeting_id FROM townlight_meetings.external_meeting_imports WHERE meeting_id = :meeting
    """), {"meeting": meeting_id}) is None:
        raise HTTPException(404, "No import receipt for this meeting.")
    await session.execute(text("""
        INSERT INTO townlight_meetings.external_meeting_links (destination, target_id, meeting_id, actor)
        VALUES (:destination, :target, :meeting, :actor)
        ON CONFLICT DO NOTHING
    """), {"destination": destination, "target": target_id, "meeting": meeting_id, "actor": actor_id})
    await session.commit()
    return await list_links(session, destination, target_id)
