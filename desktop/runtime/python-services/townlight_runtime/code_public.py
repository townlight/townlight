"""Public Code views using existing authoritative-source capabilities."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import SQLAlchemyError

import townlight_code.main as code


def public_active(request: Request) -> None:
    if not getattr(request.app.state, "desktop_domain_enabled", False):
        raise HTTPException(status_code=503, detail="Service unavailable")

    from townlight_runtime.services import _code_database_status

    if not _code_database_status()["ok"]:
        raise HTTPException(status_code=503, detail="Service unavailable")


router = APIRouter(prefix="/townlight_code", dependencies=[Depends(public_active)])


def public_citation(number, as_of=None):
    try:
        lookup = code.SECTION_STORE.lookup_section(number, as_of=as_of)
        source = code._get_source_store().get(lookup["version"]["source_id"])
        if source.public_visible and source.is_official and source.status == "active":
            return code._build_citation_for_section(number, as_of)
    except (code.SectionLifecycleError, code.SourceRegistryError):
        pass
    return code.refusal(
        "Authoritative public source unavailable.",
        "Ask staff to restore an active official public source.",
        "source_unavailable",
    )


def public_search(query):
    try:
        response = code.SECTION_STORE.search(query)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Service unavailable") from None

    results = [
        item
        for item in response.get("results", [])
        if item.get("result_type") == "code_section"
        and public_citation(item["section_number"]).get("status") == "ok"
    ]
    return {**response, "results": results, "count": len(results)}


def resolve_number(ref, as_of):
    try:
        try:
            return code.SECTION_STORE.get_section(ref).section_number
        except code.SectionLifecycleError:
            return code.SECTION_STORE.lookup_section(ref, as_of=as_of)["section"]["section_number"]
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Service unavailable") from None


@router.get("/public-data/search")
def search_data(q: str = ""):
    return public_search(q)


@router.get("/public-data/section")
def section_data(section_number: str, as_of: date | None = None):
    return public_citation(section_number, as_of)


@router.get("/public-data/export")
async def export_data(section_number: str, as_of: date | None = None):
    citation = public_citation(section_number, as_of)
    if citation.get("status") != "ok":
        return citation
    return await code.export_section(section_number, as_of)


@router.get("/public-data/answer")
def answer_data(q: str, section_number: str | None = None, as_of: date | None = None):
    return code.build_grounded_answer(
        code.QuestionRequestContext(question=q, section_number=section_number, as_of=as_of),
        search=public_search, build_citation=public_citation, use_local_llm=False)


@router.get("", response_class=HTMLResponse)
async def home():
    return await code.public_lookup_home()


@router.get("/search", response_class=HTMLResponse)
async def search(q: str = ""):
    if q.strip():
        return code.render_search_page(q, public_search(q)["results"])
    return code.render_error_page(
        "Search required", "Enter a section number or phrase.", "Try again."
    )


@router.get("/answer", response_class=HTMLResponse)
async def answer(q: str = "", section_number: str | None = None, as_of: date | None = None):
    payload = code.build_grounded_answer(
        code.QuestionRequestContext(question=q, section_number=section_number, as_of=as_of),
        search=public_search,
        build_citation=public_citation,
        use_local_llm=False,
    )
    return code.render_answer_page(q, payload)


@router.get("/sections/{section_ref}", response_class=HTMLResponse)
async def detail(section_ref: str, as_of: date | None = None) -> HTMLResponse:
    try:
        try:
            number = resolve_number(section_ref, as_of)
        except code.SectionLifecycleError:
            return code.render_error_page(
                "Section unavailable", "No authoritative public section is available.",
                "Check the section and date.",
            )
        citation = public_citation(number, as_of)
        if citation["status"] != "ok":
            return code.render_error_page("Section unavailable", citation["reason"], citation["fix"])
        return await code.public_section_detail(section_ref, as_of)
    except SQLAlchemyError:
        raise HTTPException(503, "Service unavailable") from None


@router.get("/sections/{section_ref}/export", response_class=HTMLResponse)
async def export(section_ref: str, as_of: date | None = None) -> HTMLResponse:
    try:
        try:
            number = resolve_number(section_ref, as_of)
        except code.SectionLifecycleError:
            return code.render_error_page(
                "Section unavailable", "No authoritative public section is available.",
                "Check the section and date.",
            )
        citation = public_citation(number, as_of)
        if citation["status"] != "ok":
            return code.render_error_page("Section unavailable", citation["reason"], citation["fix"])
        return await code.public_section_export(section_ref, as_of)
    except SQLAlchemyError:
        raise HTTPException(503, "Service unavailable") from None
