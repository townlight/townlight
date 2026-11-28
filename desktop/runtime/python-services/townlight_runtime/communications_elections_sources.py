"""Resolve approved election sources for communications."""

from __future__ import annotations

from .communications_library_sources import _resolve_public_source
from .communications_sources import _digest, _get

_ELECTION_FIELDS = (
    "id",
    "revision",
    "title",
    "jurisdiction",
    "election",
    "official_source",
    "source_version",
    "description",
)


async def elections_source(
    request: object, proof: object, identifier: str
) -> dict[str, object]:
    return await _resolve_public_source(
        request,
        proof,
        identifier,
        module="elections",
        fields=_ELECTION_FIELDS,
        get=_get,
        digest_fn=_digest,
    )


__all__ = ["elections_source"]
