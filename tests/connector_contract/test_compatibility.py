# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Compatibility assertions against pinned original evidence, without networking."""

import hashlib
import json
import os
import socket
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from townlight_runtime import meeting_import_fetch, meeting_imports

BASELINE_MANIFEST_SHA256 = "85667dab73fb1180fddb99c7dd2435a88e46d6f863b3122626e5109372942ed6"
FORMATS = (
    ("legistar", "meeting-export"), ("primegov", "meeting-export"),
    ("granicus", "meeting-export"), ("novusagenda", "meeting-export"),
    ("granicus", "viewpublisher-html"), ("primegov", "primegov-portal-json"),
    ("civicplus-select", "civicplus-events-json"),
    ("civicplus-agenda-center", "agenda-center-html"),
    ("municode-meetings", "municode-meetings-html"), ("boardbook", "boardbook-html"),
    ("escribe", "escribe-calendar-json"), ("simbli", "simbli-html"),
    ("civicweb", "civicweb-html"), ("iqm2", "iqm2-html"),
    ("swagit", "swagit-archive-html"), ("suiteone-media", "suiteone-archive-html"),
    ("peak", "peak-viewpublisher-html"), ("utah-public-notice", "utah-notice-html"),
    ("destiny-agendaquick", "agendaquick-html"),
    ("town-hall-streams", "town-hall-streams-html"), ("telvue", "telvue-playlist-html"),
    ("champ", "champ-event-json"), ("onbase", "onbase-agenda-online-html"),
    ("laserfiche-weblink", "laserfiche-folder-html"),
    ("towncloud", "towncloud-table-json"), ("towncloud", "towncloud-agenda-html"),
    ("digital-towpath", "digital-towpath-detail-html"),
    ("clerkbase", "clerkbase-document-html"), ("first-party", "public-meeting-ics"),
    ("wistia", "wistia-media-json"), ("boardable", "boardable-public-meeting-html"),
    ("gworks", "gworks-frontdesk-json"), ("boarddocs", "boarddocs-print-pdf"),
    ("tyler-meeting-manager", "tyler-public-calendar-json"),
)
FIXTURE = Path(__file__).parent / "fixtures/legacy-meeting-export.json"
LEGACY_MEETING = {
    "external_id": "meeting-α",
    "title": "Council café",
    "scheduled_start": "2026-11-12T01:00:00Z",
    "agenda_items": [
        {"external_id": "item-1", "title": "Water review", "department": "Public Works"},
        {"external_id": "item-2", "title": "Budget review", "department": None},
    ],
}


def digest(value):
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)
    return hashlib.sha256(serialized.encode()).hexdigest()


def test_fixed_registry_has_every_original_family_and_format():
    rows = meeting_imports.source_formats()
    assert len(rows) == 34
    assert len({row["connector"] for row in rows}) == 31
    assert {(row["connector"], row["input_format"]) for row in rows} == set(FORMATS)


@pytest.mark.parametrize("connector,input_format", FORMATS)
def test_exact_original_capture_through_runtime_wrapper(connector, input_format):
    configured = os.environ.get("TOWNLIGHT_CONNECTOR_BASELINE")
    if not configured:
        pytest.skip("Set TOWNLIGHT_CONNECTOR_BASELINE to the pinned original-evidence corpus.")
    root = Path(configured)
    assert root.is_absolute(), "The acceptance corpus must be explicitly absolute."
    manifest = (root / "cases.json").read_bytes()
    assert hashlib.sha256(manifest).hexdigest() == BASELINE_MANIFEST_SHA256
    cases = json.loads(manifest)
    assert len(cases) == 34
    matches = [case for case in cases if (case["connector"], case["input_format"]) == (connector, input_format)]
    assert len(matches) == 1
    case = matches[0]
    path = (root / case["file"]).resolve()
    assert path.is_relative_to(root.resolve())
    content = path.read_bytes()
    assert hashlib.sha256(content).hexdigest() == case["sha256"]
    preview = meeting_imports.preview_export(connector, case["source_url"], content, input_format=input_format)
    assert digest(preview) == case["original_output_sha256"]
    assert preview["source"]["namespace"] == case["original_namespace"]
    assert len(preview["meetings"]) == case["original_record_count"]


def test_independent_synthetic_export_projection_and_capture_hash():
    content = FIXTURE.read_bytes()
    preview = meeting_imports.preview_export("legistar", "https://council.example.org/export", content)
    assert preview == {
        "version": 1,
        "source": {
            "connector": "legistar", "url": "https://council.example.org/export",
            "namespace": "//council.example.org", "format": "meeting-export",
            "sha256": hashlib.sha256(content).hexdigest(),
        },
        "meetings": [LEGACY_MEETING],
    }


@pytest.mark.parametrize("connector,url,expected", [
    ("boardbook", "https://meetings.boardbook.org/Public/Organization/3307", "//meetings.boardbook.org/Public/Organization/3307"),
    ("boardbook", "https://meetings.boardbook.org/Public/Organization/3308", "//meetings.boardbook.org/Public/Organization/3308"),
    ("simbli", "https://simbli.example.org/Meetings?S=42&Page=2", "//simbli.example.org?S=42"),
    ("simbli", "https://simbli.example.org/Meetings?S=43&Page=2", "//simbli.example.org?S=43"),
    ("legistar", "https://webapi.legistar.com/v1/city-a/Events", "//webapi.legistar.com/v1/city-a"),
    ("legistar", "https://webapi.legistar.com/v1/city-b/Events", "//webapi.legistar.com/v1/city-b"),
    ("gworks", "https://api.gworks.cloud/cms/public/city/1311/meetings/", "//api.gworks.cloud/cms/public/city/1311/meetings"),
])
def test_provider_namespace_does_not_collapse_tenants(connector, url, expected):
    assert meeting_imports.source_namespace(connector, urlsplit(url)) == expected


@pytest.mark.parametrize("url", [
    "file:///not-a-real-file", "https://staff:synthetic@example.org/source", "not a URL",
])
def test_bad_source_remains_a_public_input_error(url):
    with pytest.raises(meeting_imports.ImportInputError, match="original meeting"):
        meeting_imports.preview_export("legistar", url, FIXTURE.read_bytes())


def test_saved_preview_never_fetches(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Saved preview attempted a network connection")

    monkeypatch.setattr(socket, "create_connection", forbidden)
    monkeypatch.setattr(socket, "getaddrinfo", forbidden)
    assert meeting_imports.preview_export(
        "legistar", "https://council.example.org/export", FIXTURE.read_bytes()
    )["meetings"] == [LEGACY_MEETING]


def test_public_fetch_private_dns_guard_uses_compatible_error(monkeypatch):
    monkeypatch.setattr(socket, "getaddrinfo", lambda *a, **k: [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 443)),
    ])

    def forbidden(*args, **kwargs):
        raise AssertionError("Private address reached an actual socket")

    monkeypatch.setattr(socket, "create_connection", forbidden)
    with pytest.raises(meeting_imports.ImportInputError, match="public addresses"):
        meeting_import_fetch.fetch_public("https://council.example.org/source", byte_limit=1024)


@pytest.mark.parametrize("valid", [True, False])
def test_legacy_cli_machine_output_and_exit_codes(valid):
    env = {**os.environ, "PYTHONPATH": os.pathsep.join(sys.path), "PYTHONDONTWRITEBYTECODE": "1"}
    result = subprocess.run(
        [sys.executable, "-m", "townlight_runtime.meeting_imports", "legistar", "https://council.example.org/export"],
        input=FIXTURE.read_bytes() if valid else b"{invalid",
        capture_output=True, timeout=20, check=False, env=env,
    )
    if valid:
        assert result.returncode == 0, result.stderr.decode()
        assert json.loads(result.stdout)["meetings"] == [LEGACY_MEETING]
        assert not result.stderr
    else:
        assert result.returncode == 2
        assert not result.stdout
        assert b"not readable JSON" in result.stderr
