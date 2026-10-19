"""Read-only preflight for the approved owner/test-data import.

This is NOT an activation command. No file, SQL row, approval or historical
hash is changed here. The transactional importer must consume this exact
snapshot and recheck it before recording completion/activating the profile.
"""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import uuid

from app.desktop_bridge.schemas import RecordsView
from app.requests.files import managed_records_root

ROOT_FIELDS = frozenset({"schema_version", "demo_fixture", "meeting_bodies", "meeting_members",
    "agenda_intakes", "meetings", "records_requests", "code_sources", "code_handoffs",
    "adopted_legislation", "audit_entries", "publication_events", "notification_events", "access"})
STRING_DEFAULTS = ("public_tracking_number", "requester_contact", "submitted_via", "deadline_basis",
    "assigned_to", "fee_estimate", "fee_waiver_reason", "response_draft")
LIST_DEFAULTS = ("clarification_notes", "search_notes", "search_sessions", "exemption_reviews",
    "exemption_decisions", "fee_line_items", "citations", "approval_notes", "exports",
    "release_packages", "timeline", "public_status_events", "messages", "documents")
TIME_DEFAULTS = ("deadline_reviewed_at_unix_seconds", "approved_at_unix_seconds",
    "fulfilled_at_unix_seconds", "closed_at_unix_seconds")


@dataclass(frozen=True)
class ImportPreflight:
    source_path: Path
    source_bytes: bytes
    source_sha256: str
    original: dict
    records: tuple[RecordsView, ...]
    verified_files: tuple[tuple[str, str, int], ...]
    legacy_audit_head: str
    unhashed_audit_entries: int


def unique_object(pairs):
    value = {}
    for key, item in pairs:
        if key in value:
            raise ValueError("Duplicate JSON field; import refused without changing source.")
        value[key] = item
    return value


def stable_id(profile_root: Path, kind: str, legacy_id: str) -> str:
    # Profile-specific namespace prevents collisions between distinct owner/test profiles.
    namespace = uuid.uuid5(uuid.NAMESPACE_URL, str(profile_root.resolve()).casefold())
    return str(uuid.uuid5(namespace, f"{kind}\n{legacy_id}"))


def normalize_record(profile_root, raw):
    item = dict(raw)
    if "request_id" in item:
        raise ValueError("Legacy Records input unexpectedly contains a canonical request ID.")
    item["request_id"] = stable_id(profile_root, "request", item["id"])
    for name in STRING_DEFAULTS:
        item.setdefault(name, "")
    for name in LIST_DEFAULTS:
        item.setdefault(name, [])
    for name in TIME_DEFAULTS:
        item.setdefault(name, None)
    documents = []
    for doc in item["documents"]:
        if "attachment_id" in doc:
            raise ValueError("Legacy attachment unexpectedly contains a canonical ID.")
        documents.append({**doc, "attachment_id": stable_id(profile_root, f"document:{item['id']}", doc["id"])})
    item["documents"] = documents
    item["fee_line_items"] = [{"schedule_basis": "", **row} for row in item["fee_line_items"]]
    item["release_packages"] = [{"release_artifact_count": 0, **row} for row in item["release_packages"]]
    view = RecordsView.model_validate(item, strict=True)
    for name in ("documents", "search_sessions", "exemption_decisions", "fee_line_items", "release_packages", "timeline", "public_status_events", "messages"):
        identifiers = [row.id for row in getattr(view, name)]
        if len(set(identifiers)) != len(identifiers):
            raise ValueError(f"Duplicate {name} identities; import refused.")
    if any(message.visibility not in {"internal", "requester thread"} for message in view.messages):
        raise ValueError("Unknown message visibility; import refused.")
    return view


def verify_file(path_text, expected_hash, expected_size, allowed_root):
    path = Path(path_text).resolve(strict=True)
    if not path.is_relative_to(allowed_root.resolve()) or not path.is_file():
        raise ValueError("Referenced evidence is outside the configured data root.")
    with path.open("rb") as source:
        digest = hashlib.file_digest(source, "sha256").hexdigest()
    size = path.stat().st_size
    if digest != expected_hash or (expected_size is not None and size != expected_size):
        raise ValueError("Referenced evidence differs from its recorded hash/size.")
    return str(path), digest, size


def preflight(profile_root: Path) -> ImportPreflight:
    data_root = managed_records_root(profile_root).parent.parent
    source_path = data_root / "workflows" / "city-work.json"
    source_bytes = source_path.read_bytes()
    original = json.loads(source_bytes, object_pairs_hook=unique_object,
                          parse_constant=lambda value: (_ for _ in ()).throw(ValueError("Invalid JSON number")))
    if not isinstance(original, dict) or set(original) - ROOT_FIELDS:
        raise ValueError("Unknown city-work fields; import refused without dropping data.")
    version = original.get("schema_version", 1)
    if type(version) is not int or version != 1:
        raise ValueError("Unsupported city-work schema version; source was not changed.")
    for name in ("meetings", "records_requests", "code_sources", "code_handoffs", "audit_entries"):
        if not isinstance(original.get(name), list):
            raise ValueError(f"Missing or invalid legacy {name} collection.")
    records = tuple(normalize_record(profile_root, item) for item in original["records_requests"])
    for identifiers in ([row.id for row in records], [row.public_tracking_number for row in records if row.public_tracking_number]):
        if len(set(identifiers)) != len(identifiers):
            raise ValueError("Duplicate Records identity/tracking number; import refused.")
    files = []
    for row in records:
        for doc in row.documents:
            files.append(verify_file(doc.stored_path, doc.sha256, doc.size_bytes, data_root))
            if doc.release_stored_path:
                files.append(verify_file(doc.release_stored_path, doc.release_sha256, doc.release_size_bytes, data_root))
        packages = {p.export_path: p.package_hash for p in row.release_packages}
        for path_text in dict.fromkeys([*row.exports, *packages]):
            path = Path(path_text).resolve(strict=True)
            if not path.is_relative_to(data_root.resolve()):
                raise ValueError("Referenced export is outside the configured data root.")
            manifest_path = path.with_name(path.name + ".manifest.json")
            if not manifest_path.exists():
                # Published native rc.3 exports use this receipt suffix. Keep
                # the same content/hash checks; never rewrite historical files.
                manifest_path = path.with_name(path.name + ".sha256.json")
            manifest = json.loads(manifest_path.read_bytes())
            if (manifest.get("export_file") != path.name or type(manifest.get("schema_version")) is not int
                    or manifest["schema_version"] != 1 or type(manifest.get("size_bytes")) is not int
                    or manifest["size_bytes"] < 0):
                raise ValueError("Unsupported or mismatched export manifest.")
            digest = packages.get(path_text, manifest.get("sha256"))
            if digest != manifest.get("sha256"):
                raise ValueError("Release package and manifest hashes disagree.")
            files.append(verify_file(path_text, digest, manifest.get("size_bytes"), data_root))
    head = "GENESIS"
    unhashed = 0
    for entry in original["audit_entries"]:
        if not entry.get("entry_hash"):
            # Older unhashed history is preserved, not silently certified/rehashed.
            unhashed += 1
            head = "GENESIS"
            continue
        if entry.get("previous_hash") != head:
            raise ValueError("Legacy audit chain linkage failed; source preserved.")
        content = "\n".join(str(entry[key]) for key in ("previous_hash", "id", "module_id", "action", "summary", "created_at_unix_seconds"))
        if hashlib.sha256(content.encode()).hexdigest() != entry["entry_hash"]:
            raise ValueError("Legacy audit entry hash failed; source preserved.")
        head = entry["entry_hash"]
    return ImportPreflight(source_path, source_bytes, hashlib.sha256(source_bytes).hexdigest(),
                           original, records, tuple(files), head, unhashed)
