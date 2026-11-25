"""Bounded ZIP envelope reader for article artifacts."""
import json
import os
import re
import zipfile

_MAX_ZIP = 32 * 1024 * 1024
_MAX_JSON = 6 * 1024 * 1024
_MAX_ENTRIES = 21
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
_KEYS = frozenset({
    "schema_version", "article_id", "revision", "title", "body", "language",
    "source_refs", "source_snapshots", "access_review",
    "translation_provenance", "attachment_refs", "sha256",
})


def _reject_constant(value):
    raise ValueError("non-finite JSON constant: %s" % value)


def _member_name(info):
    name = info.filename
    if info.is_dir() or name.endswith("/"):
        raise ValueError("directory entry not allowed: %r" % name)
    if (info.external_attr >> 16) & 0o170000 == 0o120000:
        raise ValueError("symlink entry not allowed: %r" % name)
    if info.flag_bits & 0x1:
        raise ValueError("encrypted entry not allowed: %r" % name)
    if name == "article.json":
        return name
    if name.startswith("attachments/") and _UUID.fullmatch(name[12:]):
        return name
    raise ValueError("unexpected member name: %r" % name)


def _read_member(archive, info, cap):
    if info.file_size < 0 or info.file_size > cap:
        raise ValueError("member too large: %r" % info.filename)
    with archive.open(info) as handle:
        data = handle.read(info.file_size + 1)
    if len(data) != info.file_size:
        raise ValueError("declared size mismatch: %r" % info.filename)
    return data


def _read_envelope(path, article_id):
    article_id = str(article_id)
    if os.path.getsize(path) > _MAX_ZIP:
        raise ValueError("ZIP exceeds 32 MiB on disk")
    with zipfile.ZipFile(path, "r") as archive:
        infos = archive.infolist()
        if len(infos) > _MAX_ENTRIES:
            raise ValueError("too many ZIP entries")
        seen = set()
        members = {}
        total = 0
        for info in infos:
            name = _member_name(info)
            if name in seen:
                raise ValueError("duplicate ZIP entry: %r" % name)
            seen.add(name)
            total += info.file_size
            if total > _MAX_ZIP:
                raise ValueError("declared uncompressed size exceeds 32 MiB")
            cap = _MAX_JSON if name == "article.json" else _MAX_ZIP
            members[name] = _read_member(archive, info, cap)
    raw = members.get("article.json")
    if raw is None:
        raise ValueError("missing article.json")
    payload = json.loads(raw.decode("utf-8"), parse_constant=_reject_constant)
    if type(payload) is not dict or set(payload) != _KEYS:
        raise ValueError("article.json keys do not match schema")
    if type(payload["schema_version"]) is not int or payload["schema_version"] != 1:
        raise ValueError("unsupported schema_version")
    if (not _UUID.fullmatch(article_id)
            or not isinstance(payload["article_id"], str)
            or not _UUID.fullmatch(payload["article_id"])
            or payload["article_id"] != article_id):
        raise ValueError("article_id must be a canonical UUID matching identity")
    if type(payload["revision"]) is not int or payload["revision"] <= 0:
        raise ValueError("revision must be a positive integer")
    from .communications_content import validate_content
    validate_content(payload, members)
    return payload


def read_article_artifact(path, article_id):
    """Read and validate a bounded article ZIP envelope, returning its payload."""
    try:
        return _read_envelope(path, article_id)
    except UnicodeError as exc:
        raise ValueError("malformed article artifact: %s" % exc) from exc
    except ValueError:
        raise
    except (zipfile.BadZipFile, zipfile.LargeZipFile, OSError, RuntimeError,
            EOFError, NotImplementedError, TypeError, KeyError) as exc:
        raise ValueError("malformed article artifact: %s" % exc) from exc
