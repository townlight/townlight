"""Regression boundaries for Code-only shell state and public desktop reads.

Unit/HTTP transport fixtures only; fresh installed acceptance is separate.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from townlight_runtime import records_snapshot, code_public, meetings_bridge


@pytest.mark.asyncio
async def test_code_only_account_can_refresh_without_records_or_access_projection(monkeypatch):
    principal = SimpleNamespace(allows_module=lambda module: module == "townlight_code")
    monkeypatch.setattr(records_snapshot, "validate_native_session", lambda *a, **k: principal)
    mapped = AsyncMock(return_value=SimpleNamespace(id="code-actor"))
    monkeypatch.setattr(records_snapshot, "mapped_native_actor", mapped)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        desktop_profile_root="unused", desktop_enabled_modules=["townlight_code", "townlight_records", "townlight_access"])),
        state=SimpleNamespace())
    actor = await records_snapshot.suite_actor(request, object(), "proof")
    assert actor.id == "code-actor"
    assert request.state.native_modules == ["townlight_code"]
    assert mapped.call_args.args[-1] == "townlight_code"
    private_records = AsyncMock(side_effect=AssertionError("Records must not load"))
    private_access = AsyncMock(side_effect=AssertionError("Access must not load"))
    monkeypatch.setattr(records_snapshot, "records_state", private_records)
    monkeypatch.setattr(records_snapshot, "access_state", private_access)
    empty = SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: []),
                            mappings=lambda: SimpleNamespace(all=lambda: []))
    session = SimpleNamespace(execute=AsyncMock(return_value=empty),scalar=AsyncMock(return_value=None))
    result = await records_snapshot.snapshot(session, request.state.native_modules, actor.id)
    assert result["records_requests"] == []
    assert result["access"] == {"reviews": [], "audit_events": []}


def test_public_code_json_read_path_uses_official_public_projection(monkeypatch):
    app=FastAPI();app.include_router(code_public.router)
    app.dependency_overrides[code_public.public_active]=lambda: None
    citation={"status":"ok","citation":"Official 7","body_text":"Public section"}
    monkeypatch.setattr(code_public,"public_citation",lambda number,as_of=None: citation if number=="7" else {"status":"refused"})
    monkeypatch.setattr(code_public,"public_search",lambda query: {"results":[citation]})
    client=TestClient(app)
    assert client.get('/townlight_code/public-data/section',params={"section_number":"7"}).json()==citation
    assert client.get('/townlight_code/public-data/section',params={"section_number":"private"}).json()=={"status":"refused"}
    assert client.get('/townlight_code/public-data/search',params={"q":"7"}).json()=={"results":[citation]}
    assert client.post('/townlight_code/public-data/section',json={"section_number":"7"}).status_code==405


@pytest.mark.parametrize("visible,official,status",[(False,True,"active"),(True,False,"active"),(True,True,"retired")])
def test_public_code_cannot_return_private_unofficial_or_retired_source(monkeypatch,visible,official,status):
    app=FastAPI();app.include_router(code_public.router)
    app.dependency_overrides[code_public.public_active]=lambda: None
    monkeypatch.setattr(code_public.code,"SECTION_STORE",SimpleNamespace(
        lookup_section=lambda *a,**k:{"version":{"source_id":"restricted"}}))
    source=SimpleNamespace(public_visible=visible,is_official=official,status=status)
    monkeypatch.setattr(code_public.code,"_get_source_store",lambda:SimpleNamespace(get=lambda id:source))
    def forbidden(*a,**k):
        raise AssertionError("Restricted source must not reach citation construction")
    monkeypatch.setattr(code_public.code,"_build_citation_for_section",forbidden)
    result=TestClient(app).get('/townlight_code/public-data/section',params={"section_number":"7"})
    assert result.status_code==200
    assert result.json()["status"]!="ok"


def test_public_meetings_json_uses_public_detail_and_retains_archive_visibility(monkeypatch):
    app=FastAPI();app.include_router(meetings_bridge.public_router)
    app.dependency_overrides[meetings_bridge.public_active]=lambda: None
    record_id="11111111-1111-4111-8111-111111111111"
    record={"id":record_id,"title":"Public meeting","posted_agenda":"Agenda","posted_packet":"Packet","approved_minutes":"Minutes"}
    class Store:
        def search(self,query):
            return [SimpleNamespace(public_dict=lambda: {"id":record_id,"title":"Public meeting"})]
        def public_detail(self,id):
            assert id==record_id
            return record
    monkeypatch.setattr(meetings_bridge,"legal_record",lambda repository,operation: operation(Store()))
    client=TestClient(app)
    assert client.get('/public/meetings/data/index').json()["records"]==[{"id":record_id,"title":"Public meeting"}]
    assert client.get('/public/meetings/data/'+record_id).json()==record
    assert client.get('/public/meetings/data/not-a-uuid').status_code==422
