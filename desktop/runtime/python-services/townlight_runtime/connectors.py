# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Townlight-owned evidence/state adapter. Provider behavior stays in the SDK."""

from __future__ import annotations

import base64
import hashlib
from copy import deepcopy
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from civic_data_connectors import OperationContext, OperationResult, Source, create_engine
from civic_data_connectors.engine import canonical_hash
from civic_data_connectors.extensions import StorageConflict
from civic_data_connectors.interchange import open_artifact
from civic_data_connectors.legacy import LegacyIdentityMapping, legacy_previews
from civic_data_connectors.models import Bounds, Error
from civic_data_connectors.storage import SQLiteStorage

OPERATIONS = {
    "providers", "capabilities", "identify", "sources", "configure_source", "discover",
    "fetch", "search", "preview", "save_evidence", "save_meeting", "export",
    "plan_write", "commit_write", "receipt", "status", "cancel", "inspect",
}
MAX_INPUT = 16 * 1024 * 1024
PAGE_SIZE = 25


def safe_child(root: Path, relative: str) -> Path:
    root = root.resolve()
    path = root / relative
    if not path.resolve().is_relative_to(root):
        raise ValueError("Connector storage must remain inside the selected profile.")
    # Reject junction/symlink ancestors even when they currently point in-profile.
    current = path
    while current != root:
        if current.is_symlink() or getattr(current, "is_junction", lambda: False)():
            raise ValueError("Connector storage cannot traverse links or junctions.")
        current = current.parent
    return path


def failure(code, message, *, data=None):
    return OperationResult("failed", data=data, errors=(Error(code, message),)).public_dict()


def only(payload, names):
    if not isinstance(payload, dict) or set(payload) - set(names):
        raise ValueError("Unexpected connector request fields. Use the documented operation.")


class ConnectorWorkspace:
    """One profile's durable SDK boundary, scoped to its authenticated actors.

    SQLiteStorage owns/closes a connection per call. No service/DB/network starts
    at module import. Injection is server-side only, never browser configuration.
    """

    def __init__(self, profile_root, *, provider_transport=None, provider_browser=None,
                 write_adapters=None, policy=None, canonical_save=None):
        self.root = Path(profile_root).resolve()
        self.storage = SQLiteStorage(safe_child(self.root, "data/connectors/evidence.sqlite"))
        self.policy = deepcopy(policy or {})
        self.adapters = write_adapters or {}
        if any(adapter.mock is not True for adapter in self.adapters.values()):
            raise ValueError("This candidate permits synthetic write transports only.")
        self.engine = create_engine(
            storage=self.storage, provider_transport=provider_transport,
            provider_browser=provider_browser, write_adapters=self.adapters,
            write_approval=self.approve_write,
        )
        self.canonical_save = canonical_save

    def approve_write(self, plan, _digest, context):
        targets = self.policy.get(context.principal, {}).get("write_sources", {}).values()
        return any(Source.from_dict(target).public_dict() == plan["source"] for target in targets)

    def context(self, actor, role, *, operation_id=None):
        policy = self.policy.get(str(actor), {}) if role == "local-admin" else {}
        granted = bool(policy and self.adapters)
        return OperationContext(
            principal=str(actor), client_id="townlight-runtime",
            tenant=hashlib.sha256(str(self.root).encode()).hexdigest(),
            authorization=frozenset({"write:plan", "write:commit"}) if granted else frozenset(),
            credentials=deepcopy(policy.get("credentials", {})),
            allowed_namespaces=frozenset(policy["namespaces"]) if "namespaces" in policy else None,
            operation_id=operation_id,
        )

    def get(self, collection, key, context):
        if not isinstance(key, str) or not key or len(key) > 128:
            raise ValueError("Select a saved connector result.")
        stored = self.storage.get(collection, key, scope=context.scope)
        if stored is None:
            raise ValueError("Saved connector work is unavailable for this account/profile.")
        return stored.value

    def snapshot(self, result, source_id, context):
        result_id = str(uuid4())
        self.storage.put("townlight_results", result_id, {
            "result": result.public_dict(), "source_id": source_id,
        }, scope=context.scope, create_only=True)
        self.storage.put("townlight_result_index", result_id, {
            "result_id": result_id, "source_id": source_id, "status": result.status,
            "record_count": len((result.data or {}).get("records", [])),
            "captured_at": datetime.now(UTC).isoformat(),
        }, scope=context.scope, create_only=True)
        return self.summary(result_id, context)

    def summary(self, result_id, context, offset=0):
        value = self.get("townlight_results", result_id, context)
        result = deepcopy(value["result"])
        data = result.get("data") or {}
        records = data.get("records", [])
        hits = data.get("hits", [])
        display = []
        for record in records[offset:offset + PAGE_SIZE]:
            display.append({
                "identity": record["identity"], "normalized": {
                    key: record.get("normalized", {}).get(key)
                    for key in ("title", "meeting_date", "scheduled_start", "body", "text_availability")
                }, "citation_urls": record.get("citation_urls", []),
                "capture_sha256": record.get("capture_sha256"),
            })
        result["data"] = {
            "result_id": result_id, "source_id": value["source_id"], "records": display,
            "total_records": len(records), "next_offset": offset + PAGE_SIZE if offset + PAGE_SIZE < len(records) else None,
            "matches": [
                {"identity": hit["identity"], "matches": [
                    {**{k: v for k, v in match.items() if k != "text"}, "text": match.get("text", "")[:2000]}
                    for match in hit.get("matches", [])[:5]
                ]} for hit in hits[offset:offset + PAGE_SIZE]
            ],
        }
        return result

    def execute(self, operation, payload, *, actor, role):
        if operation not in OPERATIONS:
            return failure("unsupported_operation", "Select a supported connector operation.")
        context = self.context(actor, role)
        try:
            return self._execute(operation, payload, context, role)
        except (ValueError, TypeError, KeyError, StorageConflict):
            return failure("invalid_request", "Connector work was not accepted. Check the selected source/result and request fields.")

    def _execute(self, operation, payload, context, role):
        if operation in {"providers", "capabilities", "identify"}:
            only(payload, {"provider", "url"} if operation != "providers" else set())
            return self.engine.execute(operation, payload, context=context).public_dict()
        if operation == "sources":
            only(payload, set())
            return OperationResult("completed", data={
                "sources": [item.value for item in self.storage.list("townlight_sources", scope=context.scope)],
                "results": sorted(
                    (item.value for item in self.storage.list("townlight_result_index", scope=context.scope)),
                    key=lambda row: row["captured_at"], reverse=True,
                )[:100],
                "can_write": bool(context.authorization), "write_mode": "mock_only",
            }).public_dict()
        if operation == "configure_source":
            only(payload, {"source", "new_source", "identity_mappings"})
            if type(payload.get("new_source", False)) is not bool:
                raise ValueError("new_source must be explicit boolean.")
            mappings = payload.get("identity_mappings", [])
            if mappings and role != "local-admin":
                return failure("permission_denied", "Only a local administrator may approve a source identity transition.")
            checked = [LegacyIdentityMapping(**mapping) for mapping in mappings]
            validated = self.engine.execute("validate_source", {"source": payload["source"]}, context=context)
            if validated.status != "completed":
                return validated.public_dict()
            source_id = str(uuid4())
            source = validated.data["source"]
            if any(m.provider != source["provider"] or m.upstream_namespace != source["namespace"] for m in checked):
                raise ValueError("Identity mappings must match the configured source.")
            stored = {"source_id": source_id, "source": source,
                      "new_source": payload.get("new_source", False), "identity_mappings": mappings}
            self.storage.put("townlight_sources", source_id, stored, scope=context.scope, create_only=True)
            return OperationResult("completed", data=stored, coverage=validated.coverage).public_dict()
        if operation in {"discover", "fetch"}:
            only(payload, {"source_id", "bounds", "content_base64", "attachment", "operation_id", "fetch_options"})
            configured = self.get("townlight_sources", payload["source_id"], context)
            bounds = Bounds(**payload.get("bounds", {}))
            if bounds.parser_bytes > MAX_INPUT or bounds.max_records > 1000 or bounds.max_pages > 25 or bounds.deadline_seconds > 45:
                raise ValueError("Request exceeds the desktop operation bounds.")
            content = None
            if "content_base64" in payload:
                if len(payload["content_base64"]) > 4 * ((MAX_INPUT + 2) // 3):
                    raise ValueError("The saved capture is too large.")
                content = base64.b64decode(payload["content_base64"], validate=True)
            context.operation_id = payload.get("operation_id") or str(uuid4())
            request = {"source": configured["source"], "bounds": payload.get("bounds", {})}
            if "fetch_options" in payload:
                if operation != "fetch":
                    raise ValueError("Provider request fields are supported only for fetch.")
                options = payload["fetch_options"]
                only(options, {"api_resource", "external_id", "offset", "filters"})
                request.update(options)
            if "attachment" in payload:
                request["attachment"] = payload["attachment"]
            result = self.engine.execute(operation, request, content=content, context=context)
            return self.snapshot(result, payload["source_id"], context)
        if operation == "inspect":
            only(payload, {"result_id", "offset"})
            offset = payload.get("offset", 0)
            if type(offset) is not int or offset < 0:
                raise ValueError("Invalid result page.")
            return self.summary(payload["result_id"], context, offset)
        if operation in {"preview", "save_evidence", "export", "search"}:
            only(payload, {"result_id", "source_id", "query", "format", "offset"})
            stored = self.get("townlight_results", payload["result_id"], context) if payload.get("result_id") else None
            if operation == "search":
                query = dict(payload.get("query", {}))
                if payload.get("source_id"):
                    configured = self.get("townlight_sources", payload["source_id"], context)
                    query["providers"] = [configured["source"]["provider"]]
                    query["namespaces"] = [configured["source"]["namespace"]]
                request = {"query": query}
                if stored:
                    request["result"] = stored["result"]
                result = self.engine.execute("search", request, context=context)
                if stored and result.data is not None:
                    parent = stored["result"].get("data") or {}
                    result.data["bundles"] = parent.get("bundles", [parent])
                return self.snapshot(result, stored["source_id"] if stored else payload.get("source_id"), context)
            if stored is None:
                raise ValueError("Select a captured result first.")
            if operation == "save_evidence":
                result = self.engine.execute("import_bundle", {"result": stored["result"], "persist": True}, context=context)
                # Do not return captured bytes to the WebView.
                public = result.public_dict()
                public["data"] = {k: v for k, v in (public.get("data") or {}).items() if k != "bundle"}
                return public
            if operation == "export":
                result = self.engine.execute("export", {
                    "result": stored["result"], "format": payload.get("format", "zip"), "delivery": "storage",
                }, context=context)
                if result.data and result.data.get("artifact_id"):
                    _metadata, stream = open_artifact(self.engine, result.data["artifact_id"], context=context)
                    extension = {"json": "json", "jsonl": "jsonl", "csv-meetings": "csv", "csv-items": "csv", "ics": "ics"}.get(payload.get("format"), "zip")
                    path = safe_child(self.root, f"exports/meetings/connectors/{uuid4().hex}.{extension}")
                    path.parent.mkdir(parents=True, exist_ok=True)
                    staging = path.with_suffix(path.suffix + ".partial")
                    size = 0
                    try:
                        with staging.open("xb") as output:
                            while chunk := stream.read(65536):
                                size += len(chunk)
                                if size > 200 * 1024 * 1024:
                                    raise ValueError("Export exceeds transfer bounds.")
                                output.write(chunk)
                    finally:
                        stream.close()
                    staging.rename(path)
                    result.data["local_file"] = str(path)
                    result.data["byte_length"] = size
                return result.public_dict()
            configured = self.get("townlight_sources", stored["source_id"], context)
            result = legacy_previews(
                stored["result"], new_source=configured["new_source"],
                identity_mappings=tuple(LegacyIdentityMapping(**m) for m in configured["identity_mappings"]),
            )
            offset = payload.get("offset", 0)
            if type(offset) is not int or offset < 0:
                raise ValueError("Invalid preview page.")
            selections = []
            total = 0
            for page in (result.data or {}).get("previews", []):
                for meeting in page["meetings"]:
                    index = total
                    total += 1
                    if index < offset or index >= offset + PAGE_SIZE:
                        continue
                    selection = {"source": page["source"], "meeting": meeting, "result_id": payload["result_id"]}
                    key = canonical_hash(selection)
                    if self.storage.get("townlight_selections", key, scope=context.scope) is None:
                        try:
                            self.storage.put("townlight_selections", key, selection, scope=context.scope, create_only=True)
                        except StorageConflict:
                            pass
                    selections.append({"selection_id": key, "expected_sha256": page["source"]["sha256"],
                                       "external_id": meeting["external_id"], "title": meeting["title"]})
            public = result.public_dict()
            public["data"] = {"selections": selections, "total": total,
                              "next_offset": offset + PAGE_SIZE if offset + PAGE_SIZE < total else None}
            return public
        if operation == "save_meeting":
            only(payload, {"selection_id", "expected_sha256"})
            selected = self.get("townlight_selections", payload["selection_id"], context)
            if canonical_hash(selected) != payload["selection_id"] or selected["source"]["sha256"] != payload["expected_sha256"]:
                return failure("source_changed", "The selected source changed. Preview it again.")
            stored = self.get("townlight_results", selected["result_id"], context)
            saved = self.engine.execute("import_bundle", {"result": stored["result"], "persist": True}, context=context)
            if not saved.data or not saved.data.get("persisted"):
                return OperationResult(saved.status, errors=saved.errors, coverage=saved.coverage).public_dict()
            # Intent precedes canonical DB mutation. Retry reconciles through its
            # existing unique source key even after response loss/process restart.
            ledger_key = payload["selection_id"]
            old = self.storage.get("townlight_canonical", ledger_key, scope=context.scope)
            self.storage.put("townlight_canonical", ledger_key, {"state": "sending", "selection_id": ledger_key},
                             scope=context.scope, expected_version=old.version if old else None, create_only=old is None)
            if self.canonical_save is None:
                raise ValueError("Canonical repository is not configured.")
            result = self.canonical_save(actor=context.principal, source=selected["source"], meeting=selected["meeting"])
            current = self.storage.get("townlight_canonical", ledger_key, scope=context.scope)
            self.storage.put("townlight_canonical", ledger_key, {"state": "saved", "receipt": result},
                             scope=context.scope, expected_version=current.version)
            return OperationResult(saved.status, data={"canonical": result, "evidence_persisted": True},
                                   errors=saved.errors, coverage=saved.coverage).public_dict()
        if operation in {"plan_write", "commit_write", "receipt"}:
            if not context.authorization:
                return failure("permission_denied", "Outbound requires a local administrator and explicit server-owned mock policy.")
            if operation == "plan_write":
                only(payload, {"source_id", "changes"})
                configured = self.get("townlight_sources", payload["source_id"], context)
                target = self.policy.get(context.principal, {}).get("write_sources", {}).get(payload["source_id"])
                if target is None:
                    return failure("permission_denied", "No exact provider write target is bound to this configured source.")
                if target["provider"] != configured["source"]["provider"]:
                    raise ValueError("Write provider must match the configured source.")
                request = {"source": target, "changes": payload["changes"]}
            else:
                only(payload, {"plan_id", "plan_hash"} if operation == "commit_write" else {"plan_id"})
                request = payload
            return self.engine.execute(operation, request, context=context).public_dict()
        only(payload, {"operation_id"})
        return self.engine.execute(operation, payload, context=context).public_dict()
