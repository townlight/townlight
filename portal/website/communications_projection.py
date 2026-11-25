import hashlib
import os
import re
import shutil
import tempfile

from django.db import transaction

from .communications_artifact import read_article_artifact
from .models import ArticlePublication, ArticlePublicationRevision
from .townlight import release_root

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_CHUNK = 1024 * 1024
_MAX_ARTIFACT_SIZE = 32 * 1024 * 1024


class _Reject(Exception):
    """Roll back a placeholder created only to return a conflict."""


def _sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for chunk in iter(lambda: source.read(_CHUNK), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _validate_artifact(path, article_id, data):
    expected_sha = data.get("artifact_sha256")
    expected_size = data.get("artifact_size")
    if not isinstance(expected_sha, str) or not _SHA256.fullmatch(expected_sha):
        raise ValueError("invalid article artifact sha256")
    if (
        not isinstance(expected_size, int)
        or isinstance(expected_size, bool)
        or expected_size < 0
        or expected_size > _MAX_ARTIFACT_SIZE
    ):
        raise ValueError("invalid article artifact size")

    actual_size = os.path.getsize(path)
    if actual_size != expected_size:
        raise ValueError("article artifact size does not match data")
    if _sha256(path) != expected_sha:
        raise ValueError("article artifact sha256 does not match data")

    payload = read_article_artifact(os.fspath(path), article_id)
    if not isinstance(payload, dict):
        raise ValueError("article artifact payload must be a mapping")
    return expected_sha, expected_size, payload


def _store_artifact(staged_artifact, artifact_sha256, artifact_size):
    root = release_root() / "communications"
    root.mkdir(parents=True, exist_ok=True)
    target = root / f"{artifact_sha256}.zip"
    if target.exists():
        if target.stat().st_size != artifact_size or _sha256(target) != artifact_sha256:
            raise ValueError("existing article artifact failed verification")
        return
    fd, temporary = tempfile.mkstemp(dir=root, prefix=".article-", suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as output, open(staged_artifact, "rb") as source:
            shutil.copyfileobj(source, output, _CHUNK)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def project_article(article_id, sequence, digest, data, staged_artifact):
    if not isinstance(data, dict):
        raise ValueError("article projection data must be a mapping")
    if not isinstance(sequence, int) or isinstance(sequence, bool) or sequence <= 0:
        raise ValueError("invalid article sequence")
    if not isinstance(digest, str) or not _SHA256.fullmatch(digest):
        raise ValueError("invalid article digest")

    action = data.get("action", "publish")
    if action not in ("publish", "withdraw"):
        raise ValueError("invalid article action")

    artifact_sha256 = artifact_size = None
    payload = None
    if action == "publish":
        artifact_sha256, artifact_size, payload = _validate_artifact(
            staged_artifact, article_id, data
        )

    try:
        with transaction.atomic():
            defaults = {
                "title": (payload.get("title") or "") if payload is not None else "",
                "language": (payload.get("language") or "") if payload is not None else "",
                "sequence": 0,
                "digest": "",
            }
            publication, created = ArticlePublication.objects.select_for_update().get_or_create(
                id=article_id,
                defaults=defaults,
            )

            if sequence < publication.sequence or (
                sequence == publication.sequence and digest != publication.digest
            ):
                if created:
                    raise _Reject
                return "conflict"
            if sequence == publication.sequence:
                return "unchanged"

            if action == "withdraw":
                if publication.sequence == 0:
                    if created:
                        raise _Reject
                    return "conflict"
                revision_artifact_sha256 = publication.artifact_sha256
                revision_title = publication.title
                publication.withdrawn = True
            else:
                _store_artifact(staged_artifact, artifact_sha256, artifact_size)
                publication.title = payload.get("title") or ""
                publication.language = payload.get("language") or ""
                publication.artifact_sha256 = artifact_sha256
                publication.withdrawn = False
                revision_artifact_sha256 = artifact_sha256
                revision_title = publication.title

            publication.sequence = sequence
            publication.digest = digest
            publication.save(update_fields=[
                "title", "language", "sequence", "digest",
                "artifact_sha256", "withdrawn", "updated_at",
            ])
            ArticlePublicationRevision.objects.create(
                article=publication,
                sequence=sequence,
                digest=digest,
                artifact_sha256=revision_artifact_sha256,
                action=action,
                title=revision_title,
            )
            return "applied"
    except _Reject:
        return "conflict"
