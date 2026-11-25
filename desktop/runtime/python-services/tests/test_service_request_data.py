from __future__ import annotations

import asyncio
import io
import json
import zipfile
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

pytest_plugins = ["test_service_requests_api"]

from townlight_runtime.service_request_data import (
    aggregate_requests,
    dataset_bytes,
)
from townlight_runtime.service_request_data import (
    router as data_router,
)


DATA_BASE = "/desktop/v1/municipal-staff/data/service-requests"
PRIVATE_ONE = {
    "description": "Private description alpha",
    "location": "123 Secret Lane",
    "name": "Resident Alpha",
    "email": "alpha@private.example",
    "token": "token-alpha-" + "a" * 20,
}
PRIVATE_TWO = {
    "description": "Private description beta",
    "location": "987 Hidden Street",
    "name": "Resident Beta",
    "email": "beta@private.example",
    "token": "token-beta-" + "b" * 21,
}


def _seed_two_requests(env):
    env.repository.save_category("pothole", "Pothole", "Public Works", True, "admin")
    for private in (PRIVATE_ONE, PRIVATE_TWO):
        created = env.repository.create_request(
            category="pothole",
            description=private["description"],
            location=private["location"],
            contact={"name": private["name"], "email": private["email"]},
            resident_token=private["token"],
            idempotency_key=str(uuid4()),
        )
        assert created["state"] == "submitted"


def _data_app(env, *, enabled: bool = True):
    if not any(getattr(route, "path", "").startswith(DATA_BASE) for route in env.app.routes):
        env.app.include_router(data_router)
    env.app.state.desktop_enabled_modules = ("townlight_data",) if enabled else ()
    return env.app


def test_real_repository_aggregates_private_requests_without_private_values(app_env):
    _seed_two_requests(app_env)

    rows = asyncio.run(aggregate_requests(app_env.repository))

    assert rows == [
        {
            "category": "pothole",
            "department": "Public Works",
            "state": "submitted",
            "count": 2,
        }
    ]
    assert set(rows[0]) == {"category", "department", "state", "count"}
    serialized = json.dumps(rows)
    for private in (PRIVATE_ONE, PRIVATE_TWO):
        assert private["description"] not in serialized
        assert private["location"] not in serialized
        assert private["email"] not in serialized
        assert private["token"] not in serialized


def test_dataset_bytes_zip_has_only_public_deterministic_members(app_env):
    _seed_two_requests(app_env)
    rows = asyncio.run(aggregate_requests(app_env.repository))

    first = dataset_bytes(rows)
    second = dataset_bytes(rows)
    assert first == second

    with zipfile.ZipFile(io.BytesIO(first)) as archive:
        assert archive.namelist() == [
            "data-dictionary.json",
            "dataset.csv",
            "dataset.json",
        ]
        csv_bytes = archive.read("dataset.csv")
        json_bytes = archive.read("dataset.json")
        dictionary_bytes = archive.read("data-dictionary.json")
        combined = b"".join(
            archive.read(name) for name in archive.namelist()
        )

    assert csv_bytes == (
        b'"category","department","state","count"\n'
        b'"pothole","Public Works","submitted","2"\n'
    )
    assert json_bytes == (
        b'[{"category":"pothole","department":"Public Works",'
        b'"state":"submitted","count":2}]'
    )

    dictionary = json.loads(dictionary_bytes)
    assert [item["field_name"] for item in dictionary] == [
        "category",
        "department",
        "state",
        "count",
    ]
    assert [item["source_name"] for item in dictionary] == [
        "category",
        "department",
        "state",
        "count",
    ]
    assert [item["data_type"] for item in dictionary] == [
        "text",
        "text",
        "text",
        "integer",
    ]
    assert [item["description"] for item in dictionary] == [
        "Service category",
        "Responsible department",
        "Workflow state",
        "Number of service requests",
    ]

    for private in (PRIVATE_ONE, PRIVATE_TWO):
        for value in private.values():
            assert value.encode("utf-8") not in combined


class _BoundedFakeRepository:
    def __init__(self):
        self.calls = 0

    def list_requests(self, *, limit, offset):
        self.calls += 1
        if offset >= 10_000:
            return [{"category": "pothole", "department": "Public Works", "state": "submitted"}]
        assert limit == 200
        return [
            {"category": "pothole", "department": "Public Works", "state": "submitted"}
            for _ in range(200)
        ]


def test_aggregate_rejects_source_above_10000_with_explicit_413():
    repository = _BoundedFakeRepository()

    with pytest.raises(HTTPException) as raised:
        asyncio.run(aggregate_requests(repository))

    assert raised.value.status_code == 413
    assert "10000" in raised.value.detail
    assert repository.calls == 51


def test_data_endpoint_denies_missing_actor_and_disabled_module(app_env):
    _data_app(app_env, enabled=True)
    with TestClient(app_env.app) as client:
        no_actor = client.get(DATA_BASE)
    assert no_actor.status_code == 401

    _data_app(app_env, enabled=False)
    app_env.install_actor(app_env.admin, "local-admin")
    with TestClient(app_env.app) as client:
        disabled = client.get(
            DATA_BASE,
            headers={"X-Townlight-Session": "admin-session"},
        )
    assert disabled.status_code == 403
    assert "not enabled" in disabled.text
    assert app_env.admin is not None
