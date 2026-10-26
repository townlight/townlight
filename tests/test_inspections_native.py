"""Affected native permission/review boundary; installed acceptance is separate.

Only SQL account lookup and connected evidence are fixtures. Session proofs,
routes, migrated intake persistence, attribution and packet filtering are real.
"""

import base64
import hashlib
import hmac
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "desktop/runtime/python-services"))


@pytest.fixture
def native_inspections(tmp_path, monkeypatch):
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.database import get_async_session
    from app.models.user import UserRole
    from civicinspect.migrations import source_engine, upgrade
    from civicsuite_runtime import inspections_bridge as bridge

    url = f"sqlite:///{tmp_path / 'intake.db'}"
    engine = source_engine(url)
    upgrade(engine)
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setattr(bridge, "source_engine", lambda _: source_engine(url))
    monkeypatch.setattr("app.auth.desktop_session.time.time", lambda: 1792620000)
    profile = tmp_path / "profile"
    config = profile / "config"
    config.mkdir(parents=True)
    (profile / "session-mac-secret.key").write_text(bytes(range(32)).hex())
    users = [
        dict(
            email=f"{name}@example.invalid",
            role="city-staff",
            active=True,
            display_name=name,
            passcode_hash=f"fixture-{name}",
        )
        for name in ("alpha", "beta")
    ]
    identities = {
        u["email"]: SimpleNamespace(
            id=uuid4(), role=UserRole.STAFF, is_active=True, must_change_password=False
        )
        for u in users
    }
    (config / "first-admin.json").write_text(
        json.dumps(dict(email="admin@example.invalid"))
    )

    def sign_in(index=0, role="city-staff", expiry=4102444800):
        users[index]["role"] = role
        (config / "staff-users.json").write_text(json.dumps(users))
        user = users[index]
        message = f"{user['email']}\n{role}\n{expiry}\n{user['passcode_hash']}"
        proof = hmac.new(bytes(range(32)), message.encode(), hashlib.sha256).hexdigest()
        (config / "local-session.json").write_text(
            json.dumps(
                {**user, "expires_at_unix_seconds": expiry, "session_hash": proof}
            )
        )
        return {"X-Townlight-Session": proof}

    async def session(request: Request):
        email = (
            json.loads((config / "local-session.json").read_text())["email"]
            if (config / "local-session.json").exists()
            else users[0]["email"]
        )

        async def execute(_):
            return SimpleNamespace(scalar_one_or_none=lambda: identities[email])

        async def commit():
            pass

        yield SimpleNamespace(execute=execute, commit=commit)

    app = FastAPI()
    app.state.desktop_profile_root = profile
    app.state.desktop_enabled_modules = {
        "civicinspect",
        "civicrecords-ai",
        "civiccode",
            }
    app.state.desktop_domain_enabled = True
    app.include_router(bridge.router)
    app.dependency_overrides[get_async_session] = session
    sign_in()
    with TestClient(app) as client:
        yield client, app, engine, sign_in, users, identities, config
    engine.dispose()


def payload():
    raw = b"PRIVATE original notes"
    return dict(title="Fictional inspection", property_reference="PRIVATE parcel",
        inspection_reference="fixture-1", dataset_kind="fictional", inspector_notes="PRIVATE notes",
        evidence=[dict(filename="notes.txt", description="Original", media_type="text/plain",
            content_base64=base64.b64encode(raw).decode(), sha256=hashlib.sha256(raw).hexdigest())])


def test_native_inspection_reopen_review_and_records_copy(native_inspections):
    client, _, _, sign_in, _, identities, _ = native_inspections
    base = "/desktop/v1/inspections"
    data = payload()
    response = client.post(base + "/cases", json=data, headers=sign_in())
    assert response.status_code == 200, response.text
    first = response.json()
    path = base + "/cases/" + first["entity_id"]
    assert client.get(path, headers=sign_in()).json()["payload"]["inspector_notes"] == "PRIVATE notes"
    data.update(expected_revision=first["revision_id"], review_state="reviewed",
        review_notes="Inspector checked the observations.", public_summary="Reviewed inspection workpaper.")
    assert client.post(path + "/revisions", json={**data, "reviewer_id":"forged"}, headers=sign_in(1)).status_code == 422
    reviewed = client.post(path + "/revisions", json=data, headers=sign_in(1))
    assert reviewed.status_code == 200, reviewed.text
    assert client.get(path, headers=sign_in()).json()["payload"]["reviewer_id"] == str(identities["beta@example.invalid"].id)
    assert client.post(path + "/revisions", json=data, headers=sign_in()).status_code == 409
    packet = client.post(path + "/packets", json={"expected_revision":reviewed.json()["revision_id"],
        "visibility":"records_copy"}, headers=sign_in())
    assert packet.status_code == 200, packet.text
    assert "PRIVATE" not in packet.json()["text"]
    assert "Reviewed inspection workpaper." in packet.json()["text"]
    assert client.post(base + "/repeat-cases", json={"property_reference":"PRIVATE parcel"}, headers=sign_in()).json()["items"][0]["entity_id"] == first["entity_id"]
    notice = client.post(base + "/notice-draft", json=data, headers=sign_in())
    assert notice.status_code == 200 and notice.json()["review_required"] is True
    assert client.get("/civicinspect/cases").status_code == 404


@pytest.mark.parametrize(
    "case",
    [
        "missing",
        "forged",
        "expired",
        "signed-out",
        "disabled",
        "records-only",
        "module-disabled",
        "domain-disabled",
        "sql-disabled",
    ],
)
def test_native_inspections_denials_never_write(native_inspections, case):
    from civicinspect.workflow_store import InspectionRepository

    client, app, engine, sign_in, users, identities, config = native_inspections
    headers = sign_in()
    if case == "missing":
        headers = {}
    if case == "forged":
        headers = {"X-Townlight-Session": "0" * 64}
    if case == "expired":
        headers = sign_in(expiry=999)
    if case == "signed-out":
        (config / "local-session.json").unlink()
    if case == "disabled":
        users[0]["active"] = False
        (config / "staff-users.json").write_text(json.dumps(users))
    if case == "records-only":
        headers = sign_in(role="records-staff")
    if case == "module-disabled":
        app.state.desktop_enabled_modules = set()
    if case == "domain-disabled":
        app.state.desktop_domain_enabled = False
    if case == "sql-disabled":
        identities[users[0]["email"]].is_active = False
    response = client.post(
        "/desktop/v1/inspections/cases",
        json=payload(),
        headers=headers,
    )
    assert response.status_code in {401, 403, 503}, response.text
    assert InspectionRepository(engine).inventory("case")["items"] == []
