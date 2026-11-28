from collections.abc import Mapping

_MSG = (
    "Election publication text must match the approved Elections source. "
    "Edit the Elections source and obtain separate designated official approval; "
    "do not alter approved text in Communications."
)

_FIELDS = ("title", "jurisdiction", "election", "description", "official_source", "source_version")


class ElectionPublicationMismatch(ValueError):
    """Election publication content does not match approved Elections source."""


def _required_string(content: Mapping, name: str) -> str:
    value = content.get(name)
    if not isinstance(value, str) or not value.strip():
        raise ElectionPublicationMismatch(_MSG)
    return value


def election_publication_text(content: Mapping) -> dict[str, str]:
    if not isinstance(content, Mapping):
        raise ElectionPublicationMismatch(_MSG)
    values = {name: _required_string(content, name) for name in _FIELDS}
    body = (
        f"Jurisdiction: {values['jurisdiction']}\n"
        f"Election: {values['election']}\n\n"
        f"{values['description']}\n\n"
        f"Official source: {values['official_source']}\n"
        f"Source version: {values['source_version']}"
    )
    return {"title": values["title"], "body": body}


def _is_elections_reference(reference: object) -> bool:
    return isinstance(reference, Mapping) and reference.get("kind") == "elections"


def validate_election_binding(title: str, body: str, snapshots: list) -> None:
    if not isinstance(snapshots, list):
        raise ElectionPublicationMismatch(_MSG)

    elections = []
    for snapshot in snapshots:
        if not isinstance(snapshot, Mapping):
            continue
        if _is_elections_reference(snapshot.get("reference")):
            elections.append(snapshot)

    if not elections:
        return

    if len(elections) != 1:
        raise ElectionPublicationMismatch(_MSG)

    content = elections[0].get("content")
    if not isinstance(content, Mapping):
        raise ElectionPublicationMismatch(_MSG)

    expected = election_publication_text(content)
    if title != expected["title"] or body != expected["body"]:
        raise ElectionPublicationMismatch(_MSG)


def require_election_provenance(previous_refs: list, new_refs: list) -> None:
    previous = previous_refs if isinstance(previous_refs, list) else []
    new = new_refs if isinstance(new_refs, list) else []

    had_elections = any(_is_elections_reference(ref) for ref in previous)
    has_elections = any(_is_elections_reference(ref) for ref in new)
    if had_elections and not has_elections:
        raise ElectionPublicationMismatch(_MSG)