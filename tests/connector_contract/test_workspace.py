# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Real SDK/persistence path with synthetic providers and isolated durable files."""

import base64
import json
import os
from copy import deepcopy
from pathlib import Path

import pytest
import sqlalchemy as sa
from civic_data_connectors.providers.contracts import Response
from civic_data_connectors.interchange import read_bundle
from civic_data_connectors.models import OperationResult
from civic_data_connectors.write_adapters import default_adapters
from civic_data_connectors.write_transport import WriteResponse
from townlight_meetings import imported_meetings
from townlight_meetings.agenda_lifecycle import AgendaItemRepository
from townlight_meetings.meeting_lifecycle import MeetingStore, meeting_records
from townlight_runtime.connectors import ConnectorWorkspace

CALENDAR = {"d": [{
    "ID": "water-1", "MeetingName": "Water Council", "StartDate": "2026/11/11 19:00:00",
    "Url": "/Meeting.aspx?Id=water-1", "Location": "Synthetic Hall",
    "MeetingDocumentLink": [{"Url": "/agenda.pdf", "Title": "Agenda", "Type": "agenda"}],
    "Unknown": {"null": None, "zero": 0, "false": False, "nonascii": "café"},
}]}


class ReadNetwork:
    def __init__(self):
        self.fail = False
        self.calls = []

    def request(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if self.fail:
            raise OSError("Synthetic provider unavailable")
        return Response(url, json.dumps(CALENDAR).encode(), "application/json")


@pytest.fixture
def connected(tmp_path):
    engine = sa.create_engine("sqlite+pysqlite:///" + str(tmp_path / "canonical.sqlite")).execution_options(
        schema_translate_map={"townlight_meetings": None})
    MeetingStore(engine=engine)
    AgendaItemRepository(engine=engine)
    imported_meetings.metadata.create_all(engine)
    network = ReadNetwork()

    def save(**kwargs):
        return imported_meetings.commit_meeting_import(engine, **kwargs)

    workspace = ConnectorWorkspace(tmp_path / "profile", provider_transport=network, canonical_save=save)
    yield workspace, network, engine, save
    engine.dispose()


def call(workspace, operation, payload=None, *, actor="staff-1", role="staff"):
    return workspace.execute(operation, payload or {}, actor=actor, role=role)


def configure(workspace, source=None, **kwargs):
    result = call(workspace, "configure_source", {
        "source": source or {"provider": "escribe", "url": "https://pub-civic.escribemeetings.com/"},
        "new_source": True, **kwargs,
    })
    assert result["status"] == "completed", result
    return result["data"]["source_id"]


def test_preview_persists_only_requested_page(connected, monkeypatch):
    workspace, network, _, _ = connected
    meetings = []
    for index in range(30):
        meeting = deepcopy(CALENDAR["d"][0])
        meeting["ID"] = f"water-{index}"
        meeting["Url"] = f"/Meeting.aspx?Id=water-{index}"
        meetings.append(meeting)
    monkeypatch.setattr(network, "request", lambda url, **kwargs: Response(
        url, json.dumps({"d": meetings}).encode(), "application/json"))
    source_id = configure(workspace)
    result_id = call(workspace, "discover", {"source_id": source_id, "bounds": {
        "date_from": "2026-11-11", "date_to": "2026-11-11",
    }})["data"]["result_id"]
    writes = []
    original_put = workspace.storage.put

    def count_put(collection, *args, **kwargs):
        if collection == "townlight_selections":
            writes.append(args[0])
        return original_put(collection, *args, **kwargs)

    monkeypatch.setattr(workspace.storage, "put", count_put)
    first = call(workspace, "preview", {"result_id": result_id})["data"]
    assert (len(first["selections"]), first["total"], first["next_offset"], len(writes)) == (25, 30, 25, 25)
    second = call(workspace, "preview", {"result_id": result_id, "offset": 25})["data"]
    assert (len(second["selections"]), second["total"], second["next_offset"], len(writes)) == (5, 30, None, 30)
    assert {s["selection_id"] for s in first["selections"]}.isdisjoint(
        s["selection_id"] for s in second["selections"])


def test_fetch_forwards_only_documented_account_fields(connected, monkeypatch):
    workspace, _, _, _ = connected
    source_id = configure(workspace, {"provider": "escribe", "url": "https://pub-civic.escribemeetings.com/",
                                      "namespace": "//pub-civic.escribemeetings.com",
                                      "options": {"download_origins": ["https://pub-civic.escribemeetings.com"]}})
    observed = []
    monkeypatch.setattr(workspace.engine, "execute", lambda operation, request, **kwargs:
                        observed.append((operation, request)) or OperationResult("completed", data={"records": []}))
    response = call(workspace, "fetch", {"source_id": source_id, "fetch_options": {
        "api_resource": "meeting", "external_id": "42", "offset": 0, "filters": {"Words": "council"}}})
    assert response["status"] == "completed"
    operation, request = observed[0]
    assert operation == "fetch" and request["source"]["namespace"] == "//pub-civic.escribemeetings.com"
    assert request["source"]["options"] == {"download_origins": ["https://pub-civic.escribemeetings.com"]}
    assert request["api_resource"] == "meeting" and request["external_id"] == "42"
    assert request["filters"] == {"Words": "council"}
    assert call(workspace, "fetch", {"source_id": source_id, "fetch_options": {"credentials": {}}})["status"] == "failed"


def test_actual_discover_save_canonical_reopen_search_export(connected):
    workspace, network, database, save = connected
    source_id = configure(workspace)
    found = call(workspace, "discover", {"source_id": source_id, "bounds": {
        "date_from": "2026-11-11", "date_to": "2026-11-11",
    }})
    assert found["status"] == "completed", found
    assert network.calls[0][1]["method"] == "POST"
    assert found["data"]["total_records"] == 1
    result_id = found["data"]["result_id"]
    preview = call(workspace, "preview", {"result_id": result_id})
    selection = preview["data"]["selections"][0]
    selected = {k: selection[k] for k in ("selection_id", "expected_sha256")}
    with database.connect() as connection:
        assert connection.scalar(sa.select(sa.func.count()).select_from(meeting_records)) == 0
    saved = call(workspace, "save_meeting", selected)
    assert saved["data"]["canonical"]["status"] == "created", saved
    meeting_id = saved["data"]["canonical"]["meeting_id"]
    repeated = call(workspace, "save_meeting", selected)
    assert repeated["data"]["canonical"]["status"] == "unchanged"
    assert repeated["data"]["canonical"]["meeting_id"] == meeting_id
    receipt = imported_meetings.read_meeting_import(database, meeting_id)
    assert receipt["payload"]["documents"][0]["url"].endswith("/agenda.pdf")
    restarted = ConnectorWorkspace(workspace.root, provider_transport=network, canonical_save=save)
    sources = call(restarted, "sources")
    assert sources["data"]["sources"][0]["source_id"] == source_id
    assert sources["data"]["results"][0]["result_id"] == result_id
    search = call(restarted, "search", {"source_id": source_id, "query": {"phrases": ["Water Council"]}})
    assert search["status"] == "partial"  # Metadata exists, attachment text does not.
    assert search["data"]["records"][0]["capture_sha256"]
    assert search["coverage"]["available_text"][0]["status"] == "metadata_only"
    exported = call(restarted, "export", {"result_id": result_id, "format": "json"})
    assert exported["status"] == "completed", exported
    bundle = read_bundle(Path(exported["data"]["local_file"]).read_bytes(), format="json")
    assert bundle["records"][0]["original"]["Unknown"] == CALENDAR["d"][0]["Unknown"]
    assert bundle["records"][0]["citation_urls"]
    assert base64.b64decode(bundle["bundles"][0]["capture"]["content_base64"]) == json.dumps(CALENDAR).encode()


def test_saved_limited_capture_fail_retry_and_scope_isolation(connected):
    workspace, network, _, _ = connected
    source_id = configure(workspace)
    network.fail = True
    bounds = {"date_from": "2026-11-11", "date_to": "2026-11-11"}
    failed = call(workspace, "discover", {"source_id": source_id, "bounds": bounds})
    assert failed["status"] in {"failed", "partial"}, failed
    searched = call(workspace, "search", {"result_id": failed["data"]["result_id"], "query": {"terms": ["water"]}})
    assert searched["status"] != "completed"
    network.fail = False
    retry = call(workspace, "discover", {"source_id": source_id, "bounds": bounds})
    assert retry["data"]["total_records"] == 1
    saved = call(workspace, "discover", {
        "source_id": source_id, "content_base64": base64.b64encode(json.dumps(CALENDAR).encode()).decode(),
    })
    assert saved["status"] == "partial"
    assert "saved capture" in saved["coverage"]["scope"]
    assert call(workspace, "inspect", {"result_id": saved["data"]["result_id"]}, actor="other")["status"] == "failed"
    assert call(workspace, "discover", {"source_id": source_id, "principal": "admin"})["status"] == "failed"


def test_interrupted_canonical_response_reconciles_same_source_key(connected):
    workspace, _, database, save = connected
    source_id = configure(workspace)
    result_id = call(workspace, "discover", {"source_id": source_id,
        "bounds": {"date_from": "2026-11-11", "date_to": "2026-11-11"}})["data"]["result_id"]
    selected = call(workspace, "preview", {"result_id": result_id})["data"]["selections"][0]
    selected = {k: selected[k] for k in ("selection_id", "expected_sha256")}

    def lose_response(**kwargs):
        save(**kwargs)
        raise OSError("Synthetic response loss after canonical transaction")

    workspace.canonical_save = lose_response
    with pytest.raises(OSError):
        call(workspace, "save_meeting", selected)
    restarted = ConnectorWorkspace(workspace.root, canonical_save=save)
    reconciled = call(restarted, "save_meeting", selected)
    assert reconciled["data"]["canonical"]["status"] == "unchanged", reconciled
    with database.connect() as connection:
        assert connection.scalar(sa.select(sa.func.count()).select_from(meeting_records)) == 1


class WriteNetwork:
    mock = True

    def __init__(self):
        self.rows = {}
        self.writes = 0

    def send(self, url, *, method, body, **kwargs):
        if method == "POST":
            self.writes += 1
            row = {**json.loads(body), "EventId": 101, "EventRowVersion": "AQ=="}
            self.rows["101"] = row
            return WriteResponse(200, json.dumps(row).encode())
        return WriteResponse(200, json.dumps(self.rows[url.split("?")[0].rsplit("/", 1)[-1]]).encode())


def test_authorized_exact_mock_write_plan_commit_receipt_and_revocation(tmp_path):
    network = WriteNetwork()
    workspace = ConnectorWorkspace(tmp_path, write_adapters=default_adapters(network), policy={})
    source_id = call(workspace, "configure_source", {"source": {
        "provider": "legistar", "url": "https://webapi.legistar.com/v1/mock-city/events",
    }, "new_source": True}, actor="admin", role="local-admin")["data"]["source_id"]
    changes = [{"key": "council-1", "entity": "event", "operation": "create",
                "fields": {"EventDate": "2026-11-11T00:00:00", "EventBodyId": 4}}]
    request = {"source_id": source_id, "changes": changes}
    assert call(workspace, "plan_write", request, actor="admin", role="local-admin")["status"] == "failed"
    target = workspace.get("townlight_sources", source_id, workspace.context("admin", "local-admin"))["source"]
    namespace = target["namespace"]
    workspace.policy["admin"] = {
        "credentials": {"legistar": {"namespace": namespace, "token": "synthetic-secret", "permissions": ["event:create"]}},
        "write_sources": {source_id: target}, "namespaces": [namespace],
    }
    planned = call(workspace, "plan_write", request, actor="admin", role="local-admin")
    assert planned["status"] == "completed", planned
    assert network.writes == 0
    approval = {key: planned["data"][key] for key in ("plan_id", "plan_hash")}
    assert call(workspace, "commit_write", {**approval, "plan_hash": "0" * 64}, actor="admin", role="local-admin")["status"] == "failed"
    assert call(workspace, "commit_write", approval, actor="admin", role="staff")["status"] == "failed"
    committed = call(workspace, "commit_write", approval, actor="admin", role="local-admin")
    assert committed["status"] == "completed", committed
    assert network.writes == 1
    assert committed["data"]["items"][0]["readback"]["EventBodyId"] == 4
    assert "synthetic-secret" not in json.dumps(committed)
    assert call(workspace, "commit_write", approval, actor="admin", role="local-admin")["status"] == "completed"
    assert network.writes == 1
    assert call(workspace, "receipt", {"plan_id": approval["plan_id"]}, actor="admin", role="local-admin")["data"] == committed["data"]
    workspace.policy["admin"]["write_sources"].clear()
    assert call(workspace, "commit_write", approval, actor="admin", role="local-admin")["status"] == "failed"


def test_all_31_capabilities_and_34_saved_discovery_preview_adapters(tmp_path):
    corpus = os.environ.get("TOWNLIGHT_CONNECTOR_BASELINE")
    if not corpus:
        pytest.skip("Pinned original corpus required for the 34 adapters.")
    cases = json.loads((Path(corpus) / "cases.json").read_bytes())
    workspace = ConnectorWorkspace(tmp_path)
    roster = call(workspace, "providers")
    assert len(roster["data"]["providers"]) == 31
    assert len(roster["data"]["formats"]) == 34
    for case in cases:
        source_id = configure(workspace, {
            "provider": case["connector"], "url": case["source_url"], "input_format": case["input_format"],
        })
        found = call(workspace, "discover", {
            "source_id": source_id,
            "content_base64": base64.b64encode((Path(corpus) / case["file"]).read_bytes()).decode(),
        })
        assert found["status"] == "partial", (case["connector"], found)
        preview = call(workspace, "preview", {"result_id": found["data"]["result_id"]})
        assert preview["data"]["selections"], (case["connector"], preview)
        assert preview["status"] == "partial"
    assert len(call(workspace, "sources")["data"]["sources"]) == 34


def test_server_owned_policy_reload_denies_staff_and_revoked_plans(tmp_path):
    network = WriteNetwork()
    workspace = ConnectorWorkspace(tmp_path, write_adapters=default_adapters(network))
    source_id = call(workspace, "configure_source", {"source": {
        "provider": "legistar", "url": "https://webapi.legistar.com/v1/mock-city/events",
    }}, actor="admin", role="local-admin")["data"]["source_id"]
    target = workspace.get("townlight_sources", source_id, workspace.context("admin", "local-admin"))["source"]
    namespace = target["namespace"]
    policy = {"admin": {"namespaces": [namespace], "write_sources": {source_id: target},
                         "credentials": {"legistar": {"namespace": namespace, "token": "synthetic-secret", "permissions": ["event:create"]}}}}
    path = tmp_path / "config" / "secrets" / "connectors.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps(policy), encoding="utf-8")
    changes = [{"key": "council-1", "entity": "event", "operation": "create",
                "fields": {"EventDate": "2026-11-11T00:00:00", "EventBodyId": 4}}]
    request = {"source_id": source_id, "changes": changes}
    assert call(workspace, "plan_write", request, actor="admin", role="staff")["status"] == "failed"
    planned = call(workspace, "plan_write", request, actor="admin", role="local-admin")
    assert planned["status"] == "completed", planned
    approval = {key: planned["data"][key] for key in ("plan_id", "plan_hash")}
    assert "synthetic-secret" not in json.dumps(planned)
    policy["admin"]["write_sources"] = {}
    path.write_text(json.dumps(policy), encoding="utf-8")
    assert call(workspace, "commit_write", approval, actor="admin", role="local-admin")["status"] == "failed"
    assert network.writes == 0
    path.write_text('{"admin": {"namespaces": "*"}}', encoding="utf-8")
    with pytest.raises(ValueError):
        call(workspace, "sources", actor="admin", role="local-admin")


def test_default_workspace_registers_standard_adapters_without_grant(tmp_path):
    workspace = ConnectorWorkspace(tmp_path)
    assert "legistar" in workspace.adapters
    assert workspace.adapters["legistar"].mock is False
    assert call(workspace, "sources", actor="admin", role="local-admin")["data"]["can_write"] is False


def test_server_policy_supplies_account_credentials_only_to_admin(tmp_path, monkeypatch):
    workspace = ConnectorWorkspace(tmp_path)
    source_id = call(workspace, "configure_source", {"source": {
        "provider": "municode-meetings", "url": "https://meetingsgov.devmunicode.com",
        "namespace": "account-a"}}, actor="admin", role="local-admin")["data"]["source_id"]
    path = tmp_path / "config" / "secrets" / "connectors.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"admin": {"namespaces": ["account-a"], "credentials": {
        "municode-meetings": {"origin": "https://meetingsgov.devmunicode.com", "namespace": "account-a", "token": "test-only-token"}}}}), encoding="utf-8")
    observed = []
    def fetch(operation, request, **kwargs):
        observed.append(kwargs["context"])
        return OperationResult("completed", data={"records": []})
    monkeypatch.setattr(workspace.engine, "execute", fetch)
    result = call(workspace, "fetch", {"source_id": source_id, "fetch_options": {
        "api_resource": "meeting", "external_id": "42"}}, actor="admin", role="local-admin")
    assert result["status"] == "completed"
    assert observed[0].credentials["municode-meetings"]["token"] == "test-only-token"
    assert observed[0].allowed_namespaces == frozenset({"account-a"})
    assert "test-only-token" not in json.dumps(result)
    assert workspace.context("admin", "staff").credentials == {}


def test_server_policy_drives_real_sdk_account_fetch(tmp_path):
    import hashlib
    network = ReadNetwork()
    workspace = ConnectorWorkspace(tmp_path, provider_transport=network)
    configured = call(workspace, "configure_source", {"source": {
        "provider": "municode-meetings", "url": "https://meetingsgov.devmunicode.com",
        "namespace": "account-a"}}, actor="admin", role="local-admin")
    source_id = configured["data"]["source_id"]
    tenant = hashlib.sha256(str(tmp_path.resolve()).encode()).hexdigest()
    path = tmp_path / "config" / "secrets" / "connectors.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"admin": {"namespaces": ["account-a"], "credentials": {
        "municode-meetings": {"origin": "https://meetingsgov.devmunicode.com", "namespace": "account-a",
                              "tenant": tenant, "token": "test-only-token"}}}}), encoding="utf-8")
    result = call(workspace, "fetch", {"source_id": source_id, "fetch_options": {
        "api_resource": "meeting", "external_id": "42"}}, actor="admin", role="local-admin")
    assert result["status"] == "partial", result
    assert network.calls and "test-only-token" not in json.dumps(result)


def test_policy_revalidates_path_and_bounds_each_read(tmp_path, monkeypatch):
    from townlight_runtime import connectors
    workspace = ConnectorWorkspace(tmp_path)
    path = tmp_path / "config" / "secrets" / "connectors.json"
    path.parent.mkdir(parents=True)
    path.write_bytes(b" " * (1024 * 1024 + 1))
    with pytest.raises(ValueError):
        workspace.current_policy()
    seen = []
    def reject_changed_path(root, relative):
        seen.append((root, relative))
        raise ValueError("link rejected")
    monkeypatch.setattr(connectors, "safe_child", reject_changed_path)
    with pytest.raises(ValueError, match="link rejected"):
        workspace.current_policy()
    assert seen == [(tmp_path.resolve(), "config/secrets/connectors.json")]


def test_malformed_policy_target_has_generic_error(tmp_path):
    workspace = ConnectorWorkspace(tmp_path)
    path = tmp_path / "config" / "secrets" / "connectors.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"admin": {"namespaces": ["ns"], "write_sources": {"id": {"token": "never-echo"}}}}), encoding="utf-8")
    with pytest.raises(ValueError, match=r"^Connector policy is invalid\.$") as error:
        workspace.current_policy()
    assert "never-echo" not in str(error.value)
