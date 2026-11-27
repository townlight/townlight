import asyncio
import uuid
from types import SimpleNamespace

import pytest
import townlight_runtime.election_official_settings as election_settings
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from starlette.requests import Request


def _settings_path(root):
    return root / "config" / "elections-officials.json"


def _write_raw(root, raw):
    path = _settings_path(root)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(raw)
    return path


def _candidate(candidate_id):
    return {
        "id": str(candidate_id),
        "name": "Test Clerk",
        "email": "clerk@example.test",
        "native_role": "clerk",
    }


def _make_route_app(tmp_path, actor, candidate_id, monkeypatch):
    app = FastAPI()
    app.state.desktop_profile_root = tmp_path
    app.include_router(election_settings.router)

    app.dependency_overrides[election_settings.get_async_session] = lambda: object()
    app.dependency_overrides[election_settings.current_actor] = lambda: actor

    async def fake_eligible_candidates(session, actor_id):
        return {str(candidate_id)}, [_candidate(candidate_id)]

    monkeypatch.setattr(
        election_settings,
        "_eligible_candidates",
        fake_eligible_candidates,
    )
    return app


def test_load_missing_file_is_revision_zero_empty(tmp_path):
    store = election_settings.ElectionOfficialSettings(tmp_path)

    assert store.load() == {
        "revision": 0,
        "elections_official_ids": [],
    }
    assert not _settings_path(tmp_path).exists()


def test_save_valid_official_persists_to_new_instance(tmp_path):
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()
    official_id = uuid.uuid4()

    saved = store.save(
        0,
        [str(official_id)],
        str(actor_id),
        {str(official_id)},
    )

    expected = {
        "revision": 1,
        "elections_official_ids": [str(official_id)],
    }
    assert saved == expected
    assert election_settings.ElectionOfficialSettings(tmp_path).load() == expected


def test_save_stale_revision_raises_conflict(tmp_path):
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()
    official_id = uuid.uuid4()
    store.save(0, [str(official_id)], str(actor_id), {str(official_id)})

    with pytest.raises(election_settings.ElectionSettingsConflict):
        store.save(0, [], str(actor_id), set())


def test_save_forbids_self_designation(tmp_path):
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()

    with pytest.raises(election_settings.ElectionSettingsForbidden):
        store.save(0, [str(actor_id)], str(actor_id), {str(actor_id)})

    assert store.load()["revision"] == 0


def test_save_forbids_unknown_or_inactive_official(tmp_path):
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()
    eligible_id = uuid.uuid4()
    unknown_id = uuid.uuid4()

    with pytest.raises(election_settings.ElectionSettingsForbidden):
        store.save(0, [str(unknown_id)], str(actor_id), {str(eligible_id)})

    assert store.load()["revision"] == 0


def test_save_rejects_duplicate_official_ids(tmp_path):
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()
    duplicate_id = str(uuid.uuid4())

    with pytest.raises(election_settings.ElectionSettingsInvalid):
        store.save(
            0,
            [duplicate_id, duplicate_id],
            str(actor_id),
            {duplicate_id},
        )


@pytest.mark.parametrize(
    "raw",
    [
        b"{not-json",
        b'{"revision":0,"elections_official_ids":[],"revision":1}',
    ],
)
def test_malformed_or_duplicate_key_json_fails_closed_without_writing(tmp_path, raw):
    path = _write_raw(tmp_path, raw)
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()

    with pytest.raises(election_settings.ElectionSettingsStorage):
        store.load()

    with pytest.raises(election_settings.ElectionSettingsStorage):
        store.save(0, [], str(actor_id), set())

    assert path.read_bytes() == raw


def test_atomic_replace_failure_retains_original_settings(tmp_path, monkeypatch):
    store = election_settings.ElectionOfficialSettings(tmp_path)
    actor_id = uuid.uuid4()
    official_id = uuid.uuid4()
    store.save(0, [str(official_id)], str(actor_id), {str(official_id)})
    original = _settings_path(tmp_path).read_bytes()

    def fail_replace(source, destination):
        raise OSError("replace failed")

    monkeypatch.setattr(election_settings.os, "replace", fail_replace)

    with pytest.raises(election_settings.ElectionSettingsStorage):
        store.save(1, [], str(actor_id), set())

    assert _settings_path(tmp_path).read_bytes() == original
    assert election_settings.ElectionOfficialSettings(tmp_path).load() == {
        "revision": 1,
        "elections_official_ids": [str(official_id)],
    }


def test_get_settings_returns_current_ids_and_safe_candidates(tmp_path, monkeypatch):
    actor = SimpleNamespace(id=uuid.uuid4())
    candidate_id = uuid.uuid4()
    app = _make_route_app(tmp_path, actor, candidate_id, monkeypatch)

    store = election_settings.ElectionOfficialSettings(tmp_path)
    store.save(
        0,
        [str(candidate_id)],
        str(actor.id),
        {str(candidate_id)},
    )

    with TestClient(app) as client:
        response = client.get("/desktop/v1/elections/settings")

    assert response.status_code == 200
    assert response.json() == {
        "revision": 1,
        "elections_official_ids": [str(candidate_id)],
        "candidates": [_candidate(candidate_id)],
    }


def test_post_settings_updates_runtime_state_and_repository(tmp_path, monkeypatch):
    actor = SimpleNamespace(id=uuid.uuid4())
    candidate_id = uuid.uuid4()
    app = _make_route_app(tmp_path, actor, candidate_id, monkeypatch)
    app.state.desktop_elections = SimpleNamespace(designated_officials=frozenset())

    with TestClient(app) as client:
        response = client.post(
            "/desktop/v1/elections/settings",
            json={
                "expected_revision": 0,
                "elections_official_ids": [str(candidate_id)],
            },
        )

    expected_ids = frozenset({str(candidate_id)})
    assert response.status_code == 200
    assert response.json() == {
        "revision": 1,
        "elections_official_ids": [str(candidate_id)],
    }
    assert app.state.desktop_elections_officials == expected_ids
    assert app.state.desktop_elections.designated_officials == expected_ids
    assert election_settings.ElectionOfficialSettings(tmp_path).load() == {
        "revision": 1,
        "elections_official_ids": [str(candidate_id)],
    }


@pytest.mark.parametrize("expected_revision", [True, "0"])
def test_post_settings_schema_rejects_non_integer_expected_revision(
    tmp_path, monkeypatch, expected_revision
):
    actor = SimpleNamespace(id=uuid.uuid4())
    candidate_id = uuid.uuid4()
    app = _make_route_app(tmp_path, actor, candidate_id, monkeypatch)

    with TestClient(app) as client:
        response = client.post(
            "/desktop/v1/elections/settings",
            json={
                "expected_revision": expected_revision,
                "elections_official_ids": [str(candidate_id)],
            },
        )

    assert response.status_code == 422
    assert election_settings.ElectionOfficialSettings(tmp_path).load()["revision"] == 0


def test_post_settings_schema_rejects_more_than_one_hundred_ids(tmp_path, monkeypatch):
    actor = SimpleNamespace(id=uuid.uuid4())
    candidate_id = uuid.uuid4()
    app = _make_route_app(tmp_path, actor, candidate_id, monkeypatch)

    with TestClient(app) as client:
        response = client.post(
            "/desktop/v1/elections/settings",
            json={
                "expected_revision": 0,
                "elections_official_ids": [
                    str(uuid.uuid4()) for _ in range(101)
                ],
            },
        )

    assert response.status_code == 422
    assert election_settings.ElectionOfficialSettings(tmp_path).load()["revision"] == 0


def test_route_rejects_clerk_actor_from_current_actor_dependency(tmp_path, monkeypatch):
    actor = SimpleNamespace(id=uuid.uuid4())
    app = FastAPI()
    app.state.desktop_profile_root = tmp_path
    app.include_router(election_settings.router)
    app.dependency_overrides[election_settings.get_async_session] = lambda: object()

    async def fake_mapped_native_actor(request, session, proof, scope):
        request.state.native_role = "clerk"
        return actor

    monkeypatch.setattr(
        election_settings,
        "mapped_native_actor",
        fake_mapped_native_actor,
    )

    with TestClient(app) as client:
        response = client.get("/desktop/v1/elections/settings")

    assert response.status_code == 403


def test_current_actor_requires_mapped_native_local_admin(monkeypatch):
    actor = SimpleNamespace(id=uuid.uuid4())
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/desktop/v1/elections/settings",
            "headers": [],
        }
    )

    async def fake_mapped_native_actor(request, session, proof, scope):
        request.state.native_role = "clerk"
        return actor

    monkeypatch.setattr(
        election_settings,
        "mapped_native_actor",
        fake_mapped_native_actor,
    )

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(
            election_settings.current_actor(
                request,
                object(),
                "trusted-test-proof",
            )
        )

    assert exc_info.value.status_code == 403
    assert exc_info.value.detail == "local administrator required"
