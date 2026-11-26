from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import ssl
import sys
import uuid
from pathlib import Path

import httpx
import pytest
from sqlalchemy import create_engine, func, select

_SERVICES = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_SERVICES))
sys.path.insert(0, str(_SERVICES.parents[2] / "module"))

from townlight_311.models import command_receipts, events, requests
from townlight_311.workflow import ServiceRequestRepository
from townlight_runtime.resident_commands import (
    ACK_PATH,
    CATALOG_PATH,
    CLAIM_PATH,
    ResidentCommandPump,
    ResidentCommandUnavailable,
)

OWNER = "a" * 64
CATEGORY_FIELDS = {"code", "name", "department"}


def _sha256(value):
    body = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    return hashlib.sha256(body).hexdigest()


def _receiver_validate_catalog(raw):
    """Mirror the portal's exact public catalogue schema and digest check."""
    assert isinstance(raw, dict)
    assert set(raw) == {"categories", "sha256"}
    categories = raw["categories"]
    assert isinstance(categories, list)
    normalized = []
    seen = set()
    for item in categories:
        assert isinstance(item, dict)
        assert set(item) == CATEGORY_FIELDS
        row = {}
        for name in ("code", "name", "department"):
            value = item[name]
            assert isinstance(value, str)
            value = value.strip()
            assert value
            row[name] = value
        assert row["code"] not in seen
        seen.add(row["code"])
        normalized.append(row)
    digest = raw["sha256"]
    assert isinstance(digest, str) and len(digest) == 64
    assert digest == _sha256(normalized)


def _token():
    return secrets.token_urlsafe(32)


def _create_payload(token):
    return {
        "category": "waste",
        "description": "Broken bin lid",
        "location": "1 Main Street",
        "contact": {
            "name": "Resident Example",
            "email": "resident@example.com",
            "phone": "+15550001111",
        },
        "resident_token": token,
    }


def _command(operation, payload, *, payload_sha256=None, lease_id=None):
    return {
        "id": str(uuid.uuid4()),
        "operation": operation,
        "payload": payload,
        "payload_sha256": payload_sha256 or _sha256(payload),
        "owner_session_digest64": OWNER,
        "lease_id": lease_id or str(uuid.uuid4()),
    }


class Portal:
    def __init__(self, commands=None, *, ack_status=200):
        self.commands = list(commands or [])
        self.ack_status = ack_status
        self.catalog = None
        self.acks = []
        self.paths = []
        self.client_kwargs = {}

    def handler(self, request):
        self.paths.append(request.url.path)
        if request.url.path == CATALOG_PATH:
            self.catalog = json.loads(request.content)
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == CLAIM_PATH:
            return httpx.Response(200, json={"commands": self.commands})
        if request.url.path == ACK_PATH:
            if self.ack_status != 200:
                return httpx.Response(self.ack_status, json={"detail": "unavailable"})
            self.acks.append(json.loads(request.content))
            return httpx.Response(200, json={"status": "ok"})
        return httpx.Response(404, json={"detail": "not found"})

    def factory(self, **kwargs):
        self.client_kwargs = kwargs
        return httpx.Client(transport=httpx.MockTransport(self.handler), **kwargs)


@pytest.fixture
def repo(tmp_path):
    engine = create_engine(
        f"sqlite+pysqlite:///{tmp_path / 'resident.sqlite3'}",
        future=True,
        connect_args={"timeout": 30},
    )
    repository = ServiceRequestRepository(engine)
    repository.save_category("waste", "Waste Services", "Public Works", True, "admin")
    yield repository
    repository.engine.dispose()


def _count(repo, table):
    with repo.engine.connect() as conn:
        return conn.execute(select(func.count()).select_from(table)).scalar_one()


def _pump(repo, portal, token, *, origin="https://portal.example"):
    return ResidentCommandPump(
        repo,
        config=lambda: (origin, token),
        client_factory=portal.factory,
    )


def test_catalog_body_matches_receiver_schema_and_digest(repo):
    token = _token()
    seen = []

    def handler(request):
        if request.url.path == CATALOG_PATH:
            raw = json.loads(request.content)
            # This must succeed before the catalogue request is accepted.
            _receiver_validate_catalog(raw)
            seen.append((request.content, raw))
            return httpx.Response(200, json={"status": "ok"})
        if request.url.path == CLAIM_PATH:
            return httpx.Response(200, json={"commands": []})
        return httpx.Response(404, json={"detail": "not found"})

    def factory(**kwargs):
        return httpx.Client(transport=httpx.MockTransport(handler), **kwargs)

    pump = ResidentCommandPump(
        repo,
        config=lambda: ("https://portal.example", token),
        client_factory=factory,
    )
    summary = pump.run_once()

    assert summary["claimed"] == 0
    assert len(seen) == 1
    actual_bytes, parsed = seen[0]
    assert actual_bytes == json.dumps(
        parsed,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    ).encode("utf-8")
    assert parsed["sha256"] == _sha256(parsed["categories"])


def test_successful_create_read_and_ack(repo):
    token = _token()
    created_lease = str(uuid.uuid4())
    create = _command("create_request", _create_payload(token), lease_id=created_lease)
    portal = Portal([create])
    pump = _pump(repo, portal, token)

    summary = pump.run_once()

    assert summary == {
        "claimed": 1,
        "executed": 1,
        "acked": 1,
        "failed": 0,
        "skipped": 0,
        "unavailable": 0,
    }
    assert _count(repo, requests) == 1
    assert _count(repo, events) == 1
    assert portal.catalog["categories"] == [
        {
            "code": "waste",
            "name": "Waste Services",
            "department": "Public Works",
        }
    ]
    assert portal.catalog["sha256"] == _sha256(portal.catalog["categories"])
    assert set(portal.catalog) == {"categories", "sha256"}
    assert "active" not in json.dumps(portal.catalog)
    ack = portal.acks[0]
    assert ack["failed"] is False
    assert ack["lease_id"] == created_lease
    assert ack["payload_sha256"] == _sha256(create["payload"])
    request_id = ack["result"]["id"]
    assert token not in json.dumps(ack)

    read_payload = {"request_id": request_id, "resident_token": token}
    portal.commands = [_command("read_request", read_payload)]
    portal.acks.clear()
    second = pump.run_once()

    assert second["executed"] == second["acked"] == 1
    assert portal.acks[0]["result"]["id"] == request_id
    assert token not in json.dumps(portal.acks[0])


def test_lost_ack_then_replay_creates_once(repo):
    token = _token()
    command = _command("create_request", _create_payload(token))
    portal = Portal([command], ack_status=500)
    pump = _pump(repo, portal, token)

    first = pump.run_once()
    assert first["executed"] == 1
    assert first["acked"] == 0
    assert first["unavailable"] == 1
    assert portal.acks == []

    portal.ack_status = 200
    second = pump.run_once()

    assert second["executed"] == second["acked"] == 1
    assert _count(repo, requests) == 1
    assert _count(repo, events) == 1
    assert _count(repo, command_receipts) == 1
    assert len(portal.acks) == 1
    assert portal.acks[0]["result"]["id"]


def test_corrupt_fingerprint_is_not_executed_or_acknowledged(repo):
    token = _token()
    command = _command(
        "create_request", _create_payload(token), payload_sha256="0" * 64
    )
    portal = Portal([command])
    pump = _pump(repo, portal, token)

    summary = pump.run_once()

    assert summary["claimed"] == 1
    assert summary["executed"] == 0
    assert summary["skipped"] == 1
    assert _count(repo, requests) == 0
    assert _count(repo, command_receipts) == 0
    assert portal.acks == []


def test_unknown_operation_is_generically_rejected(repo):
    token = _token()
    payload = {"request_id": str(uuid.uuid4()), "target": "closed"}
    portal = Portal([_command("transition", payload)])
    pump = _pump(repo, portal, token)

    summary = pump.run_once()

    assert summary["executed"] == 0
    assert summary["failed"] == 1
    assert _count(repo, command_receipts) == 0
    assert len(portal.acks) == 1
    ack = portal.acks[0]
    assert ack["failed"] is True
    assert ack["result"] == {
        "status": 422,
        "detail": "Invalid resident command",
    }
    assert "transition" not in json.dumps(ack)


def test_non_object_payload_is_rejected_before_execution(repo):
    token = _token()
    portal = Portal([_command("create_request", ["not", "an", "object"])])
    pump = _pump(repo, portal, token)

    summary = pump.run_once()

    assert summary["executed"] == 0
    assert summary["failed"] == 1
    assert _count(repo, requests) == 0
    assert len(portal.acks) == 1
    assert portal.acks[0]["result"]["status"] == 422


def test_claim_over_limit_is_rejected_without_partial_execution(repo):
    token = _token()
    commands = [
        _command("create_request", _create_payload(token)) for _ in range(11)
    ]
    portal = Portal(commands)
    pump = _pump(repo, portal, token)

    with pytest.raises(ResidentCommandUnavailable):
        pump.run_once()

    assert _count(repo, requests) == 0
    assert portal.acks == []


def test_database_failure_leaves_claim_unacknowledged(repo, monkeypatch):
    token = _token()
    portal = Portal([_command("create_request", _create_payload(token))])
    pump = _pump(repo, portal, token)

    def broken(*args, **kwargs):
        raise sqlite3.OperationalError("database is locked")

    monkeypatch.setattr(repo, "execute_resident_command", broken)

    summary = pump.run_once()

    assert summary["claimed"] == 1
    assert summary["unavailable"] == 1
    assert portal.acks == []
    assert _count(repo, requests) == 0


def test_config_is_reread_and_client_is_private(repo):
    token = _token()
    portals = []

    def config():
        config.calls += 1
        return "https://portal.example", token

    config.calls = 0

    def factory(**kwargs):
        portal = Portal([])
        portals.append(portal)
        portal.client_kwargs = kwargs
        return httpx.Client(transport=httpx.MockTransport(portal.handler), **kwargs)

    pump = ResidentCommandPump(repo, config=config, client_factory=factory)
    pump.run_once()
    pump.run_once()

    assert config.calls == 2
    assert len(portals) == 2
    kwargs = portals[0].client_kwargs
    assert kwargs["base_url"] == "https://portal.example"
    assert kwargs["trust_env"] is False
    assert isinstance(kwargs["verify"], ssl.SSLContext)
    assert kwargs["verify"].check_hostname is True
    assert kwargs["verify"].verify_mode == ssl.CERT_REQUIRED
    assert kwargs["follow_redirects"] is False
    assert kwargs["timeout"] == 30
    assert CATALOG_PATH in portals[0].paths
    assert CLAIM_PATH in portals[0].paths


def test_loopback_http_allowed_but_plain_remote_http_rejected(repo):
    token = _token()
    portal = Portal([])
    pump = _pump(repo, portal, token, origin="http://127.0.0.1:8443")
    pump.run_once()
    assert portal.client_kwargs["base_url"] == "http://127.0.0.1:8443"

    rejected = ResidentCommandPump(
        repo,
        config=lambda: ("http://portal.example", token),
        client_factory=portal.factory,
    )
    with pytest.raises(ResidentCommandUnavailable):
        rejected.run_once()
