"""Permission-checked projection of immutable Zoning sources for Records."""

from __future__ import annotations

import json
from datetime import date
from sqlalchemy import create_engine
from civicsuite_runtime import code_public
from civiczone import connected_sources


def _citation_accessible(citation):
    try:
        section_number = citation["section_number"]
        as_of = date.fromisoformat(citation["effective_start"])
        version_id = citation["version_id"]
        source_id = citation["source_id"]
    except (KeyError, TypeError, ValueError):
        return False
    try:
        resolved = code_public.public_citation(section_number, as_of)
    except Exception:
        return False
    return (
        resolved is not None
        and resolved.get("status") == "ok"
        and resolved.get("citation", {}).get("version_id") == version_id
        and resolved.get("citation", {}).get("source_id") == source_id
    )


def _snapshot_accessible(snapshot):
    raw = snapshot.get("text")
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            return False
    citations = ((raw or {}).get("context") or {}).get("citations") or []
    return all(_citation_accessible(c) for c in citations)


def public_documents(database_url, meeting_provider, query="", source_id=None):
    engine = create_engine(database_url)
    try:
        snapshots = connected_sources.public_documents(
            engine, meeting_provider, query=query, source_id=source_id
        )
    finally:
        engine.dispose()
    return [s for s in snapshots if _snapshot_accessible(s)]
