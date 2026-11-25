"""Resolve communications sources through the fixed internal application."""

from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import HTTPException

_BASE_URL = "http://townlight-internal"
_MAX_BYTES = 1024 * 1024
_MEETING_FIELDS = (
    "id",
    "meeting_id",
    "title",
    "posted_agenda",
    "posted_packet",
    "approved_minutes",
    "plain_language_summary",
    "minutes_adopted_at",
    "minutes_signed_by",
)


def _session(proof: object, request: object) -> str:
    if isinstance(proof, str):
        return proof
    if isinstance(proof, Mapping):
        for key in ("session_id", "session", "id"):
            value = proof.get(key)
            if isinstance(value, str) and value:
                return value
    value = getattr(proof, "session_id", None)
    if isinstance(value, str) and value:
        return value
    headers = getattr(request, "headers", None)
    if headers is not None:
        return headers.get("x-townlight-session", "")
    return ""


def _digest(value: object) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    if len(encoded) > _MAX_BYTES:
        raise HTTPException(status_code=503, detail="source response too large")
    return hashlib.sha256(encoded).hexdigest()


def _snapshot(payload: object) -> dict[str, object]:
    if not isinstance(payload, Mapping):
        raise HTTPException(status_code=503, detail="invalid source response")
    return {key: payload.get(key) for key in _MEETING_FIELDS}


def _decode(
    response: httpx.Response, list_response: bool = False
) -> Mapping[str, object] | list[object]:
    if len(response.content) > _MAX_BYTES:
        raise HTTPException(status_code=503, detail="source response too large")
    try:
        payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=503, detail="invalid source response") from exc
    if list_response:
        if not isinstance(payload, list):
            raise HTTPException(status_code=503, detail="invalid source response")
        return payload
    if not isinstance(payload, Mapping):
        raise HTTPException(status_code=503, detail="invalid source response")
    return payload


async def _get(
    proof: object,
    request: object,
    path: str,
    params: dict | None = None,
    list_response: bool = False,
) -> Mapping[str, object] | list[object]:
    headers = {"X-Townlight-Session": _session(proof, request)}
    transport = httpx.ASGITransport(app=request.app)
    try:
        async with httpx.AsyncClient(
            transport=transport,
            base_url=_BASE_URL,
            headers=headers,
            trust_env=False,
            timeout=20,
        ) as client:
            response = await client.get(path, params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=503, detail="source unavailable") from exc
    if response.status_code == 404:
        raise HTTPException(status_code=404, detail="source not found")
    if response.status_code >= 400:
        raise HTTPException(status_code=503, detail="source unavailable")
    return _decode(response, list_response=list_response)


async def resolve_source(
    request: object, proof: object, kind: str, identifier: str
) -> dict[str, object]:
    if kind == "meetings":
        try:
            UUID(identifier)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="invalid identifier") from exc
        path = f"/public/meetings/data/{identifier}"
        payload = await _get(proof, request, path)
        snapshot = _snapshot(payload)
        if (
            payload.get("id") != identifier
            or not payload.get("approved_minutes")
            or not payload.get("minutes_adopted_at")
        ):
            raise HTTPException(status_code=404, detail="source not eligible")
        url = path
    elif kind == "code":
        path = "/townlight_code/public-data/section"
        params = {"section_number": identifier}
        payload = await _get(proof, request, path, params=params)
        if payload.get("status") != "ok":
            raise HTTPException(status_code=404, detail="source not found")
        snapshot = payload
        url = f"{path}?{urlencode(params)}"
    elif kind in ("notice", "311"):
        from .communications_department_sources import department_source

        return await department_source(request, proof, kind, identifier)
    elif kind == "parks":
        from .communications_parks_sources import parks_source

        return await parks_source(request, proof, identifier)
    else:
        raise HTTPException(status_code=422, detail="source kind not implemented")

    title = snapshot.get("title")
    if kind == "code" and (not isinstance(title, str) or not title):
        title = identifier

    digest = _digest(snapshot)
    return {
        "reference": {
            "kind": kind,
            "id": identifier,
            "revision": digest,
            "title": title,
            "url": url,
            "sha256": digest,
            "eligible": True,
        },
        "content": snapshot,
    }


async def verify_sources(
    request: object, proof: object, refs: list[dict[str, object]]
) -> list[dict[str, object]]:
    if not isinstance(refs, list) or not 0 <= len(refs) <= 50:
        raise HTTPException(status_code=422, detail="invalid references")
    resolved_refs: list[dict[str, object]] = []
    for ref in refs:
        if not isinstance(ref, dict):
            raise HTTPException(status_code=422, detail="invalid references")
        kind = ref.get("kind")
        identifier = ref.get("id")
        if not isinstance(kind, str) or not isinstance(identifier, str):
            raise HTTPException(status_code=409, detail="source changed")
        resolved = await resolve_source(request, proof, kind, identifier)
        if resolved["reference"] != ref:
            raise HTTPException(status_code=409, detail="source changed")
        resolved_refs.append(resolved["reference"])
    return resolved_refs
