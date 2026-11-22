import hashlib
import os
import re
import stat
import zipfile

from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import Http404, HttpResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe

from .models import DatasetPublication
from .townlight import release_root

EXPECTED = {"dataset.csv", "dataset.json", "data-dictionary.json"}
OPTIONAL = {"summary.txt"}
ALLOWED = EXPECTED | OPTIONAL
LIMIT = 16 * 1024 * 1024

_SHA256_RE = re.compile(r'^[0-9a-f]{64}$')


def _validate_zip(path):
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        if len(names) != len(set(names)):
            raise ValueError("duplicate zip entry")
        name_set = set(names)
        if not (EXPECTED <= name_set <= ALLOWED):
            raise ValueError("unexpected zip contents")
        total = 0
        for info in zf.infolist():
            if info.is_dir() or info.filename.endswith("/"):
                raise ValueError("directory in zip")
            if stat.S_ISLNK(info.external_attr >> 16):
                raise ValueError("symlink in zip")
            total += info.file_size
            if total > LIMIT:
                raise ValueError("zip too large")
        if zf.testzip() is not None:
            raise ValueError("bad zip CRC")


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _download_names(sha):
    if not isinstance(sha, str) or not _SHA256_RE.fullmatch(sha):
        return sorted(EXPECTED)
    path = release_root() / f"{sha}.zip"
    try:
        with zipfile.ZipFile(path) as zf:
            names = zf.namelist()
    except (OSError, zipfile.BadZipFile, RuntimeError, ValueError):
        return sorted(EXPECTED)
    result = sorted(EXPECTED)
    if "summary.txt" in set(names):
        result.append("summary.txt")
    return result


def project_dataset(dataset_id, sequence, digest, data, staged_artifact):
    with transaction.atomic():
        pub, created = DatasetPublication.objects.select_for_update().get_or_create(
            id=dataset_id,
            defaults={"sequence": 0, "digest": "", "artifact_sha256": "", "title": ""},
        )
        if not created:
            if pub.sequence == sequence and pub.digest == digest:
                return "unchanged"
            if sequence < pub.sequence or (sequence == pub.sequence and pub.digest != digest):
                return "conflict"
        action = (data or {}).get("action")
        pub.sequence = sequence
        pub.digest = digest
        pub.title = (data or {}).get("title", pub.title)
        if action == "withdraw":
            pub.artifact_sha256 = ""
        else:
            _validate_zip(staged_artifact)
            artifact_sha256 = _sha256(staged_artifact)
            root = release_root()
            os.makedirs(root, exist_ok=True)
            os.replace(staged_artifact, os.path.join(root, f"{artifact_sha256}.zip"))
            pub.artifact_sha256 = artifact_sha256
        pub.save()
        return "applied"


@require_safe
@never_cache
def datasets(request):
    dataset_rows = DatasetPublication.objects.exclude(artifact_sha256='').order_by('title', 'id')
    dataset_items = [(ds, _download_names(ds.artifact_sha256)) for ds in dataset_rows]
    return render(request, 'website/datasets.html', {
        'dataset_items': dataset_items,
    })


@require_safe
@never_cache
def download_dataset(request, dataset_id, name):
    if name not in ALLOWED:
        raise Http404
    try:
        ds = DatasetPublication.objects.exclude(artifact_sha256='').get(pk=dataset_id)
    except (DatasetPublication.DoesNotExist, ValidationError, ValueError):
        raise Http404
    sha = ds.artifact_sha256
    if not _SHA256_RE.fullmatch(sha):
        raise Http404
    path = release_root() / f"{sha}.zip"
    try:
        with zipfile.ZipFile(path) as zf:
            info = zf.getinfo(name)
            with zf.open(info) as fh:
                data = fh.read(LIMIT + 1)
    except (OSError, zipfile.BadZipFile, KeyError, RuntimeError):
        raise Http404
    if len(data) > LIMIT:
        raise Http404
    if name == 'summary.txt':
        content_type = 'text/plain; charset=utf-8'
    elif name.endswith('.csv'):
        content_type = 'text/csv; charset=utf-8'
    elif name.endswith('.json'):
        content_type = 'application/json'
    else:
        content_type = 'application/octet-stream'
    response = HttpResponse(data, content_type=content_type)
    response['Content-Disposition'] = 'attachment; filename="' + name + '"'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
