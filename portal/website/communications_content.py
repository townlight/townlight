"""Validation for Communications article.json content and member bytes."""
import hashlib
import json
import re
import uuid
from urllib.parse import urlsplit

_CANON_KEYS = {
    "title", "body", "language", "source_refs", "access_review",
    "translation_provenance", "attachment_refs",
}
_REF_KEYS = {"kind", "id", "revision", "title", "url", "sha256", "eligible"}
_ATT_KEYS = {"id", "name", "media_type", "size", "sha256", "public"}
_KINDS = {"meetings", "code", "notice", "311", "parks"}
_HEX64 = re.compile(r"^[0-9a-f]{64}$")
_RESERVED = {
    "CON", "PRN", "AUX", "NUL", "CLOCK$",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}
MIB = 1024 * 1024


def _bad():
    raise ValueError("invalid communications content")


def _canon(value):
    try:
        return json.dumps(
            value, sort_keys=True, separators=(",", ":"),
            ensure_ascii=False, allow_nan=False,
        ).encode("utf-8")
    except (TypeError, ValueError, UnicodeError):
        _bad()


def _text(value, low=1, high=2048):
    if (not isinstance(value, str) or not value.strip()
            or not low <= len(value) <= high):
        _bad()
    return value


def _sha(value):
    if not isinstance(value, str) or not _HEX64.fullmatch(value):
        _bad()
    return value


def _metadata(value):
    if not isinstance(value, dict) or len(_canon(value)) > 100_000:
        _bad()
    return value


def _url(value):
    _text(value, 1, 2048)
    if any(ord(ch) < 32 or ord(ch) == 127 or ch == "\\" for ch in value):
        _bad()
    if value.startswith("/") and not value.startswith("//"):
        return
    try:
        parsed = urlsplit(value)
        hostname = parsed.hostname
        port = parsed.port
    except ValueError:
        _bad()
    if (parsed.scheme != "https" or not parsed.netloc or not hostname
            or parsed.username is not None or parsed.password is not None):
        _bad()
    if port is not None and not 1 <= port <= 65535:
        _bad()


def _source_ref(ref):
    if not isinstance(ref, dict) or set(ref) != _REF_KEYS:
        _bad()
    if ref["kind"] not in _KINDS or ref["eligible"] is not True:
        _bad()
    _text(ref["id"], 1, 200)
    _text(ref["revision"], 1, 200)
    _text(ref["title"], 1, 512)
    _url(ref["url"])
    _sha(ref["sha256"])


def _uuid(value):
    if not isinstance(value, str):
        _bad()
    try:
        parsed = uuid.UUID(value)
    except (ValueError, AttributeError):
        _bad()
    if str(parsed) != value:
        _bad()


def _filename(value):
    _text(value, 1, 150)
    if value in {".", ".."} or value[-1] in " ." or any(
            ch in '/\\:<>"|?*' or ord(ch) < 32 or ord(ch) == 127
            for ch in value):
        _bad()
    if value.split(".", 1)[0].upper() in _RESERVED:
        _bad()


def _attachment(ref):
    if not isinstance(ref, dict) or set(ref) != _ATT_KEYS:
        _bad()
    _uuid(ref["id"])
    _filename(ref["name"])
    _text(ref["media_type"], 1, 150)
    size = ref["size"]
    if (not isinstance(size, int) or isinstance(size, bool)
            or not 1 <= size <= 10 * MIB):
        _bad()
    _sha(ref["sha256"])
    if ref["public"] is not True:
        _bad()
    return size


def _member_bytes(members, key):
    data = members.get(key)
    if not isinstance(data, (bytes, bytearray)):
        _bad()
    return bytes(data)


def validate_content(payload, members):
    """Validate an article payload and its exact member bytes; return None."""
    if not isinstance(payload, dict) or not isinstance(members, dict):
        _bad()
    try:
        content = {key: payload[key] for key in _CANON_KEYS}
    except KeyError:
        _bad()

    _text(content["title"], 1, 512)
    _text(content["body"], 1, 100_000)
    _text(content["language"], 1, 16)
    _metadata(content["access_review"])
    _metadata(content["translation_provenance"])

    if hashlib.sha256(_canon(content)).hexdigest() != payload.get("sha256"):
        _bad()
    _sha(payload.get("sha256"))

    refs = content["source_refs"]
    if not isinstance(refs, list) or len(refs) > 50:
        _bad()
    for ref in refs:
        _source_ref(ref)

    snapshots = payload.get("source_snapshots", [])
    if not isinstance(snapshots, list) or len(snapshots) != len(refs):
        _bad()
    total_snapshot_bytes = 0
    for ref, snapshot in zip(refs, snapshots):
        if (not isinstance(snapshot, dict)
                or set(snapshot) != {"reference", "content"}
                or snapshot["reference"] != ref):
            _bad()
        encoded = _canon(snapshot["content"])
        if len(encoded) > MIB:
            _bad()
        total_snapshot_bytes += len(encoded)
        if hashlib.sha256(encoded).hexdigest() != ref["sha256"]:
            _bad()
    if total_snapshot_bytes > 5 * MIB:
        _bad()

    attachments = content["attachment_refs"]
    if not isinstance(attachments, list) or len(attachments) > 20:
        _bad()
    attachment_ids = set()
    total_attachment_bytes = 0
    for ref in attachments:
        total_attachment_bytes += _attachment(ref)
        if ref["id"] in attachment_ids:
            _bad()
        attachment_ids.add(ref["id"])
    if total_attachment_bytes > 20 * MIB:
        _bad()

    expected_members = {"article.json"} | {
        f"attachments/{ref['id']}" for ref in attachments
    }
    if set(members) != expected_members:
        _bad()
    _member_bytes(members, "article.json")
    for ref in attachments:
        data = _member_bytes(members, f"attachments/{ref['id']}")
        if (len(data) != ref["size"]
                or hashlib.sha256(data).hexdigest() != ref["sha256"]):
            _bad()
    return None
