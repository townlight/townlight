# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Actual durable application persistence, not installed-profile acceptance.

The released-schema row is independently seeded synthetic state. These SQLite
tests do not claim PostgreSQL migration, native role or signed-installer coverage.
"""

import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path

import pytest

sa = pytest.importorskip("sqlalchemy")
persist = pytest.importorskip("townlight_meetings.imported_meetings")
from townlight_meetings.agenda_lifecycle import (
    AgendaItemRepository,
    agenda_item_lifecycle_records,
)
from townlight_meetings.meeting_lifecycle import MeetingStore, meeting_records
from townlight_runtime.meeting_imports import preview_export

FIXTURE = Path(__file__).parent / "fixtures/legacy-meeting-export.json"
SOURCE_URL = "https://council.example.org/export"
EXISTING_MEETING_ID = "11111111-1111-4111-8111-111111111111"
EXISTING_ITEM_IDS = [
    "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333",
]
EXPECTED_MEETING = {
    "external_id": "meeting-α", "title": "Council café", "scheduled_start": "2026-11-12T01:00:00Z",
    "agenda_items": [
        {"external_id": "item-1", "title": "Water review", "department": "Public Works"},
        {"external_id": "item-2", "title": "Budget review", "department": None},
    ],
}


def legacy_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


@pytest.fixture
def database(tmp_path):
    url = "sqlite+pysqlite:///" + str(tmp_path / "released-schema.sqlite")
    engine = sa.create_engine(url).execution_options(schema_translate_map={"townlight_meetings": None})
    MeetingStore(engine=engine)
    AgendaItemRepository(engine=engine)
    persist.metadata.create_all(engine)
    yield engine, url
    engine.dispose()


def preview():
    return preview_export("legistar", SOURCE_URL, FIXTURE.read_bytes())


def save(engine, data=None):
    data = data or preview()
    return persist.commit_meeting_import(engine, actor="synthetic-staff", source=data["source"], meeting=data["meetings"][0])


def counts(engine):
    with engine.connect() as connection:
        return tuple(connection.scalar(sa.select(sa.func.count()).select_from(table)) for table in (
            persist.imports, meeting_records, agenda_item_lifecycle_records,
        ))


def test_preexisting_released_schema_ids_hashes_and_repeat_states_survive(database):
    engine, url = database
    source = {
        "connector": "legistar", "url": SOURCE_URL, "namespace": "//council.example.org",
        "format": "meeting-export", "sha256": hashlib.sha256(FIXTURE.read_bytes()).hexdigest(),
    }
    key = legacy_hash(["legistar", "//council.example.org", "meeting-α"])
    now = datetime(2026, 11, 11, tzinfo=UTC)
    with engine.begin() as connection:
        connection.execute(meeting_records.insert().values(
            id=EXISTING_MEETING_ID, title="Council café", meeting_type="regular",
            scheduled_start=datetime(2026, 11, 12, 1, tzinfo=UTC), status="SCHEDULED",
            audit_entries=[], created_at=now, updated_at=now,
        ))
        for item_id, item in zip(EXISTING_ITEM_IDS, EXPECTED_MEETING["agenda_items"], strict=True):
            connection.execute(agenda_item_lifecycle_records.insert().values(
                id=item_id, meeting_id=EXISTING_MEETING_ID, title=item["title"],
                department_name=item["department"] or "Unspecified", status="DRAFTED",
                audit_entries=[], created_at=now, updated_at=now,
            ))
        connection.execute(persist.imports.insert().values(
            source_key=key, source=source, external_id="meeting-α",
            payload_hash=legacy_hash(EXPECTED_MEETING), payload=EXPECTED_MEETING,
            meeting_id=EXISTING_MEETING_ID, agenda_item_ids=EXISTING_ITEM_IDS,
            actor="released-synthetic-staff", imported_at=now,
        ))
    engine.dispose()
    reopened = sa.create_engine(url).execution_options(schema_translate_map={"townlight_meetings": None})
    try:
        result = save(reopened)
        assert result == {
            "status": "unchanged", "meeting_id": EXISTING_MEETING_ID,
            "agenda_item_ids": EXISTING_ITEM_IDS, "source_key": key,
        }
        changed = deepcopy(preview())
        changed["meetings"][0]["title"] = "Changed upstream title"
        assert save(reopened, changed) == {**result, "status": "changed-source"}
        receipt = persist.read_meeting_import(reopened, EXISTING_MEETING_ID)
        assert receipt["payload"] == EXPECTED_MEETING
        assert receipt["source"] == source
        assert receipt["agenda_item_ids"] == EXISTING_ITEM_IDS
        assert receipt["actor"] == "released-synthetic-staff"
        assert counts(reopened) == (1, 1, 2)
        with reopened.begin() as connection:
            connection.execute(meeting_records.delete().where(meeting_records.c.id == EXISTING_MEETING_ID))
        assert save(reopened) == {**result, "status": "missing-destination"}
        assert counts(reopened) == (1, 0, 2)
    finally:
        reopened.dispose()


def test_failure_after_first_agenda_insert_rolls_back_then_retry_is_idempotent(database, monkeypatch):
    engine, _ = database
    original = AgendaItemRepository.create
    calls = 0

    def fail_second(self, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("Synthetic failure after partial agenda work")
        return original(self, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(AgendaItemRepository, "create", fail_second)
        with pytest.raises(RuntimeError, match="partial agenda"):
            save(engine)
    assert counts(engine) == (0, 0, 0)
    created = save(engine)
    assert created["status"] == "created"
    assert counts(engine) == (1, 1, 2)
    assert save(engine) == {**created, "status": "unchanged"}


def test_overlapping_repeats_claim_one_canonical_meeting(database):
    engine, _ = database
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda _: save(engine), range(4)))
    assert sorted(result["status"] for result in results) == ["created", "unchanged", "unchanged", "unchanged"]
    assert len({result["meeting_id"] for result in results}) == 1
    assert len({tuple(result["agenda_item_ids"]) for result in results}) == 1
    assert counts(engine) == (1, 1, 2)


def test_equal_normalized_content_with_changed_capture_does_not_duplicate(database):
    engine, _ = database
    created = save(engine)
    reformatted = json.dumps(json.loads(FIXTURE.read_bytes()), separators=(",", ":"), ensure_ascii=False).encode()
    new_preview = preview_export("legistar", SOURCE_URL, reformatted)
    assert new_preview["source"]["sha256"] != preview()["source"]["sha256"]
    assert new_preview["meetings"] == preview()["meetings"]
    assert save(engine, new_preview) == {**created, "status": "unchanged"}
    assert counts(engine) == (1, 1, 2)
