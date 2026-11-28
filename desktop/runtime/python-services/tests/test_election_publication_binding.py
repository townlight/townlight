import sys
from pathlib import Path
from uuid import uuid4

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from townlight_runtime.election_publication import (
    ElectionPublicationMismatch,
    election_publication_text,
    require_election_provenance,
    validate_election_binding,
)

CONTENT = {
    "id": str(uuid4()),
    "revision": 1,
    "title": "Fictional Election Checklist",
    "jurisdiction": "Springfield",
    "election": "2025 Fictional Election",
    "description": "Bring the fictional form by Friday.",
    "official_source": "https://example.gov/checklist",
    "source_version": "1",
    "private_notes": "distinctive-private-notes-do-not-publish",
}

BODY = (
    "Jurisdiction: Springfield\n"
    "Election: 2025 Fictional Election\n\n"
    "Bring the fictional form by Friday.\n\n"
    "Official source: https://example.gov/checklist\n"
    "Source version: 1"
)


def snapshots():
    return [{"reference": {"kind": "elections"}, "content": dict(CONTENT)}]


def test_formatter_returns_exact_approved_body():
    result = election_publication_text(CONTENT)
    assert result["title"] == "Fictional Election Checklist"
    assert result["body"] == BODY
    assert not result["body"].endswith("\n")
    assert CONTENT["private_notes"] not in result["body"]
    assert CONTENT["private_notes"] not in result["title"]
    assert result["body"].count("Fictional Election Checklist") == 0


def test_canonical_text_validates():
    result = election_publication_text(CONTENT)
    validate_election_binding(result["title"], result["body"], snapshots())


@pytest.mark.parametrize(
    "title,body",
    [
        ("Fictional Election Checklist", BODY.replace("Friday", "Thursday")),
        ("Fictional Election Checklist", BODY.replace("checklist", "other")),
        ("Fictional Election Checklist", BODY.replace("Source version: 1", "Source version: 2")),
        ("Fictional Election Checklist Extra", BODY),
        ("Fictional Election Checklist", BODY + "\n"),
    ],
)
def test_changed_publication_text_is_rejected(title, body):
    with pytest.raises(ValueError):
        validate_election_binding(title, body, snapshots())


def test_multiple_elections_sources_are_rejected():
    result = election_publication_text(CONTENT)
    sources = snapshots() + snapshots()
    with pytest.raises(ValueError):
        validate_election_binding(result["title"], result["body"], sources)


def test_library_only_snapshots_are_a_no_op():
    library_only = [{"reference": {"kind": "library"}, "content": {"anything": "value"}}]
    validate_election_binding("unrelated", "text", library_only)


def test_election_provenance_removal_or_replacement_is_denied():
    with pytest.raises(ValueError):
        require_election_provenance([{"kind": "elections"}], [{"kind": "library"}])


def test_retaining_election_provenance_is_allowed():
    require_election_provenance(
        [{"kind": "elections"}],
        [{"kind": "elections"}, {"kind": "library"}],
    )


@pytest.mark.parametrize("field", ("title", "jurisdiction", "election", "description", "official_source", "source_version"))
def test_missing_required_source_fields_fail_formatter(field):
    content = dict(CONTENT)
    content.pop(field)
    with pytest.raises(ElectionPublicationMismatch):
        election_publication_text(content)