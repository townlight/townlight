# SPDX-License-Identifier: AGPL-3.0-only
"""Receive only the dataset a city already approved for public delivery."""
import hashlib
import hmac
import json
import os
import re
import stat
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from django.db import OperationalError, transaction
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import Meeting, PublicationCursor
from .townlight import max_release, release_root

SHA256 = re.compile(r"[0-9a-f]{64}")
TOKEN = re.compile(r"[A-Za-z0-9_-]{43,128}")
MAX_PACKET = 64 * 1024**2
MAX_DATASET = 16 * 1024**2
MAX_ARTICLE = 32 * 1024**2
MAX_MANIFEST = 1024**2
CHUNK = 1024**2


def service_allowed(request):
    """Read the configured digest on each request so revocation takes effect without a restart."""
    value = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if not request.headers.get("Authorization", "").startswith("Bearer ") or not TOKEN.fullmatch(value):
        return False
    path = Path(os.environ.get("TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE", ""))
    if not path.is_absolute():
        return False
    try:
        with path.open(encoding="ascii") as stream:
            digest = stream.read(100).strip()
    except (OSError, UnicodeError):
        return False
    return bool(SHA256.fullmatch(digest)) and hmac.compare_digest(digest, hashlib.sha256(value.encode()).hexdigest())


def revision_state(cursor, sequence, digest):
    if cursor and sequence <= cursor.sequence:
        return "unchanged" if sequence == cursor.sequence and digest == cursor.digest else "conflict"
    return None


def stage_bundle(bundle_path, directory, meeting_id, kind):
    if kind == "packet":
        file_name, size_limit = "packet.pdf", MAX_PACKET
    elif kind == "dataset":
        file_name, size_limit = "release.bin", MAX_DATASET
    elif kind == "article":
        file_name, size_limit = "release.bin", MAX_ARTICLE
    else:
        file_name, size_limit = "release.bin", max_release()
    with zipfile.ZipFile(bundle_path) as bundle:
        entries = bundle.infolist()
        names = {entry.filename for entry in entries}
        if len(entries) != len(names) or "manifest.json" not in names or any(
            entry.is_dir() or stat.S_ISLNK(entry.external_attr >> 16) for entry in entries
        ):
            raise ValueError("Invalid bundle members")
        if bundle.getinfo("manifest.json").file_size > MAX_MANIFEST:
            raise ValueError("Manifest too large")
        data = json.loads(bundle.read("manifest.json"))
        if (not isinstance(data, dict) or data.get("version") != 2 or data.get("kind") != kind
                or data.get("meeting_id") != str(meeting_id)):
            raise ValueError("Publication identity mismatch")
        base_keys = {"version", "kind", "action", "meeting_id"}
        if data.get("action") == "withdraw":
            if set(data) != base_keys or names != {"manifest.json"}:
                raise ValueError("Invalid withdrawal")
            return data, None
        if kind in ("dataset", "article"):
            fields = {"title", "artifact_sha256", "artifact_size"}
        else:
            fields = {"title", "scheduled_start", "artifact_sha256", "artifact_size"}
            fields |= {"agenda", "index"} if kind == "packet" else {"media_type"}
        if data.get("action") != "publish" or set(data) != base_keys | fields or names != {"manifest.json", file_name}:
            raise ValueError("Invalid publication fields")
        title_limit = 512 if kind == "article" else 400
        if not isinstance(data["title"], str) or not data["title"].strip() or len(data["title"]) > title_limit:
            raise ValueError("Invalid title")
        if kind not in ("dataset", "article"):
            if not isinstance(data["scheduled_start"], str) or len(data["scheduled_start"]) > 50:
                raise ValueError("Invalid meeting time")
            data["scheduled_start"] = datetime.fromisoformat(data["scheduled_start"])
            if not timezone.is_aware(data["scheduled_start"]):
                raise ValueError("Meeting time requires a time zone")
        if kind == "packet":
            if not isinstance(data["agenda"], str) or len(data["agenda"]) > 250000:
                raise ValueError("Invalid agenda")
            index = data["index"]
            if not isinstance(index, list) or len(index) > 200 or any(
                not isinstance(row, list) or len(row) != 2 or not isinstance(row[0], str)
                or not 0 < len(row[0]) <= 400 or type(row[1]) is not int or not 0 < row[1] <= 10000
                for row in index
            ):
                raise ValueError("Invalid packet index")
        if kind == "recording" and data["media_type"] not in ("video/mp4", "application/octet-stream"):
            raise ValueError("Invalid recording type")
        sha = data["artifact_sha256"]
        size = data["artifact_size"]
        if (not isinstance(sha, str) or not SHA256.fullmatch(sha) or type(size) is not int
                or not 0 < size <= size_limit or bundle.getinfo(file_name).file_size != size):
            raise ValueError("Invalid artifact metadata")
        stage_path = directory / file_name
        digest = hashlib.sha256()
        received = 0
        with bundle.open(file_name) as src, stage_path.open("wb") as dst:
            while chunk := src.read(CHUNK):
                if received == 0:
                    if kind == "packet" and not chunk.startswith(b"%PDF-"):
                        raise ValueError("Invalid PDF")
                    if kind == "recording" and data["media_type"] == "video/mp4" and chunk[4:8] != b"ftyp":
                        raise ValueError("Invalid video")
                received += len(chunk)
                if received > size:
                    raise ValueError("Artifact size changed")
                digest.update(chunk)
                dst.write(chunk)
            dst.flush()
            os.fsync(dst.fileno())
        if received != size or digest.hexdigest() != sha:
            raise ValueError("Artifact digest mismatch")
        return data, stage_path


def store_artifact(staged, destination, sha):
    if destination.is_file():
        with destination.open("rb") as stream:
            if hashlib.file_digest(stream, "sha256").hexdigest() == sha:
                return
    os.replace(staged, destination)


@transaction.atomic
def project_revision(meeting_id, kind, sequence, digest, data, staged_artifact):
    display_timezone = os.environ.get("TOWNLIGHT_DISPLAY_TIMEZONE", "UTC")
    ZoneInfo(display_timezone)
    item, _ = Meeting.objects.select_for_update().get_or_create(
        vendor="townlight", tenant="publisher", external_id=str(meeting_id),
        defaults={"scheduled_start": timezone.now(), "display_timezone": display_timezone,
                  "published": False, "source_body": "{}"},
    )
    cursor, _ = PublicationCursor.objects.select_for_update().get_or_create(
        meeting_id=meeting_id, kind=kind, defaults={"sequence": 0, "digest": ""},
    )
    known = revision_state(cursor, sequence, digest)
    if known:
        return known
    public = json.loads(item.source_body)
    if data["action"] == "publish":
        sha = data["artifact_sha256"]
        name = sha + (".pdf" if kind == "packet" else ".bin")
        store_artifact(staged_artifact, release_root() / name, sha)
        if kind == "packet":
            item.packet_path = name
            item.agenda = [{"title": data["agenda"]}]
            public["agenda"] = data["agenda"]
            public["packet_index"] = data["index"]
            public["packet_sha256"] = sha
        else:
            item.release_path = name
            item.release_media_type = data["media_type"]
            item.revision = sha
            public["release"] = {"sha256": sha}
        if kind == "packet" or not item.packet_path:
            item.title = data["title"]
            item.scheduled_start = data["scheduled_start"]
    elif kind == "packet":
        item.packet_path = ""
        item.agenda = []
        public.pop("agenda", None)
        public.pop("packet_index", None)
        public.pop("packet_sha256", None)
    else:
        item.release_path = item.release_media_type = item.revision = ""
        public.pop("release", None)
    item.published = bool(item.packet_path or item.release_path)
    item.source_body = json.dumps(public, sort_keys=True, ensure_ascii=False)
    item.source_digest = hashlib.sha256(item.source_body.encode()).hexdigest()
    item.save()
    cursor.sequence = sequence
    cursor.digest = digest
    cursor.save(update_fields=("sequence", "digest"))
    return "applied"


@csrf_exempt
@require_POST
def receive(request, meeting_id, kind, sequence):
    if not request.is_secure() and request.META.get("REMOTE_ADDR") not in ("127.0.0.1", "::1"):
        return JsonResponse({"detail": "HTTPS required"}, status=403)
    if not service_allowed(request):
        return JsonResponse({"detail": "Publisher authorization required"}, status=401)
    digest = request.headers.get("X-Townlight-SHA256", "")
    if kind not in ("packet", "recording", "dataset", "article") or not 0 < sequence < 2**63 or not SHA256.fullmatch(digest):
        return JsonResponse({"detail": "Invalid publication identity"}, status=400)
    if kind not in ("dataset", "article"):
        cursor = PublicationCursor.objects.filter(meeting_id=meeting_id, kind=kind).first()
        known = revision_state(cursor, sequence, digest)
        if known:
            return JsonResponse({"status": known}, status=409 if known == "conflict" else 200)
    limit = (
        MAX_PACKET if kind == "packet" else
        MAX_DATASET if kind == "dataset" else
        MAX_ARTICLE if kind == "article" else
        max_release()
    ) + 2 * MAX_MANIFEST
    length_text = request.headers.get("Content-Length", "")
    if not length_text.isascii() or not length_text.isdecimal() or len(length_text) > 12:
        return JsonResponse({"detail": "Content-Length required"}, status=411)
    length = int(length_text)
    if not 0 < length <= limit:
        return JsonResponse({"detail": "Bundle too large"}, status=413)
    try:
        with tempfile.TemporaryDirectory(prefix=".incoming-", dir=release_root()) as temporary:
            directory = Path(temporary)
            path = directory / "bundle.zip"
            checksum = hashlib.sha256()
            received = 0
            with path.open("wb") as dst:
                while chunk := request.read(min(CHUNK, length - received)):
                    received += len(chunk)
                    checksum.update(chunk)
                    dst.write(chunk)
            if received != length or not hmac.compare_digest(digest, checksum.hexdigest()):
                raise ValueError("Bundle digest mismatch")
            data, artifact = stage_bundle(path, directory, meeting_id, kind)
            if kind == "dataset":
                from .datasets import project_dataset
                status = project_dataset(meeting_id, sequence, digest, data, artifact)
            elif kind == "article":
                from .communications_projection import project_article
                status = project_article(meeting_id, sequence, digest, data, artifact)
            else:
                status = project_revision(meeting_id, kind, sequence, digest, data, artifact)
    except (ValueError, UnicodeError, zipfile.BadZipFile, RuntimeError):
        return JsonResponse({"detail": "Invalid publication bundle"}, status=400)
    except (OSError, OperationalError):
        return JsonResponse({"detail": "Publication storage unavailable"}, status=503)
    return JsonResponse({"status": status}, status=409 if status == "conflict" else 200)
