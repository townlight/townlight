"""Transaction and role checks against an explicitly isolated test PostgreSQL."""
from base64 import b64encode
import os
from pathlib import Path
import sys
from types import SimpleNamespace
from uuid import uuid4

import pytest

RUNTIME = Path(__file__).resolve().parents[1] / "desktop/runtime/python-services"
sys.path.insert(0, str(RUNTIME))


def test_staff_workflows_and_links(monkeypatch):
    url = os.getenv("TOWNLIGHT_MUNICIPAL_TEST_DATABASE")
    if not url:
        pytest.skip("Set TOWNLIGHT_MUNICIPAL_TEST_DATABASE to an empty, dedicated PostgreSQL database.")
    monkeypatch.setenv("TESTING", "1")

    import sqlalchemy as sa
    from fastapi import FastAPI, HTTPException
    from fastapi.testclient import TestClient
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from sqlalchemy.pool import NullPool
    from townlight_runtime import municipal_staff as staff

    engine = sa.create_engine(url.replace("+asyncpg", "+psycopg2"))
    assert not set(sa.inspect(engine).get_schema_names()) & {
        "townlight_boards", "townlight_contracts", "townlight_procurement", "townlight_meetings"
    }, "Use a newly initialized disposable database for this test."
    staff.ensure_schema(engine)
    staff.ensure_schema(engine)
    meeting_id = str(uuid4())
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE SCHEMA townlight_meetings"))
        connection.execute(sa.text("CREATE TABLE townlight_meetings.meetings (id uuid PRIMARY KEY, title text)"))
        connection.execute(sa.text("INSERT INTO townlight_meetings.meetings VALUES (:id, 'Council meeting')"),
                           {"id": meeting_id})
    engine.dispose()

    async_engine = create_async_engine(url, poolclass=NullPool)
    sessions = async_sessionmaker(async_engine)
    app = FastAPI()
    app.state.desktop_enabled_modules = {grant for pair in staff._MODULES.values() for grant in pair}
    app.include_router(staff.router)

    async def session():
        async with sessions() as db:
            yield db

    app.dependency_overrides[staff.get_async_session] = session
    admin = uuid4()
    clerk = uuid4()
    staff_id = uuid4()
    identity_events = []

    async def mapped_actor(request, _session, proof, module):
        if proof not in {"local-admin", "city-staff", "clerk"}:
            raise HTTPException(401, "Sign in")
        if proof == "clerk" and module != "townlight_meetings":
            raise HTTPException(403, "Module unavailable")
        request.state.native_role = proof
        return SimpleNamespace(id={"local-admin": admin, "city-staff": staff_id, "clerk": clerk}[proof])

    async def audit(**kwargs):
        identity_events.append((kwargs["action"], kwargs["user_id"]))
        assert not kwargs["commit"]

    monkeypatch.setattr(staff, "mapped_native_actor", mapped_actor)
    monkeypatch.setattr(staff, "write_audit_log", audit)
    prefix = "/desktop/v1/municipal-staff"

    with TestClient(app) as client:
        def send(method, path, data=None, *, role="local-admin", expected=200):
            response = client.request(method, prefix + path, json=data, headers={"X-Townlight-Session": role})
            assert response.status_code == expected, response.text
            return response.json()

        send("GET", "/boards", role="anonymous", expected=401)
        send("GET", "/procurement", role="clerk", expected=403)
        board = send("POST", "/boards", {"board_name": "Parks Board", "liaison": "Clerk"},
                     role="clerk", expected=201)["id"]
        seat = send("POST", "/boards/seat", {
            "board_id": board, "seat_name": "Seat A", "member_name": "Alex",
            "term_start": "2025-01-01", "term_end": "2025-12-31",
        }, role="clerk")["id"]
        send("POST", "/boards/seat", {"board_id": board, "seat_name": "Seat B"}, role="clerk")
        send("POST", "/boards/attendance", {"seat_id": seat, "meeting_id": str(uuid4()), "present": True},
             role="clerk", expected=404)
        send("POST", "/boards/attendance", {"seat_id": seat, "meeting_id": meeting_id, "present": True}, role="clerk")
        boards = send("GET", "/boards", role="clerk")
        assert {row["status"] for row in boards["seats"]} == {"Vacant", "Term expired"}
        assert boards["attendance"][0]["meeting_id"] == meeting_id

        draft = send("POST", "/procurement", {
            "title": "Playground replacement", "procurement_type": "Construction", "city_need": "New playground",
        }, role="city-staff", expected=201)["id"]
        proposal = send("POST", f"/procurement/{draft}/proposal", {
            "vendor_name": "Playgrounds Inc.", "summary": "Insurance exception", "staff_score": 87,
            "staff_exceptions": "Alternate insurance terms",
        }, role="city-staff", expected=201)["id"]
        send("POST", f"/procurement/{draft}/contract", expected=404)
        decision = {"proposal_id": proposal, "decision_reference": "Council-24", "decision_note": "Recorded vote"}
        send("POST", f"/procurement/{draft}/award", decision, role="city-staff", expected=403)
        send("POST", f"/procurement/{draft}/award", decision, expected=201)
        contract = send("POST", f"/procurement/{draft}/contract")["id"]
        assert send("POST", f"/procurement/{draft}/contract")["id"] == contract
        assert send("GET", "/procurement")["contracts"] == [{"id": contract, "procurement_id": draft}]
        contracts = send("GET", "/contracts", role="city-staff")
        assert len(contracts) == 1 and contracts[0]["status"] == "draft"
        send("GET", f"/contracts/{contract}/document", role="city-staff", expected=404)
        pdf = b64encode(b"%PDF-1.7\nSynthetic agreement").decode()
        signed = {
            "title": "Playground replacement", "vendor_name": "Playgrounds Inc.", "owner": "Parks",
            "start_date": "2027-01-01", "expiration_date": "2027-12-31", "renewal_due": "2027-10-31",
            "document_name": "agreement.pdf", "document_content": pdf,
        }
        send("POST", f"/contracts/{contract}/signed", signed, role="city-staff")
        assert send("GET", f"/contracts/{contract}/document", role="city-staff")["content"] == pdf
        assert send("GET", "/contracts")[0]["renewal_due"] == "2027-10-31"
        assert ("record-attendance", clerk) in identity_events
        assert identity_events.count(("record-staff-award", admin)) == 1
        assert identity_events.count(("create-contract-draft", admin)) == 1
