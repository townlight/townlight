from io import BytesIO
from zoneinfo import ZoneInfo
import zipfile
import hashlib
import json
import re

from django.conf import settings
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, render

from .models import Meeting
from .townlight import release_file


SOURCE_FILES = (
    "manage.py",
    "serve.py",
    "pyproject.toml",
    "requirements.lock",
    "LICENSE",
    "LICENSE-CIVICCAST-APACHE-2.0",
    "UPSTREAM.md",
    "README.md",
    "ARCHITECTURE.md",
    "SOURCE-AVAILABILITY.txt",
    "fixtures/meeting.json",  # The designated public sample, not runtime inputs.
)


def meetings(request):
    return render(
        request,
        "website/meetings.html",
        {"meetings": Meeting.objects.filter(published=True)},
    )


def meeting(request, pk):
    item = get_object_or_404(Meeting, pk=pk, published=True)
    return render(
        request,
        "website/meeting.html",
        {
            "meeting": item,
            "local_start": item.scheduled_start.astimezone(ZoneInfo(item.display_timezone)),
            "native": json.loads(item.source_body) if item.vendor == 'townlight' else None,
        },
    )


def release(request, pk):
    item = get_object_or_404(Meeting, pk=pk, published=True, vendor='townlight')
    try:
        stream = release_file(item).open('rb')
        size = stream.seek(0, 2)
        stream.seek(0)
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
        stream.seek(0)
    except (OSError, ValueError):
        raise Http404('Release unavailable')
    if not size or digest != item.revision:
        stream.close()
        raise Http404('Release unavailable')
    start, end, status = 0, size - 1, 200
    value = request.headers.get('Range')
    if value:
        match = re.fullmatch(r'bytes=(\d*)-(\d*)', value)
        if not match or not any(match.groups()):
            stream.close()
            return HttpResponse(status=416, headers={'Content-Range': f'bytes */{size}'})
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), end) if last else end
        else:
            start = max(size - int(last), 0)
        if start >= size or start > end:
            stream.close()
            return HttpResponse(status=416, headers={'Content-Range': f'bytes */{size}'})
        status = 206
    class FileChunks:
        # Django registers this close method even when a HEAD response is never
        # iterated. A generator's finally alone does not close an unopened body.
        def __init__(self):
            stream.seek(start)
            self.remaining = end - start + 1

        def __iter__(self):
            return self

        def __next__(self):
            chunk = stream.read(min(1024 * 1024, self.remaining)) if self.remaining else b''
            if not chunk:
                self.close()
                raise StopIteration
            self.remaining -= len(chunk)
            return chunk

        def close(self):
            stream.close()

    response = StreamingHttpResponse(FileChunks(), status=status, content_type=item.release_media_type)
    response['Accept-Ranges'] = 'bytes'
    response['Content-Length'] = str(end - start + 1)
    response['X-Content-Type-Options'] = 'nosniff'
    if status == 206:
        response['Content-Range'] = f'bytes {start}-{end}/{size}'
    return response


def source(request):
    # Only source code and an explicit public sample belong in the archive.
    # Runtime fixture JSON, the database, media and credentials are excluded.
    out = BytesIO()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in SOURCE_FILES:
            path = settings.BASE_DIR / name
            if path.is_file():
                archive.write(path, name)
        for directory in ("portal", "website", "vendor"):
            for path in (settings.BASE_DIR / directory).rglob("*"):
                if (
                    path.is_file()
                    and path.suffix in (".py", ".html")
                    and "__pycache__" not in path.parts
                ):
                    archive.write(path, path.relative_to(settings.BASE_DIR).as_posix())
        for name in ('portal_publication.py', 'services.py'):
            bridge = settings.BASE_DIR.parent / 'desktop/runtime/python-services/civicsuite_runtime' / name
            if bridge.is_file():
                archive.write(bridge, 'integration/' + name)
    response = HttpResponse(out.getvalue(), content_type="application/zip")
    response["Content-Disposition"] = 'attachment; filename="townlight-source.zip"'
    return response
