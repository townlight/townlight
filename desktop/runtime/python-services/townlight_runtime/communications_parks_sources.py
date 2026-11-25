"""Resolve public Parks communications sources through the fixed internal app."""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from fastapi import HTTPException

from .communications_sources import _digest, _get

_PROGRAM_FIELDS = (
    "id",
    "revision",
    "title",
    "description",
    "timezone",
    "min_age",
    "max_age",
    "eligibility_text",
    "accessibility",
)


def _parse_identifier(identifier: object) -> tuple[str, tuple[str, ...]]:
    if not isinstance(identifier, str) or not identifier:
        raise HTTPException(status_code=422, detail="invalid identifier")

    if identifier.startswith("program:"):
        raw_program_id = identifier[len("program:") :]
        try:
            program_id = str(UUID(raw_program_id))
        except (AttributeError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="invalid identifier") from exc
        return "program", (program_id,)

    parts = identifier.split(":")
    if (
        len(parts) == 4
        and parts[0] == "resource"
        and parts[2] == "closure"
        and parts[1]
        and parts[3]
    ):
        try:
            resource_id = str(UUID(parts[1]))
            closure_id = str(UUID(parts[3]))
        except (AttributeError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="invalid identifier") from exc
        return "closure", (resource_id, closure_id)

    raise HTTPException(status_code=422, detail="invalid identifier")


def _closure_list(payload: object) -> list[object]:
    if isinstance(payload, list):
        return payload
    raise HTTPException(status_code=503, detail="invalid source response")


def _normalize_utc_timestamp(value: object) -> str:
    if not isinstance(value, str) or not value:
        raise HTTPException(status_code=503, detail="invalid source response")
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=503, detail="invalid source response") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC).isoformat()


def _select_closure(
    payload: object, closure_id: str
) -> Mapping[str, object]:
    for item in _closure_list(payload):
        if not isinstance(item, Mapping):
            continue
        item_id = item.get("id")
        if isinstance(item_id, str) and item_id == closure_id:
            return item
    raise HTTPException(status_code=404, detail="source not eligible")


async def parks_source(
    request: object, proof: object, identifier: str
) -> dict[str, object]:
    source_kind, ids = _parse_identifier(identifier)

    if source_kind == "program":
        program_id = ids[0]
        path = f"/desktop/v1/parks/catalog/program/{program_id}"
        payload = await _get(proof, request, path, params={"public_only": True})
        snapshot = payload.get("snapshot")
        if not isinstance(snapshot, Mapping) or snapshot.get("public") is not True:
            raise HTTPException(status_code=404, detail="source not eligible")

        content = {
            field: (
                payload.get(field)
                if field in {"id", "revision"}
                else snapshot.get(field)
            )
            for field in _PROGRAM_FIELDS
        }
        digest = _digest(content)
        return {
            "reference": {
                "kind": "parks",
                "id": identifier,
                "revision": digest,
                "title": content.get("title"),
                "url": f"/parks/programs/{program_id}/",
                "sha256": digest,
                "eligible": True,
            },
            "content": content,
        }

    resource_id, closure_id = ids
    resource_path = f"/desktop/v1/parks/catalog/resource/{resource_id}"
    resource = await _get(
        proof, request, resource_path, params={"public_only": True}
    )
    snapshot = resource.get("snapshot")
    if not isinstance(snapshot, Mapping) or snapshot.get("public") is not True:
        raise HTTPException(status_code=404, detail="source not eligible")

    closures_path = f"/desktop/v1/parks/resources/{resource_id}/closures"
    closures = await _get(proof, request, closures_path, list_response=True)
    closure = _select_closure(closures, closure_id)

    resource_name = snapshot.get("name")
    content: dict[str, Any] = {
        "resource_id": resource.get("id"),
        "name": resource_name,
        "address": snapshot.get("address"),
        "timezone": snapshot.get("timezone"),
        "closure_id": closure["id"],
        "start": _normalize_utc_timestamp(closure.get("starts_at")),
        "end": _normalize_utc_timestamp(closure.get("ends_at")),
    }
    digest = _digest(content)
    return {
        "reference": {
            "kind": "parks",
            "id": identifier,
            "revision": digest,
            "title": f"Resource closed: {resource_name}",
            "url": f"/parks/resources/{resource_id}/",
            "sha256": digest,
            "eligible": True,
        },
        "content": content,
    }
