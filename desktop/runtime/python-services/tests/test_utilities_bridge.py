from __future__ import annotations

import secrets
import uuid
from dataclasses import dataclass

import pytest
from sqlalchemy import create_engine, func, select
from townlight_311.models import command_receipts, events, notifications
from townlight_311.store import Conflict
from townlight_311.workflow import ServiceRequestRepository
from townlight_runtime.utilities_bridge import UtilitiesRequestBridge


@dataclass(frozen=True)
class UtilityPrincipal:
    actor_id: str
    display_name: str
    roles: frozenset[str]


@pytest.fixture
def repo(tmp_path):
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'townlight311.sqlite3'}",
        future=True,
        connect_args={"timeout": 30},
    )
    repository = ServiceRequestRepository(engine)
    repository.save_category("waste", "Waste Services", "Public Works", True, "admin")
    yield repository
    repository.engine.dispose()


@pytest.fixture
def principal():
    return UtilityPrincipal(
        "clerk-1",
        "Clerk One",
        frozenset({"utilities-clerk"}),
    )


def _count(repo, table):
    with repo.engine.connect() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def _comment_count(repo, request_id):
    with repo.engine.connect() as conn:
        return conn.execute(
            select(func.count())
            .select_from(events)
            .where(
                events.c.request_id == request_id,
                events.c.kind == "comment",
                events.c.public.is_(True),
            )
        ).scalar_one()


def _notification_count(repo, request_id):
    with repo.engine.connect() as conn:
        return conn.execute(
            select(func.count())
            .select_from(notifications)
            .where(notifications.c.request_id == request_id)
        ).scalar_one()


def _create_request(repo):
    token = secrets.token_urlsafe(32)
    created = repo.execute_resident_command(
        str(uuid.uuid4()),
        "create_request",
        {
            "category": "waste",
            "description": "Broken bin lid",
            "location": "1 Main Street",
            "contact": {
                "name": "Resident Example",
                "email": "resident@example.com",
                "phone": "+15550001111",
            },
            "resident_token": token,
        },
    )
    return created, token


def test_read_request_returns_minimal_tracker_link(repo, principal):
    created, _ = _create_request(repo)
    request_id = created["id"]
    staff = repo.get_staff(request_id)

    result = UtilitiesRequestBridge(repo).read_request(principal, request_id)

    assert result == {
        "request_id": request_id,
        "resident_id": staff["tracking"],
        "id": request_id,
        "tracking": staff["tracking"],
        "category": staff["category"],
        "description": staff["description"],
        "location": staff["location"],
        "state": staff["state"],
        "revision": staff["revision"],
    }
    assert result["description"] == "Broken bin lid"
    assert "contact" not in result
    assert "resident_token_hash" not in result
    assert "email" not in result
    assert "phone" not in result


def test_reply_is_public_in_original_tracker_and_duplicates_do_not_mutate(
    repo, principal
):
    created, token = _create_request(repo)
    request_id = created["id"]
    key = str(uuid.uuid4())
    body = "Your bin will be collected Friday."
    citations = ("Waste Policy 4.2", "Service Calendar")
    bridge = UtilitiesRequestBridge(repo)

    comments_before = _comment_count(repo, request_id)
    notifications_before = _notification_count(repo, request_id)
    revision_before = repo.get_staff(request_id)["revision"]

    first = bridge.post_reply(principal, request_id, body, citations, key)

    assert first["request_id"] == request_id
    assert first["idempotency_key"] == key
    assert first["comment_id"]
    assert first["revision"] == revision_before + 1
    assert _comment_count(repo, request_id) == comments_before + 1
    assert _notification_count(repo, request_id) == notifications_before + 1

    resident = repo.get_resident(request_id, token)
    assert resident["revision"] == first["revision"]
    resident_comments = [
        event["message"] for event in resident["events"] if event["kind"] == "comment"
    ]
    assert any(
        body in message and all(citation in message for citation in citations)
        for message in resident_comments
    )

    current = repo.get_staff(request_id)["revision"]
    repo.add_comment(request_id, current, "staff-9", "Intervening note", True)
    revision_after_intervening = repo.get_staff(request_id)["revision"]
    comments_before_retry = _comment_count(repo, request_id)
    notifications_before_retry = _notification_count(repo, request_id)

    second = UtilitiesRequestBridge(repo).post_reply(
        principal,
        request_id,
        body,
        citations,
        key,
    )

    assert second == first
    assert repo.get_staff(request_id)["revision"] == revision_after_intervening
    assert _comment_count(repo, request_id) == comments_before_retry
    assert _notification_count(repo, request_id) == notifications_before_retry

    with repo.engine.connect() as conn:
        reply_comments = conn.execute(
            select(events).where(
                events.c.request_id == request_id,
                events.c.kind == "comment",
                events.c.message.contains(body),
            )
        ).mappings().all()
    assert len(reply_comments) == 1


def test_same_key_changed_payload_request_or_principal_conflicts(repo, principal):
    created, _ = _create_request(repo)
    other, _ = _create_request(repo)
    request_id = created["id"]
    key = str(uuid.uuid4())
    bridge = UtilitiesRequestBridge(repo)
    bridge.post_reply(principal, request_id, "Original body", ("Citation A",), key)

    receipts_before = _count(repo, command_receipts)
    comments_before = _comment_count(repo, request_id)
    notifications_before = _notification_count(repo, request_id)
    other_comments_before = _comment_count(repo, other["id"])

    with pytest.raises(Conflict):
        bridge.post_reply(principal, request_id, "Changed body", ("Citation A",), key)
    with pytest.raises(Conflict):
        bridge.post_reply(principal, request_id, "Original body", ("Citation B",), key)
    with pytest.raises(Conflict):
        bridge.post_reply(
            UtilityPrincipal("clerk-2", "Clerk Two", frozenset({"city-staff"})),
            request_id,
            "Original body",
            ("Citation A",),
            key,
        )
    with pytest.raises(Conflict):
        bridge.post_reply(
            principal,
            other["id"],
            "Original body",
            ("Citation A",),
            key,
        )

    assert _count(repo, command_receipts) == receipts_before
    assert _comment_count(repo, request_id) == comments_before
    assert _notification_count(repo, request_id) == notifications_before
    assert _comment_count(repo, other["id"]) == other_comments_before


def test_unauthorized_principals_are_rejected_before_db_read(repo, monkeypatch):
    bridge = UtilitiesRequestBridge(repo)

    def fail(*args, **kwargs):
        raise AssertionError("repository must not be touched before authorization")

    monkeypatch.setattr(repo, "get_staff", fail)
    for bad_principal in (
        UtilityPrincipal("", "Blank", frozenset({"utilities-clerk"})),
        UtilityPrincipal("clerk-1", "Resident", frozenset({"resident"})),
        UtilityPrincipal("clerk-1", "Unknown", frozenset({"unknown-role"})),
        {"actor_id": "clerk-1", "roles": ["city-staff"]},
    ):
        with pytest.raises(PermissionError):
            bridge.read_request(bad_principal, str(uuid.uuid4()))

    monkeypatch.setattr(repo, "_bind_transaction", fail)
    with pytest.raises(PermissionError):
        bridge.post_reply(
            UtilityPrincipal("clerk-1", "Resident", frozenset({"resident"})),
            str(uuid.uuid4()),
            "Body",
            ("Citation",),
            str(uuid.uuid4()),
        )
    assert _count(repo, command_receipts) == 0


def test_add_comment_failure_rolls_back_receipt_and_retry_succeeds(
    repo, principal, monkeypatch
):
    created, _ = _create_request(repo)
    request_id = created["id"]
    key = str(uuid.uuid4())
    receipts_before = _count(repo, command_receipts)
    bridge = UtilitiesRequestBridge(repo)
    original = repo.add_comment
    calls = {"count": 0}

    def flaky(*args, **kwargs):
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("injected add_comment failure")
        return original(*args, **kwargs)

    monkeypatch.setattr(repo, "add_comment", flaky)
    comments_before = _comment_count(repo, request_id)
    notifications_before = _notification_count(repo, request_id)

    with pytest.raises(RuntimeError, match="injected add_comment failure"):
        bridge.post_reply(principal, request_id, "Reply body", ("Citation",), key)

    assert _count(repo, command_receipts) == receipts_before
    assert _comment_count(repo, request_id) == comments_before
    assert _notification_count(repo, request_id) == notifications_before

    result = bridge.post_reply(
        principal,
        request_id,
        "Reply body",
        ("Citation",),
        key,
    )

    assert result["revision"] == created["revision"] + 1
    assert _count(repo, command_receipts) == receipts_before + 1
    assert _comment_count(repo, request_id) == comments_before + 1
    assert _notification_count(repo, request_id) == notifications_before + 1


def test_distinct_request_ids_are_bound_to_their_own_trackers(repo, principal):
    one, token_one = _create_request(repo)
    two, token_two = _create_request(repo)
    receipts_before = _count(repo, command_receipts)
    bridge = UtilitiesRequestBridge(repo)

    read_one = bridge.read_request(principal, one["id"])
    read_two = bridge.read_request(principal, two["id"])

    assert read_one["resident_id"] == repo.get_staff(one["id"])["tracking"]
    assert read_two["resident_id"] == repo.get_staff(two["id"])["tracking"]
    assert read_one["resident_id"] != read_two["resident_id"]

    first = bridge.post_reply(
        principal,
        one["id"],
        "Only request one",
        ("Citation One",),
        str(uuid.uuid4()),
    )
    second = bridge.post_reply(
        principal,
        two["id"],
        "Only request two",
        ("Citation Two",),
        str(uuid.uuid4()),
    )

    assert first["request_id"] == one["id"]
    assert second["request_id"] == two["id"]
    resident_one = repo.get_resident(one["id"], token_one)
    resident_two = repo.get_resident(two["id"], token_two)
    assert any(
        "Only request one" in event["message"] for event in resident_one["events"]
    )
    assert not any(
        "Only request two" in event["message"] for event in resident_one["events"]
    )
    assert any(
        "Only request two" in event["message"] for event in resident_two["events"]
    )
    assert not any(
        "Only request one" in event["message"] for event in resident_two["events"]
    )
    assert _count(repo, command_receipts) == receipts_before + 2
