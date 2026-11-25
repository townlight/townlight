# SPDX-License-Identifier: AGPL-3.0-only
from __future__ import annotations

import copy
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine

from townlight_parks import migrations
from townlight_parks.workflow import ParksRepository
from website.models import ParksCatalog
from website.parks_catalog import read_catalog, receive_catalog
from test_resident_catalog import (
    TOKEN,
    canonical,
    catalog_env,
    worker_post,
)

pytestmark = pytest.mark.django_db

HOURS = {
    day: [["00:00", "24:00"]]
    for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
}
RESOURCE = {
    "name": "Community Hall",
    "address": "1 Park Lane",
    "timezone": "UTC",
    "description": "Neighborhood room",
    "amenities": ["restroom", "parking"],
    "accessibility": "Step-free entry and accessible restroom",
    "hours": HOURS,
    "public": False,
    "approval_required": True,
    "buffer_before_minutes": 0,
    "buffer_after_minutes": 0,
    "fee_cents": 100,
    "deposit_cents": 20,
    "currency": "USD",
}
PROGRAM = {
    "title": "Story Time",
    "description": "",
    "timezone": "UTC",
    "min_age": 3,
    "max_age": 8,
    "eligibility_text": "",
    "accessibility": "",
    "public": True,
}
EMPTY = {"resources": [], "programs": [], "sessions": [], "closures": []}


def body(response):
    return json.loads(response.content)


@pytest.fixture
def repo(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'parks.sqlite3'}")
    migrations.upgrade(engine)
    repository = ParksRepository(engine)
    try:
        yield repository
    finally:
        engine.dispose()


def publishable(repo):
    private = repo.catalog_create(
        "resource", "staff", {**RESOURCE, "name": "Private Hall"}
    )
    public = repo.catalog_create(
        "resource", "staff", {**RESOURCE, "name": "Public Hall", "public": True}
    )
    program = repo.catalog_create(
        "program", "staff", {**PROGRAM, "title": "Story Time"}
    )
    session_start = datetime.now(timezone.utc) + timedelta(days=10)
    session_end = session_start + timedelta(hours=1)
    session = repo.session_create(
        program["id"], "staff", session_start, session_end, 2, 0, "USD"
    )
    closure_start = datetime.now(timezone.utc) + timedelta(days=20)
    closure_end = closure_start + timedelta(days=1)
    private_closure = repo.closure_add(
        private["id"], "staff", 1, closure_start, closure_end, "private reason"
    )
    public_closure = repo.closure_add(
        public["id"], "staff", 1, closure_start, closure_end, "maintenance"
    )
    return (
        repo.public_catalog(),
        private,
        public,
        session,
        private_closure,
        public_closure,
    )


def test_public_projection_round_trips_through_django_receiver(repo, catalog_env):
    projection, private, public, session, private_closure, public_closure = (
        publishable(repo)
    )
    assert [row["id"] for row in projection["resources"]] == [str(public["id"])]
    assert str(private["id"]) not in {row["id"] for row in projection["resources"]}
    assert [row["id"] for row in projection["closures"]] == [str(public_closure["id"])]
    assert str(private_closure["id"]) not in {
        row["id"] for row in projection["closures"]
    }
    assert [row["id"] for row in projection["sessions"]] == [str(session["id"])]

    digest = canonical(projection)
    response = worker_post(
        receive_catalog, {"catalog": projection, "sha256": digest}, token=TOKEN
    )
    assert response.status_code == 200
    accepted = body(response)
    assert accepted["sha256"] == digest
    assert accepted["counts"] == {
        name: len(projection[name]) for name in projection
    }
    assert read_catalog() == {
        "catalog": projection,
        "sha256": digest,
        "updated_at": accepted["updated_at"],
        "available": True,
    }


def test_receiver_rejects_private_fields_bad_digest_and_unauthorized(
    repo, catalog_env
):
    projection = publishable(repo)[0]
    mutated = copy.deepcopy(projection)
    mutated["resources"][0]["email"] = "ada@example.com"
    mutated["resources"][0]["private"] = True
    rejected = worker_post(
        receive_catalog, {"catalog": mutated, "sha256": canonical(mutated)}
    )
    assert rejected.status_code == 422

    mismatch = worker_post(
        receive_catalog, {"catalog": projection, "sha256": "0" * 64}
    )
    assert mismatch.status_code == 409
    assert body(mismatch) == {"detail": "Catalogue digest mismatch"}

    unauthorized = worker_post(
        receive_catalog,
        {"catalog": projection, "sha256": canonical(projection)},
        host="evil.example",
    )
    assert unauthorized.status_code == 401
    assert body(unauthorized) == {"detail": "Publisher authorization required"}

    plain_http = worker_post(
        receive_catalog,
        {"catalog": projection, "sha256": canonical(projection)},
        host="portal.example",
        secure=False,
        remote="203.0.113.9",
    )
    assert plain_http.status_code == 403
    assert body(plain_http) == {"detail": "HTTPS required"}
    assert ParksCatalog.objects.count() == 0


def test_stale_catalog_is_unavailable_with_empty_arrays(repo, catalog_env):
    projection = publishable(repo)[0]
    digest = canonical(projection)
    response = worker_post(
        receive_catalog, {"catalog": projection, "sha256": digest}
    )
    assert response.status_code == 200

    ParksCatalog.objects.filter(pk=1).update(
        updated_at=datetime.now(timezone.utc) - timedelta(hours=25)
    )
    stale = read_catalog()
    assert stale["available"] is False
    assert stale["catalog"] == EMPTY
    assert stale["sha256"] == digest
    assert stale["updated_at"] is not None
