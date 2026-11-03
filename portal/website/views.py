from io import BytesIO
from zoneinfo import ZoneInfo
import zipfile
import hashlib
import json
import re

from django.conf import settings
from django.http import Http404, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404, render, redirect
from django.utils import timezone
from django.core.paginator import Paginator
from wagtail.models import Site

from .models import Meeting, ServicePage
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
    "website/static/website/portal.css",
    "website/static/website/portal.js",
    "website/static/website/cityscape.svg",
    "website/static/website/chamber.svg",
)


def meetings(request):
    period = request.GET.get("period", "upcoming")
    if period not in ("upcoming", "past", "all"):
        period = "upcoming"
    query = request.GET.get("q", "").strip()[:200]
    series = request.GET.get("series", "")[:400]
    items = Meeting.objects.filter(published=True)
    titles = list(items.order_by("title").values_list("title", flat=True).distinct())
    if period == "upcoming":
        items = items.filter(scheduled_start__gte=timezone.now()).order_by("scheduled_start", "pk")
    elif period == "past":
        items = items.filter(scheduled_start__lt=timezone.now()).order_by("-scheduled_start", "-pk")
    if query:
        items = items.filter(title__icontains=query)
    if series:
        items = items.filter(title=series)
    page = Paginator(items, 20).get_page(request.GET.get("page"))
    filters = request.GET.copy()
    filters.pop("page", None)
    return render(
        request,
        "website/meetings.html",
        {"meetings": page, "period": period, "query": query, "series": series,
         "meeting_titles": titles, "filter_query": filters.urlencode()},
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


def meeting_document(request, pk, kind):
    item = get_object_or_404(Meeting, pk=pk, published=True, vendor="townlight", cancelled=False)
    labels = {"agenda": "Agenda", "packet": "Meeting packet", "minutes": "Approved minutes"}
    if kind not in labels:
        raise Http404()
    native = json.loads(item.source_body)
    if not native.get(kind):
        raise Http404()
    return render(request, "website/meeting_document.html", {
        "meeting": item, "document_title": labels[kind], "document_body": native[kind],
    })


def search(request):
    query = request.GET.get("q", "").strip()[:200]
    site = Site.find_for_request(request)
    pages = ServicePage.objects.none()
    items = Meeting.objects.none()
    if query:
        if site:
            pages = ServicePage.objects.descendant_of(site.root_page).live().public().filter(title__icontains=query).order_by("title")[:50]
        items = Meeting.objects.filter(published=True, title__icontains=query).order_by("-scheduled_start")[:50]
    return render(request, "website/search.html", {"query": query, "pages": pages, "meeting_results": items})


def find_service(request):
    choice = request.GET.get("service", "")
    if choice == "meetings":
        return redirect("meetings")
    site = Site.find_for_request(request)
    if not site or not choice.isdecimal():
        raise Http404()
    page = get_object_or_404(ServicePage.objects.descendant_of(site.root_page).live().public(), pk=int(choice))
    return redirect(page.get_url(request))


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
