# SPDX-License-Identifier: AGPL-3.0-only
"""CSRF-protected public 311 views backed only by the resident session vault."""
import base64
import binascii
import hashlib
import hmac
import re
import uuid
from urllib.parse import quote

from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from . import resident_session
from .resident_inbox import ResidentInboxRejected, ResidentInboxUnavailable
from .resident_catalog import read_catalog
from .resident_forms import (
    MAX_ATTACHMENT_BYTES,
    AttachmentForm,
    CommentForm,
    DownloadForm,
    LookupForm,
    RecoveryCompleteForm,
    RecoveryStartForm,
    ReopenForm,
    RequestForm,
)

GENERIC = "We could not complete that request. Please try again."
NOT_FOUND = "That resident request is not available."
ALLOWED_DOWNLOAD_TYPES = {
    "image/png",
    "image/jpeg",
    "application/pdf",
    "text/plain",
}
_SAFE_NAME = re.compile(r"[^A-Za-z0-9._ ()\-]")
_SHA256 = re.compile(r"[0-9a-f]{64}")


def _secured(response):
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    response["Referrer-Policy"] = "no-referrer"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def _render(request, context, status=200):
    return _secured(render(request, "website/resident_service_requests.html", context, status=status))


def _redirect(url):
    return _secured(HttpResponseRedirect(url))


def _message(request, title, message, status=200):
    return _render(request, {"mode": "message", "title": title, "message": message}, status)


def _error(request, message=GENERIC, status=400):
    return _message(request, "Request unavailable", message, status)


def _command_url(command_id):
    return reverse("resident-311-command", args=[str(command_id)])


def _detail_url(request_id):
    return reverse("resident-311-detail", args=[str(request_id)])


def _pending(request, command_id, title="Request received"):
    return _render(request, {
        "mode": "pending",
        "title": title,
        "message": "Your request is being processed by the city service queue.",
        "status_url": _command_url(command_id),
    })


def _request_id_from_tracking(tracking):
    digits = resident_session.normalize_tracking(tracking)
    return str(uuid.UUID(hex=digits[len("TL311-"):]))


def _tracking_for(request_id):
    return "TL311-" + str(uuid.UUID(str(request_id))).hex


def _credential(request, request_id):
    try:
        return resident_session.credential(request.session, request_id)
    except resident_session.ResidentSessionRejected:
        return None


@csrf_protect
@require_http_methods(["GET", "POST"])
def home(request):
    catalog = read_catalog()
    available = bool(catalog.get("available"))
    categories = catalog.get("categories") or []
    if request.method == "GET":
        return _render(request, {
            "mode": "home",
            "title": "Request a city service",
            "catalog_available": available,
            "form": RequestForm(categories=categories),
        })
    if not available:
        return _error(request, "Service request categories are temporarily unavailable.", 503)
    form = RequestForm(request.POST, categories=categories)
    if not form.is_valid():
        return _render(request, {
            "mode": "home",
            "title": "Request a city service",
            "catalog_available": True,
            "form": form,
        }, 400)
    data = form.cleaned_data
    try:
        resident_session.create_request(
            request.session,
            category=data["category"],
            description=data["description"],
            location=data["location"],
            contact_name=data["contact_name"],
            email=data["email"],
            phone=data["phone"],
            command_id=data["command_id"],
        )
    except (resident_session.ResidentSessionError, ResidentInboxRejected, ResidentInboxUnavailable):
        return _error(request, GENERIC, 503)
    return _pending(request, data["command_id"])


@csrf_protect
@require_http_methods(["GET", "POST"])
def lookup(request):
    if request.method == "GET":
        return _render(request, {
            "mode": "lookup",
            "title": "Track a city service request",
            "form": LookupForm(),
        })
    form = LookupForm(request.POST)
    if not form.is_valid():
        return _render(request, {
            "mode": "lookup",
            "title": "Track a city service request",
            "form": form,
        }, 400)
    data = form.cleaned_data
    try:
        request_id = _request_id_from_tracking(data["tracking"])
        resident_session.save_credential(request.session, request_id, data["access_token"])
        resident_session.submit(
            request.session,
            "read_request",
            {"request_id": request_id, "resident_token": data["access_token"]},
            data["command_id"],
        )
    except (resident_session.ResidentSessionError, ResidentInboxRejected, ResidentInboxUnavailable):
        return _error(request, NOT_FOUND, 404)
    return _pending(request, data["command_id"], "Lookup submitted")


def _download_response(result):
    try:
        content = base64.b64decode(str(result["content_base64"]), validate=True)
        size = int(result["size"])
        digest = str(result["sha256"]).lower()
        media_type = str(result["media_type"]).lower()
    except (KeyError, TypeError, ValueError, binascii.Error):
        return None
    if size != len(content) or size > MAX_ATTACHMENT_BYTES:
        return None
    if media_type not in ALLOWED_DOWNLOAD_TYPES:
        return None
    if not _SHA256.fullmatch(digest):
        return None
    if not hmac.compare_digest(hashlib.sha256(content).hexdigest(), digest):
        return None
    raw_name = str(result.get("name") or "attachment").replace("\\", "/")
    name = _SAFE_NAME.sub("_", raw_name.rsplit("/", 1)[-1]).strip(" .")[:255]
    if not name:
        name = "attachment"
    response = HttpResponse(content, content_type=media_type)
    response["Content-Disposition"] = (
        'attachment; filename="%s"; filename*=UTF-8\'\'%s'
        % (name.encode("ascii", "replace").decode("ascii"), quote(name))
    )
    response["Content-Length"] = str(size)
    return _secured(response)


def _render_request(request, row, source):
    record = source.get("request") if isinstance(source.get("request"), dict) else source
    if not isinstance(record, dict):
        return _error(request, GENERIC, 502)
    try:
        request_id = str(uuid.UUID(str(record.get("id"))))
        revision = int(record.get("revision"))
    except (ValueError, TypeError, AttributeError):
        return _error(request, GENERIC, 502)
    if revision < 1:
        return _error(request, GENERIC, 502)
    initial = {"expected_revision": revision}
    return _render(request, {
        "mode": "detail",
        "title": "Your city service request",
        "request_record": record,
        "request_id": request_id,
        "tracking": record.get("tracking") or _detail_url(request_id),
        "comment_form": CommentForm(initial=dict(initial, command_id=str(uuid.uuid4()))),
        "reopen_form": ReopenForm(initial=dict(initial, command_id=str(uuid.uuid4()))),
        "upload_form": AttachmentForm(initial=dict(initial, command_id=str(uuid.uuid4()))),
        "download_form": DownloadForm(initial={"command_id": str(uuid.uuid4())}),
        "detail_url": _detail_url(request_id),
        "refresh_url": _detail_url(request_id),
    })


def _read_detail(request, command_id, row, source):
    return _render_request(request, row, source)


@require_http_methods(["GET"])
def command(request, command_id):
    try:
        row = resident_session.status(request.session, command_id)
    except resident_session.ResidentSessionRejected:
        return _error(request, NOT_FOUND, 404)
    except (resident_session.ResidentSessionError, ResidentInboxRejected, ResidentInboxUnavailable):
        return _error(request, NOT_FOUND, 404)
    state = row.get("state")
    if state == "failed":
        return _message(request, "Request not completed", GENERIC, 502)
    if state != "completed":
        return _pending(request, command_id, "Request in progress")
    operation = row.get("operation")
    result = row.get("result") if isinstance(row.get("result"), dict) else {}
    if operation == "create_request":
        request_id = resident_session.mark_successful(request.session, command_id)
        token = resident_session.pending_token(request.session, command_id)
        if not request_id or not token:
            return _error(request, GENERIC, 502)
        return _render(request, {
            "mode": "created",
            "title": "Request received",
            "tracking": result.get("tracking") or _tracking_for(request_id),
            "access_token": token,
            "detail_url": _detail_url(request_id),
        })
    if operation == "read_request":
        return _read_detail(request, command_id, row, result)
    if operation == "begin_recovery":
        challenge_id = result.get("challenge_id")
        if not challenge_id:
            return _error(request, "Recovery could not be started.", 400)
        return _render(request, {
            "mode": "recovery_complete",
            "title": "Enter your recovery code",
            "form": RecoveryCompleteForm(initial={"challenge_id": challenge_id}),
        })
    if operation == "complete_recovery":
        request_id = resident_session.mark_recovered(request.session, command_id)
        token = resident_session.pending_token(request.session, command_id)
        if not request_id or not token:
            return _error(request, "Recovery could not be completed.", 400)
        return _render(request, {
            "mode": "recovered",
            "title": "Access restored",
            "tracking": _tracking_for(request_id),
            "access_token": token,
            "detail_url": _detail_url(request_id),
        })
    if operation == "download_attachment":
        response = _download_response(result)
        if response is None:
            return _error(request, "The attachment could not be verified.", 502)
        return response
    if operation in {"comment", "upload_attachment", "reopen"}:
        if operation == "upload_attachment":
            request_id = result.get("request_id")
        else:
            record = result.get("request") if isinstance(result.get("request"), dict) else result
            request_id = record.get("id") if isinstance(record, dict) else None
        if not request_id:
            return _error(request, GENERIC, 502)
        return _render(request, {
            "mode": "committed",
            "title": "Request updated",
            "message": "Your change was committed by the city service queue.",
            "detail_url": _detail_url(request_id),
            "refresh_url": _command_url(command_id),
        })
    return _error(request, GENERIC, 502)


@csrf_protect
@require_http_methods(["GET", "POST"])
def detail(request, request_uuid):
    token = _credential(request, request_uuid)
    if not token:
        return _error(request, NOT_FOUND, 404)
    if request.method == "GET":
        command_id = str(uuid.uuid4())
        try:
            resident_session.submit(
                request.session,
                "read_request",
                {"request_id": str(request_uuid), "resident_token": token},
                command_id,
            )
        except (resident_session.ResidentSessionError, ResidentInboxRejected, ResidentInboxUnavailable):
            return _error(request, GENERIC, 503)
        return _redirect(_command_url(command_id))
    action = request.POST.get("action")
    try:
        if action == "comment":
            form = CommentForm(request.POST)
            if not form.is_valid():
                return _error(request, GENERIC, 400)
            data = form.cleaned_data
            payload = {
                "request_id": str(request_uuid),
                "resident_token": token,
                "expected_revision": data["expected_revision"],
                "message": data["message"],
            }
            operation = "comment"
        elif action == "reopen":
            form = ReopenForm(request.POST)
            if not form.is_valid():
                return _error(request, GENERIC, 400)
            data = form.cleaned_data
            payload = {
                "request_id": str(request_uuid),
                "resident_token": token,
                "expected_revision": data["expected_revision"],
                "reason": data["reason"],
            }
            operation = "reopen"
        elif action == "upload":
            form = AttachmentForm(request.POST, request.FILES)
            if not form.is_valid():
                return _error(request, "That attachment could not be accepted.", 400)
            data = form.cleaned_data
            payload = {
                "request_id": str(request_uuid),
                "resident_token": token,
                "expected_revision": data["expected_revision"],
                "name": data["cleanname"],
                "media_type": data["media_type"],
                "content_base64": base64.b64encode(data["content_bytes"]).decode("ascii"),
            }
            operation = "upload_attachment"
        elif action == "download":
            form = DownloadForm(request.POST)
            if not form.is_valid():
                return _error(request, GENERIC, 400)
            data = form.cleaned_data
            payload = {
                "request_id": str(request_uuid),
                "resident_token": token,
                "attachment_id": str(data["attachment_id"]),
            }
            operation = "download_attachment"
        else:
            return _error(request, GENERIC, 400)
        resident_session.submit(
            request.session, operation, payload, data["command_id"]
        )
    except (resident_session.ResidentSessionError, ResidentInboxRejected, ResidentInboxUnavailable):
        return _error(request, GENERIC, 503)
    return _pending(request, data["command_id"], "Request submitted")


@csrf_protect
@require_http_methods(["GET", "POST"])
def recover(request):
    if request.method == "GET":
        return _render(request, {
            "mode": "recovery",
            "title": "Recover request access",
            "form": RecoveryStartForm(),
        })
    action = request.POST.get("action")
    try:
        if action == "start":
            form = RecoveryStartForm(request.POST)
            if not form.is_valid():
                return _error(request, GENERIC, 400)
            data = form.cleaned_data
            resident_session.begin_recovery(
                request.session,
                data["tracking"],
                data["email"],
                data["command_id"],
            )
            return _pending(request, data["command_id"], "Recovery started")
        if action == "complete":
            form = RecoveryCompleteForm(request.POST)
            if not form.is_valid():
                return _error(request, GENERIC, 400)
            data = form.cleaned_data
            resident_session.complete_recovery(
                request.session,
                data["challenge_id"],
                data["code"],
                data["command_id"],
            )
            return _pending(request, data["command_id"], "Recovery submitted")
    except (resident_session.ResidentSessionError, ResidentInboxRejected, ResidentInboxUnavailable):
        return _error(request, GENERIC, 503)
    return _error(request, GENERIC, 400)
