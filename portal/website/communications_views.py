# SPDX-License-Identifier: AGPL-3.0-only
"""Public, read-only views for captured article publications.

The database row is the authority for the ZIP digest.  The archive reader
validates the artifact envelope; these views only project its fields for the
existing templates and serve one verified attachment at a time.
"""
import hashlib
import json
import re
import stat
import zipfile
from pathlib import Path
from urllib.parse import quote, urlsplit
from uuid import UUID

from django.core.exceptions import ValidationError
from django.http import Http404, HttpResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

from .communications_artifact import read_article_artifact
from .models import ArticlePublication
from .townlight import max_release, release_root

_SHA = re.compile(r"[0-9a-f]{64}")
_MAX_ATTACHMENT = 16 * 1024 * 1024


class ArtifactError(Exception):
    """The published artifact is missing, inconsistent or unsafe."""


def _unavailable():
    return HttpResponse(
        "This publication is temporarily unavailable.",
        status=503,
        content_type="text/plain; charset=utf-8",
    )


def _sha256_file(path):
    digest = hashlib.sha256()
    try:
        with open(path, "rb") as handle:
            while chunk := handle.read(1024 * 1024):
                digest.update(chunk)
    except OSError as exc:
        raise ArtifactError from exc
    return digest.hexdigest()


def _artifact_path(publication):
    sha = publication.artifact_sha256
    if not isinstance(sha, str) or not _SHA.fullmatch(sha):
        raise ArtifactError
    try:
        root = Path(release_root()).resolve(strict=True)
        directory = (root / "communications").resolve(strict=True)
        if directory.parent != root or not directory.is_dir():
            raise ArtifactError
        path = (directory / (sha + ".zip")).resolve(strict=True)
        if path.parent != directory or not path.is_file():
            raise ArtifactError
        if path.stat().st_size > max_release():
            raise ArtifactError
    except (OSError, TypeError, ValueError) as exc:
        raise ArtifactError from exc
    return path


def _field(value, name, default=None):
    """Read a field from either a mapping or an object returned by the reader."""
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _display(value, default=""):
    return value if isinstance(value, str) else default


def _safe_external(value):
    """Only absolute HTTPS URLs without embedded credentials are linkable."""
    if not isinstance(value, str) or len(value) > 2048:
        return ""
    try:
        parts = urlsplit(value)
    except ValueError:
        return ""
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        return ""
    return value


def _project_source(snapshot, index):
    reference = _field(snapshot, "reference", {})
    return {
        "title": _display(_field(reference, "title")),
        "provenance": _display(_field(reference, "kind")),
        "url": _safe_external(_field(reference, "url", "")),
        "content": _field(snapshot, "content"),
        "index": index,
    }


def _project_attachment(reference):
    try:
        ident = str(UUID(str(_field(reference, "id"))))
    except (TypeError, ValueError) as exc:
        raise ArtifactError from exc
    digest = _field(reference, "sha256")
    size = _field(reference, "size")
    if not isinstance(digest, str) or not _SHA.fullmatch(digest):
        raise ArtifactError
    if type(size) is not int or not 0 < size <= _MAX_ATTACHMENT:
        raise ArtifactError
    filename = _display(_field(reference, "name"), "attachment") or "attachment"
    return {"uuid": ident, "filename": filename, "sha256": digest, "size": size}


def _project_attachments(manifest):
    references = _field(manifest, "attachment_refs", [])
    if not isinstance(references, list):
        raise ArtifactError
    return [_project_attachment(reference) for reference in references]


def _load(article_id):
    try:
        publication = ArticlePublication.objects.get(pk=article_id, withdrawn=False)
    except (ArticlePublication.DoesNotExist, TypeError, ValueError, ValidationError):
        raise Http404
    try:
        path = _artifact_path(publication)
        if _sha256_file(path) != publication.artifact_sha256:
            raise ArtifactError
        manifest = read_article_artifact(path, str(publication.pk))
    except (OSError, ValueError) as exc:
        raise ArtifactError from exc
    return publication, path, manifest


@require_safe
@never_cache
def communications_list(request):
    publications = (
        ArticlePublication.objects.filter(withdrawn=False)
        .exclude(artifact_sha256="")
        .order_by("-updated_at", "title")
    )
    return render(request, "website/communications_list.html", {"publications": publications})


@require_safe
@never_cache
def communications_detail(request, article_id):
    try:
        publication, _path, manifest = _load(article_id)
        snapshots = _field(manifest, "source_snapshots", [])
        if not isinstance(snapshots, list):
            raise ArtifactError
        sources = [_project_source(snapshot, index) for index, snapshot in enumerate(snapshots)]
        attachments = _project_attachments(manifest)
    except ArtifactError:
        return _unavailable()
    is_corrected = publication.publication_history.filter(action='publish', sequence__lt=publication.sequence).exclude(artifact_sha256='').exclude(artifact_sha256=publication.artifact_sha256).exists()
    return render(request, "website/communications_detail.html", {
        "publication": publication,
        "article": manifest,
        "sources": sources,
        "attachments": attachments,
        "is_corrected": is_corrected,
    })


@require_safe
@never_cache
def communications_source(request, article_id, index):
    try:
        publication, _path, manifest = _load(article_id)
        snapshots = _field(manifest, "source_snapshots", [])
        if not isinstance(snapshots, list) or not isinstance(index, int):
            raise Http404
        if index < 0 or index >= len(snapshots):
            raise Http404
        source = _project_source(snapshots[index], index)
        content = json.dumps(source["content"], indent=2, ensure_ascii=False, sort_keys=True, allow_nan=False)
    except ArtifactError:
        return _unavailable()
    except (TypeError, ValueError):
        raise Http404
    return render(request, "website/communications_source.html", {
        "publication": publication,
        "index": index,
        "title": source["title"],
        "provenance": source["provenance"],
        "external_url": source["url"],
        "content": content,
    })


@require_safe
@never_cache
def communications_attachment(request, article_id, attachment_id):
    try:
        _publication, path, manifest = _load(article_id)
        try:
            ident = str(UUID(str(attachment_id)))
        except (TypeError, ValueError):
            raise Http404
        item = next(
            (entry for entry in _project_attachments(manifest) if entry["uuid"] == ident),
            None,
        )
        if item is None:
            raise Http404
        member_name = "attachments/" + ident
        with zipfile.ZipFile(path) as archive:
            infos = [info for info in archive.infolist() if info.filename == member_name]
            if len(infos) != 1:
                raise ArtifactError
            info = infos[0]
            if info.is_dir() or stat.S_ISLNK(info.external_attr >> 16):
                raise ArtifactError
            if info.file_size != item["size"]:
                raise ArtifactError
            with archive.open(info) as member:
                data = member.read(item["size"] + 1)
    except ArtifactError:
        return _unavailable()
    except (EOFError, KeyError, NotImplementedError, OSError, RuntimeError,
            ValueError, zipfile.BadZipFile, zipfile.LargeZipFile):
        return _unavailable()
    if len(data) != item["size"] or hashlib.sha256(data).hexdigest() != item["sha256"]:
        return _unavailable()
    filename = item["filename"]
    fallback = "".join(
        character if 32 <= ord(character) < 127 and character not in '"\\;' else "_"
        for character in filename
    )[:150] or "attachment"
    response = HttpResponse(data, content_type="application/octet-stream")
    response["Content-Disposition"] = (
        'attachment; filename="' + fallback + '"; filename*=UTF-8\'\'' + quote(filename, safe="")
    )
    response["X-Content-Type-Options"] = "nosniff"
    response["Cache-Control"] = "private, no-store"
    return response
