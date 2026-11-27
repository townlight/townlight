"""Resolve approved library sources for communications."""

from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from fastapi import HTTPException

from .communications_sources import _digest, _get

_LIBRARY_FIELDS = (
    "id",
    "revision",
    "title",
    "starts_at",
    "location",
    "description",
)


def _positive_int(value: object) -> bool:
    return type(value) is int and value > 0


def _nonblank(value: object) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _uuid_matches(value: object, expected: str) -> bool:
    if not isinstance(value, str):
        return False
    try:
        return UUID(value) == UUID(expected)
    except (ValueError, AttributeError, TypeError):
        return False


async def _resolve_public_source(
    request: object,
    proof: object,
    identifier: str,
    *,
    module: str,
    fields: tuple[str, ...],
    get=_get,
    digest_fn=_digest,
) -> dict[str, object]:
    try:
        normalized = str(UUID(identifier))
    except (ValueError, AttributeError, TypeError) as exc:
        raise HTTPException(status_code=422, detail="invalid identifier") from exc

    payload = await get(
        proof,
        request,
        f"/desktop/v1/{module}/items/{normalized}/source",
    )
    if not isinstance(payload, Mapping):
        raise HTTPException(status_code=503, detail="invalid source response")

    content = payload.get("content")
    if not isinstance(content, Mapping):
        raise HTTPException(status_code=503, detail="invalid source response")

    approval = payload.get("approval")
    if approval is None or (isinstance(approval, Mapping) and not approval):
        raise HTTPException(status_code=404, detail="source not approved")
    if not isinstance(approval, Mapping):
        raise HTTPException(status_code=503, detail="invalid source response")

    public: dict[str, object] = {}
    for field in fields:
        value = content.get(field)
        if field == "id":
            if not _uuid_matches(value, normalized):
                raise HTTPException(status_code=503, detail="invalid source response")
        elif field == "revision":
            if not _positive_int(value):
                raise HTTPException(status_code=503, detail="invalid source response")
        elif not _nonblank(value):
            raise HTTPException(status_code=503, detail="invalid source response")
        public[field] = value

    revision = public["revision"]
    if not _uuid_matches(payload.get("id"), normalized):
        raise HTTPException(status_code=503, detail="invalid source response")
    if not _positive_int(payload.get("revision")) or payload.get("revision") != revision:
        raise HTTPException(status_code=503, detail="invalid source response")

    digest = digest_fn(public)
    if payload.get("sha256") != digest:
        raise HTTPException(status_code=503, detail="invalid source response")

    for field in ("actor_id", "name", "approved_at"):
        if not _nonblank(approval.get(field)):
            raise HTTPException(status_code=503, detail="invalid source response")
    if not _positive_int(approval.get("revision")) or approval.get("revision") != revision:
        raise HTTPException(status_code=503, detail="invalid source response")

    approval_hash = approval.get("sha256")
    if approval_hash is None:
        approval_hash = approval.get("hash")
    if not isinstance(approval_hash, str) or approval_hash != digest:
        raise HTTPException(status_code=503, detail="invalid source response")

    return {
        "reference": {
            "kind": module,
            "id": normalized,
            "revision": digest,
            "title": public["title"],
            "url": f"/desktop/v1/{module}/items/{normalized}/source",
            "sha256": digest,
            "eligible": True,
        },
        "content": public,
    }


async def library_source(
    request: object, proof: object, identifier: str
) -> dict[str, object]:
    return await _resolve_public_source(
        request,
        proof,
        identifier,
        module="library",
        fields=_LIBRARY_FIELDS,
        get=_get,
        digest_fn=_digest,
    )


__all__ = ["library_source"]
