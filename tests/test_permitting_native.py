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
def native_permitting(tmp_path, monkeypatch):
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.database import get_async_session
    from app.models.user import UserRole
    from civicpermit.migrations import source_engine, upgrade
    from civicsuite_runtime import permitting_bridge as bridge

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
        "civicpermit",
        "civicrecords-ai",
        "civiccode",
        "civiczone",
    }
    app.state.desktop_domain_enabled = True
    app.include_router(bridge.router)
    app.dependency_overrides[get_async_session] = session
    sign_in()
    with TestClient(app) as client:
        yield client, app, engine, sign_in, users, identities, config
    engine.dispose()


def bundle():
    raw = b"Fictional intake manual: provide a site plan."
    return dict(
        requirement_id="fixture",
        title="Fictional intake",
        jurisdiction="Fictional Redstone",
        project_type="ADU",
        source_reference="Fictional manual section 2",
        source_date="2026-01-01",
        effective_on="2026-02-01",
        dataset_kind="fictional",
        filename="fictional.txt",
        sha256=hashlib.sha256(raw).hexdigest(),
        content_base64=base64.b64encode(raw).decode(),
        materials=[
            dict(
                material_id="site",
                description="Site plan",
                citation="Fictional manual section 2",
            )
        ],
        change_note="Fictional configured source",
    )


def test_native_intake_reopen_review_and_records_copy(native_permitting):
    client, _, _, sign_in, _, identities, _ = native_permitting
    base = "/desktop/v1/permitting"
    imported = client.post(
        base + "/requirements", json={"bundle": bundle()}, headers=sign_in()
    )
    assert imported.status_code == 200, imported.text
    payload = dict(
        requirement_revision=imported.json()["revision_id"],
        project_name="Fictional ADU",
        project_description="PRIVATE proposal",
        location="PRIVATE location",
        applicant_contact="PRIVATE contact",
        staff_notes="PRIVATE notes",
        materials=[
            dict(material_id="site", status="missing", note="PRIVATE material note")
        ],
    )
    response = client.post(base + "/cases", json=payload, headers=sign_in())
    assert response.status_code == 200, response.text
    first = response.json()
    path = base + "/cases/" + first["entity_id"]
    assert (
        client.get(path, headers=sign_in()).json()["payload"]["applicant_contact"]
        == "PRIVATE contact"
    )
    payload.update(
        expected_revision=first["revision_id"],
        review_state="reviewed",
        review_notes="Staff checked the material; follow-up is needed.",
        public_summary="A reviewed intake inquiry.",
    )
    spoofed = client.post(
        path + "/revisions",
        json={**payload, "reviewer_id": "forged"},
        headers=sign_in(1),
    )
    assert spoofed.status_code == 422
    reviewed = client.post(path + "/revisions", json=payload, headers=sign_in(1))
    assert reviewed.status_code == 200, reviewed.text
    saved = client.get(path, headers=sign_in(1)).json()
    assert saved["payload"]["reviewer_id"] == str(identities["beta@example.invalid"].id)
    assert (
        client.post(path + "/revisions", json=payload, headers=sign_in()).status_code
        == 409
    )
    packet = client.post(
        path + "/packets",
        json={
            "expected_revision": reviewed.json()["revision_id"],
            "visibility": "records_copy",
        },
        headers=sign_in(),
    )
    assert packet.status_code == 200, packet.text
    assert "PRIVATE" not in packet.json()["text"]
    assert "A reviewed intake inquiry." in packet.json()["text"]
    assert client.get("/civicpermit/cases").status_code == 404


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
def test_native_permitting_denials_never_write(native_permitting, case):
    from civicpermit.workflow_store import IntakeRepository

    client, app, engine, sign_in, users, identities, config = native_permitting
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
        "/desktop/v1/permitting/requirements",
        json={"bundle": bundle()},
        headers=headers,
    )
    assert response.status_code in {401, 403, 503}, response.text
    assert IntakeRepository(engine).inventory("requirement")["items"] == []
