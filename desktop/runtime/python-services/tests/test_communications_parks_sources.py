"""Real ASGI tests for public Parks communications source resolution."""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from parks_http_support import PROGRAM, RESOURCE, future_slot, parks_app
from townlight_runtime.communications_sources import resolve_source

_PROGRAM_FIELDS = {
    "id",
    "revision",
    "title",
    "description",
    "timezone",
    "min_age",
    "max_age",
    "eligibility_text",
    "accessibility",
}
_CLOSURE_FIELDS = {
    "resource_id",
    "name",
    "address",
    "timezone",
    "closure_id",
    "start",
    "end",
}


def _request(client):
    return SimpleNamespace(app=client.app, headers={})


def _resolve(client, proof: str, identifier: str):
    return asyncio.run(
        resolve_source(_request(client), proof, "parks", identifier)
    )


def _parse_timestamp(value: object) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def test_program_public_projection_and_private_program_hidden(parks_app):
    client, repo = parks_app

    public_program = repo.catalog_create(
        "program",
        "test-staff",
        {**PROGRAM, "public": True},
    )
    program_id = str(public_program["id"])

    result = _resolve(client, "test-staff", f"program:{program_id}")
    content = result["content"]
    reference = result["reference"]

    assert set(content) == _PROGRAM_FIELDS
    assert content == {
        "id": program_id,
        "revision": public_program["revision"],
        "title": PROGRAM["title"],
        "description": PROGRAM["description"],
        "timezone": PROGRAM["timezone"],
        "min_age": PROGRAM["min_age"],
        "max_age": PROGRAM["max_age"],
        "eligibility_text": PROGRAM["eligibility_text"],
        "accessibility": PROGRAM["accessibility"],
    }
    assert not any(
        field in content
        for field in (
            "actor",
            "created_by",
            "updated_by",
            "staff_id",
            "private_reason",
        )
    )

    digest = reference["sha256"]
    assert reference == {
        "kind": "parks",
        "id": f"program:{program_id}",
        "revision": digest,
        "title": PROGRAM["title"],
        "url": f"/parks/programs/{program_id}/",
        "sha256": digest,
        "eligible": True,
    }
    assert isinstance(digest, str)
    assert len(digest) == 64

    private_program = repo.catalog_create(
        "program",
        "test-staff",
        {**PROGRAM, "title": "Private Program", "public": False},
    )
    private_program_id = str(private_program["id"])

    with pytest.raises(HTTPException) as private_exc:
        _resolve(client, "test-staff", f"program:{private_program_id}")
    assert private_exc.value.status_code == 404
    assert private_exc.value.detail == "source not found"

    with pytest.raises(HTTPException) as auth_exc:
        _resolve(client, "wrong-proof", f"program:{program_id}")
    assert auth_exc.value.status_code == 503
    assert auth_exc.value.detail == "source unavailable"


def test_resource_closure_projection_hides_private_reason_and_actor(parks_app):
    client, repo = parks_app

    public_resource = repo.catalog_create(
        "resource",
        "test-staff",
        {**RESOURCE, "public": True},
    )
    resource_id = str(public_resource["id"])
    revision = public_resource["revision"]

    start = future_slot(10)
    end = start + timedelta(hours=2)
    closure = repo.closure_add(
        resource_id,
        "staff",
        revision,
        start,
        end,
        "INTERNAL PRIVATE REASON",
    )
    closure_id = closure["id"]
    assert isinstance(closure_id, str)

    listed = client.get(
        f"/desktop/v1/parks/resources/{resource_id}/closures"
    )
    assert listed.status_code == 200
    listed_closures = listed.json()
    assert isinstance(listed_closures, list)
    assert any(item["id"] == closure_id for item in listed_closures)

    identifier = f"resource:{resource_id}:closure:{closure_id}"
    result = _resolve(client, "test-staff", identifier)
    content = result["content"]
    reference = result["reference"]

    assert set(content) == _CLOSURE_FIELDS
    assert content["resource_id"] == resource_id
    assert content["name"] == RESOURCE["name"]
    assert content["address"] == RESOURCE["address"]
    assert content["timezone"] == RESOURCE["timezone"]
    assert content["closure_id"] == closure_id
    assert _parse_timestamp(content["start"]) == start
    assert _parse_timestamp(content["end"]) == end

    digest = reference["sha256"]
    assert reference == {
        "kind": "parks",
        "id": identifier,
        "revision": digest,
        "title": f"Resource closed: {RESOURCE['name']}",
        "url": f"/parks/resources/{resource_id}/",
        "sha256": digest,
        "eligible": True,
    }
    assert isinstance(digest, str)
    assert len(digest) == 64

    serialized = json.dumps(result, sort_keys=True)
    assert "INTERNAL PRIVATE REASON" not in serialized
    assert "staff" not in serialized
    assert "reason" not in content
    assert "actor" not in content
