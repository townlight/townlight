"""Native identity/transport adapter to Townlight Code staff operations."""
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.native_identity import mapped_native_actor
from app.database import get_async_session
from civiccode import main as code

router = APIRouter(prefix="/desktop/v1/code", tags=["native-code"])


async def actor(
    request: Request,
    session: AsyncSession = Depends(get_async_session),
    proof: str | None = Header(default=None, alias="X-Townlight-Session"),
):
    user = await mapped_native_actor(request, session, proof, "civiccode")
    from civicsuite_runtime.services import _code_database_status

    if not _code_database_status()["ok"]:
        raise HTTPException(503, "Townlight Code database/schema is not ready; no work accepted.")
    actor_id = str(user.id)
    await session.commit()
    return actor_id


async def _call(awaitable):
    try:
        return await awaitable
    except SQLAlchemyError:
        raise HTTPException(503, "Townlight Code persistence unavailable.") from None
    except (
        code.CivicCodeImportError,
        code.SourceRegistryError,
        code.SectionLifecycleError,
        code.StaffWorkbenchError,
        code.PlainLanguageSummaryError,
    ) as exc:
        raise HTTPException(exc.status_code, exc.detail()) from None


@router.post("/imports")
async def imports(data: code.ImportBundleCreate, actor_id: str = Depends(actor)):
    return await _call(
        code.create_local_import_job(
            data, x_civiccode_role="staff", x_civiccode_actor=actor_id
        )
    )


@router.get("/sources")
async def sources(actor_id: str = Depends(actor)):
    return await _call(code.list_staff_sources("staff", actor_id))


@router.get("/workspace")
async def workspace(actor_id: str = Depends(actor)):
    try:
        return code._staff_code_payload()
    except SQLAlchemyError:
        raise HTTPException(503, "Townlight Code persistence unavailable.") from None


@router.get("/lookup")
async def lookup(
    section_number: str,
    as_of: date | None = None,
    actor_id: str = Depends(actor),
):
    return await _call(code.lookup_section(section_number, as_of))


@router.get("/sections/{section_id}/history")
async def section_history(section_id: str, actor_id: str = Depends(actor)):
    return await _call(code.section_history(section_id))


@router.get("/citation")
async def citation(
    section_number: str, as_of: date | None = None, actor_id: str = Depends(actor)
):
    return await _call(code.build_citation(section_number, as_of))


@router.get("/search")
async def search(q: str, actor_id: str = Depends(actor)):
    payload = await _call(code.search_sections(q))
    for result in payload["results"]:
        if result.get("section_number"):
            result["citation_result"] = await _call(
                code.build_citation(result["section_number"], None)
            )
    return payload


@router.get("/imports")
async def list_imports(actor_id: str = Depends(actor)):
    return await _call(code.list_import_jobs("staff", actor_id))


@router.get("/imports/{job_id}/tree")
async def import_tree(job_id: str, actor_id: str = Depends(actor)):
    return await _call(code.get_imported_tree(job_id, "staff", actor_id))


@router.get("/imports/{job_id}/provenance")
async def import_provenance(job_id: str, actor_id: str = Depends(actor)):
    return await _call(code.get_import_provenance(job_id, "staff", actor_id))


@router.get("/export")
async def export_section(section_ref: str, as_of: date | None = None, actor_id: str = Depends(actor)):
    return await _call(code.export_section(section_ref, as_of))


@router.post("/questions")
async def questions(data: code.QuestionAnswerRequest, actor_id: str = Depends(actor)):
    return await _call(code.answer_question(data))


@router.post("/sections/{section_id}/notes")
async def create_note(section_id: str, data: code.InterpretationNoteCreate, actor_id: str = Depends(actor)):
    return await _call(code.create_interpretation_note(section_id, data, "staff", actor_id))


@router.get("/sections/{section_id}/notes")
async def list_notes(section_id: str, actor_id: str = Depends(actor)):
    return await _call(code.list_interpretation_notes(section_id, "staff", actor_id))


@router.post("/sections/{section_id}/summaries")
async def create_summary(section_id: str, data: code.PlainLanguageSummaryCreate, actor_id: str = Depends(actor)):
    return await _call(code.create_plain_language_summary(section_id, data, "staff", actor_id))


@router.post("/summaries/{summary_id}/approve")
async def approve_summary(summary_id: str, actor_id: str = Depends(actor)):
    return await _call(code.approve_plain_language_summary(summary_id, "staff", actor_id))


@router.get("/sections/{section_id}/summaries")
async def list_summaries(section_id: str, actor_id: str = Depends(actor)):
    return await _call(code.list_public_plain_language_summaries(section_id))
