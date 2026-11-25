from __future__ import annotations

import base64
import hashlib
import io
import json
import zipfile
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
import sqlalchemy as sa
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from townlight_311.workflow import ServiceRequestRepository
from townlight_records.database import get_async_session
from townlight_records.models.user import Base, User, UserRole
from townlight_runtime.native_accounts import account_snapshot
from townlight_runtime.native_accounts import accounts as native_account_links
from townlight_runtime.service_requests import router, service_request_actor

BASE = "/desktop/v1/service-requests"


def _write_native_config(root: Path, staff: list[dict] | None = None) -> None:
    config = root / "config"
    config.mkdir(parents=True, exist_ok=True)
    admin = {
        "email": "admin@example.test",
        "role": "local-admin",
        "display_name": "Admin",
        "passcode_hash": "unused",
    }
    (config / "first-admin.json").write_text(json.dumps(admin), encoding="utf-8")
    (config / "staff-users.json").write_text(
        json.dumps(staff or []), encoding="utf-8"
    )


class SyncSessionAdapter:
    """Minimal async-session boundary over a real file-SQLite session."""

    def __init__(self, engine: sa.Engine):
        self.session = Session(engine)

    async def execute(self, statement, *args, **kwargs):
        return self.session.execute(statement, *args, **kwargs)

    async def scalar(self, statement, *args, **kwargs):
        return self.session.scalar(statement, *args, **kwargs)

    async def flush(self):
        self.session.flush()

    def close(self):
        self.session.close()


@pytest.fixture
def app_env(tmp_path):
    # The User model references this table by name; the test database only needs
    # the users and native-link tables for this API boundary.
    if "departments" not in Base.metadata.tables:
        sa.Table(
            "departments",
            Base.metadata,
            sa.Column("id", sa.Uuid(), primary_key=True),
        )

    database_path = tmp_path / "townlight.sqlite3"
    sync_engine = sa.create_engine(f"sqlite:///{database_path}")
    with sync_engine.begin() as connection:
        Base.metadata.tables["departments"].create(connection, checkfirst=True)
        User.__table__.create(connection, checkfirst=True)
    native_account_links.create(sync_engine)
    repository = ServiceRequestRepository(sync_engine)

    profile_root = tmp_path / "profile"
    _write_native_config(profile_root)

    app = FastAPI()
    app.include_router(router)
    app.state.desktop_service_requests = repository
    app.state.desktop_profile_root = profile_root

    async def bounded_session():
        session = SyncSessionAdapter(sync_engine)
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_async_session] = bounded_session

    def make_user(
        email: str,
        *,
        role: UserRole = UserRole.STAFF,
        active: bool = True,
    ) -> User:
        user = User(
            id=uuid4(),
            email=email,
            hashed_password="fixture",
            full_name=email.split("@")[0],
            role=role,
            is_active=active,
            is_superuser=False,
            is_verified=True,
            must_change_password=False,
        )
        with Session(sync_engine) as db:
            db.add(user)
            db.commit()
            db.refresh(user)
            db.expunge(user)
        return user

    def add_native_link(user: User, native_role: str) -> None:
        with sync_engine.begin() as connection:
            connection.execute(
                native_account_links.insert().values(
                    email=user.email.strip().lower(),
                    user_id=user.id,
                    native_role=native_role,
                )
            )

    def install_actor(user: User, native_role: str) -> None:
        async def actor_override(request: Request):
            request.state.native_actor_id = user.id
            request.state.native_role = native_role
            return user

        app.dependency_overrides[service_request_actor] = actor_override

    admin = make_user("admin@example.test", role=UserRole.ADMIN)
    staff = make_user("staff@example.test")

    env = SimpleNamespace(
        app=app,
        engine=sync_engine,
        repository=repository,
        profile_root=profile_root,
        make_user=make_user,
        add_native_link=add_native_link,
        install_actor=install_actor,
        admin=admin,
        staff=staff,
    )
    try:
        yield env
    finally:
        app.dependency_overrides.clear()
        sync_engine.dispose()


def _create_category(
    client: TestClient,
    code: str = "pothole",
    *,
    active: bool = True,
) -> None:
    response = client.post(
        f"{BASE}/categories",
        json={
            "code": code,
            "name": code.title(),
            "department": "Public Works",
            "active": active,
        },
    )
    assert response.status_code == 200, response.text


def _create_request(
    client: TestClient,
    *,
    category: str = "pothole",
    idempotency_key: str | None = None,
    **extra,
) -> dict:
    payload = {
        "category": category,
        "description": "A deep pothole in the travel lane.",
        "location": "100 Main Street",
        "contact": {
            "name": "Resident",
            "email": "resident@example.test",
        },
        "resident_token": "r" * 32,
        "idempotency_key": idempotency_key or str(uuid4()),
        **extra,
    }
    response = client.post(f"{BASE}/requests", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


def test_admin_category_gate(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.staff, "city-staff")
        denied = client.post(
            f"{BASE}/categories",
            json={
                "code": "pothole",
                "name": "Pothole",
                "department": "Public Works",
            },
        )
        assert denied.status_code == 403

        app_env.install_actor(app_env.admin, "local-admin")
        allowed = client.post(
            f"{BASE}/categories",
            json={
                "code": "pothole",
                "name": "Pothole",
                "department": "Public Works",
            },
        )
        assert allowed.status_code == 200, allowed.text
        assert allowed.json()["code"] == "pothole"


def test_include_inactive_categories_is_admin_only(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        _create_category(client, "active")
        _create_category(client, "inactive", active=False)

        active_only = client.get(f"{BASE}/categories")
        assert active_only.status_code == 200, active_only.text
        assert [item["code"] for item in active_only.json()] == ["active"]

        admin_all = client.get(f"{BASE}/categories?include_inactive=true")
        assert admin_all.status_code == 200, admin_all.text
        assert {item["code"] for item in admin_all.json()} == {
            "active",
            "inactive",
        }

        app_env.install_actor(app_env.staff, "city-staff")
        denied = client.get(f"{BASE}/categories?include_inactive=true")
        assert denied.status_code == 403


def test_list_requests_supports_offset_pagination(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        _create_category(client)
        created_ids = {_create_request(client)["id"] for _ in range(3)}

        first = client.get(f"{BASE}/requests?limit=2")
        assert first.status_code == 200, first.text
        first_ids = {item["id"] for item in first.json()}
        assert len(first_ids) == 2

        second = client.get(f"{BASE}/requests?limit=2&offset=2")
        assert second.status_code == 200, second.text
        second_ids = {item["id"] for item in second.json()}
        assert len(second_ids) == 1
        assert first_ids.isdisjoint(second_ids)
        assert first_ids | second_ids == created_ids


def test_create_get_triage_and_assign(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        _create_category(client)
        created = _create_request(client)
        request_id = created["id"]
        assert created["revision"] == 1

        fetched = client.get(f"{BASE}/requests/{request_id}")
        assert fetched.status_code == 200, fetched.text
        staff_view = fetched.json()
        assert staff_view["contact"]["email"] == "resident@example.test"
        assert staff_view["events"][0]["actor"] == str(app_env.admin.id)

        triaged = client.post(
            f"{BASE}/requests/{request_id}/transition",
            json={
                "expected_revision": 1,
                "target": "triaged",
                "reason": "Valid request.",
            },
        )
        assert triaged.status_code == 200, triaged.text
        assert triaged.json()["state"] == "triaged"
        assert triaged.json()["revision"] == 2
        assert triaged.json()["events"][-1]["actor"] == str(app_env.admin.id)

        assignee = app_env.make_user("assignee@example.test")
        app_env.add_native_link(assignee, "city-staff")
        _write_native_config(
            app_env.profile_root,
            [
                {
                    "email": assignee.email,
                    "role": "city-staff",
                    "active": True,
                    "display_name": assignee.full_name,
                }
            ],
        )
        _, snapshot = account_snapshot(app_env.profile_root)
        native_assignee = next(
            item for item in snapshot if item["email"] == assignee.email
        )
        assert native_assignee["active"] is True

        assigned = client.post(
            f"{BASE}/requests/{request_id}/transition",
            json={
                "expected_revision": 2,
                "target": "assigned",
                "reason": "Assign to city staff.",
                "assignee": str(assignee.id),
            },
        )
        assert assigned.status_code == 200, assigned.text
        assert assigned.json()["assignee"] == str(assignee.id)
        assert assigned.json()["revision"] == 3


def test_list_assignees_filters_native_staff_candidates(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")

        zeta = app_env.make_user("zeta@example.test")
        app_env.add_native_link(zeta, "city-staff")
        alpha = app_env.make_user("alpha@example.test")
        app_env.add_native_link(alpha, "city-staff")
        inactive = app_env.make_user("inactive@example.test", active=False)
        app_env.add_native_link(inactive, "city-staff")
        missing_link = app_env.make_user("missing@example.test")
        code_only = app_env.make_user("code@example.test")
        app_env.add_native_link(code_only, "code-staff")

        _write_native_config(
            app_env.profile_root,
            [
                {
                    "email": zeta.email,
                    "role": "city-staff",
                    "active": True,
                    "display_name": zeta.full_name,
                },
                {
                    "email": alpha.email,
                    "role": "city-staff",
                    "active": True,
                    "display_name": alpha.full_name,
                },
                {
                    "email": inactive.email,
                    "role": "city-staff",
                    "active": True,
                    "display_name": inactive.full_name,
                },
                {
                    "email": missing_link.email,
                    "role": "city-staff",
                    "active": True,
                    "display_name": missing_link.full_name,
                },
                {
                    "email": code_only.email,
                    "role": "code-staff",
                    "active": True,
                    "display_name": code_only.full_name,
                },
            ],
        )

        response = client.get(f"{BASE}/assignees")
        assert response.status_code == 200, response.text
        assignees = response.json()
        assert [item["id"] for item in assignees] == [str(alpha.id), str(zeta.id)]
        assert [item["full_name"] for item in assignees] == ["alpha", "zeta"]
        assert all(item["department_id"] is None for item in assignees)


def test_extra_fields_are_rejected(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        response = client.post(
            f"{BASE}/requests",
            json={
                "category": "pothole",
                "description": "A deep pothole.",
                "location": "100 Main Street",
                "contact": {"name": "Resident"},
                "resident_token": "r" * 32,
                "idempotency_key": str(uuid4()),
                "unexpected": "field",
            },
        )
        assert response.status_code == 422


def test_stale_revision_returns_conflict(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        _create_category(client)
        created = _create_request(client)
        response = client.post(
            f"{BASE}/requests/{created['id']}/transition",
            json={
                "expected_revision": created["revision"] + 10,
                "target": "triaged",
                "reason": "Stale update.",
            },
        )
        assert response.status_code == 409


def test_private_attachment_hash_download_and_zip_archive(app_env):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        _create_category(client)
        created = _create_request(client)
        request_id = created["id"]
        content = b"private attachment evidence"
        digest = hashlib.sha256(content).hexdigest()

        attached = client.post(
            f"{BASE}/requests/{request_id}/attachments",
            json={
                "expected_revision": 1,
                "name": "evidence.txt",
                "media_type": "text/plain",
                "content_base64": base64.b64encode(content).decode("ascii"),
                "public": False,
            },
        )
        assert attached.status_code == 201, attached.text
        attachment = attached.json()
        assert attachment["sha256"] == digest
        assert attachment["public"] is False

        downloaded = client.get(
            f"{BASE}/requests/{request_id}/attachments/{attachment['id']}"
        )
        assert downloaded.status_code == 200, downloaded.text
        assert downloaded.content == content
        assert downloaded.headers["X-SHA256"] == digest
        assert downloaded.headers["X-Checksum-SHA256"] == digest
        assert downloaded.headers["X-Content-SHA256"] == digest
        assert downloaded.headers["Cache-Control"] == "no-store"

        archived = client.get(f"{BASE}/requests/{request_id}/archive")
        assert archived.status_code == 200, archived.text
        assert archived.headers["content-type"] == "application/zip"
        assert (
            archived.headers["X-Content-SHA256"]
            == hashlib.sha256(archived.content).hexdigest()
        )
        assert archived.headers["Cache-Control"] == "no-store"
        with zipfile.ZipFile(io.BytesIO(archived.content)) as bundle:
            assert "request.json" in bundle.namelist()
            assert "manifest.json" in bundle.namelist()
            member = f"attachments/{attachment['id']}/evidence.txt"
            assert bundle.read(member) == content


def test_absent_repository_returns_503(app_env):
    app_env.install_actor(app_env.admin, "local-admin")
    app_env.app.state.desktop_service_requests = None
    with TestClient(app_env.app) as client:
        response = client.get(f"{BASE}/categories")
    assert response.status_code == 503


def test_generic_database_failure_returns_503(app_env, monkeypatch):
    app_env.install_actor(app_env.admin, "local-admin")

    def fail(**kwargs):
        raise SQLAlchemyError("database unavailable")

    monkeypatch.setattr(app_env.repository, "list_requests", fail)
    with TestClient(app_env.app) as client:
        response = client.get(f"{BASE}/requests")
    assert response.status_code == 503


def test_missing_proof_uses_real_actor_and_returns_401_without_db_access(app_env):
    app_env.app.dependency_overrides.pop(service_request_actor, None)

    class NoDatabaseSession:
        async def execute(self, *args, **kwargs):
            raise AssertionError("database must not be accessed without proof")

        async def scalar(self, *args, **kwargs):
            raise AssertionError("database must not be accessed without proof")

    async def guarded_session():
        yield NoDatabaseSession()

    app_env.app.dependency_overrides[get_async_session] = guarded_session
    with TestClient(app_env.app) as client:
        response = client.get(f"{BASE}/categories")
    assert response.status_code == 401


@pytest.mark.parametrize("identity_case", ["non_uuid", "public", "inactive_native"])
def test_assignment_rejects_invalid_native_identities(app_env, identity_case):
    with TestClient(app_env.app) as client:
        app_env.install_actor(app_env.admin, "local-admin")
        _create_category(client)
        created = _create_request(client)

        if identity_case == "non_uuid":
            assignee = "not-a-uuid"
        elif identity_case == "public":
            public_user = app_env.make_user("public@example.test")
            app_env.add_native_link(public_user, "public")
            assignee = str(public_user.id)
        else:
            inactive_user = app_env.make_user("inactive@example.test")
            app_env.add_native_link(inactive_user, "city-staff")
            _write_native_config(
                app_env.profile_root,
                [
                    {
                        "email": inactive_user.email,
                        "role": "city-staff",
                        "active": False,
                        "display_name": inactive_user.full_name,
                    }
                ],
            )
            assignee = str(inactive_user.id)

        response = client.post(
            f"{BASE}/requests/{created['id']}/transition",
            json={
                "expected_revision": 1,
                "target": "triaged",
                "reason": "Invalid assignee must not be stored.",
                "assignee": assignee,
            },
        )
        assert response.status_code == 422
        unchanged = client.get(f"{BASE}/requests/{created['id']}")
        assert unchanged.json()["revision"] == 1
