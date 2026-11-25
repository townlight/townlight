"""Bounded binary forwarding for authenticated Townlight 311 downloads."""

from __future__ import annotations

import hashlib
import re

from fastapi.responses import JSONResponse, Response
from townlight_records.auth.desktop_session import shared_staff_scope

UUID = r"[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}"
BINARY_DOWNLOAD = re.compile(
    rf"(?:/desktop/v1/service-requests/requests/(?P<request_id>{UUID})/"
    rf"(?P<kind>archive|attachments/(?P<attachment_id>{UUID}))"
    rf"|/desktop/v1/parks/attachments/(?P<parks_attachment_id>{UUID})/content)"
)
MAX_BINARY = 64 * 1024 * 1024
CONTENT_TYPES = {
    "archive": {"application/zip"},
    "attachment": {"image/png", "image/jpeg", "application/pdf", "text/plain"},
}
EXTENSIONS = {
    "application/zip": "zip",
    "image/png": "png",
    "image/jpeg": "jpg",
    "application/pdf": "pdf",
    "text/plain": "txt",
}
UNAVAILABLE = "This service request file is unavailable."


class _BodyTooLarge(BaseException):
    """Abort an upstream response that exceeds the forwarding bound."""


def _error(detail: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"detail": detail},
        status_code=status,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


async def forward_binary(
    domain_app,
    request,
    path: str,
    proof: str,
    principal,
    profile_root,
    resolve,
    limit: int = MAX_BINARY,
    *,
    max_bytes: int | None = None,
):
    """Forward exactly one service-request binary GET and verify its bytes."""
    if max_bytes is not None:
        limit = max_bytes
    download = BINARY_DOWNLOAD.fullmatch(path) if request.method == "GET" else None
    if download is None:
        return _error("This operation is only available on the city host.", 404)
    parks_attachment_id = download.group("parks_attachment_id")
    is_parks = bool(parks_attachment_id)
    required_module = "townlight_parks" if is_parks else "townlight_311"
    try:
        allowed = bool(principal.allows_module(required_module))
    except (AttributeError, TypeError):
        allowed = False
    if not allowed:
        return _error(
            "Townlight parks is not available." if is_parks else "Townlight 311 is not available.",
            403,
        )
    if "range" in request.headers:
        return _error("Download the complete service request file.", 416)
    try:
        session = proof.encode("ascii")
    except (AttributeError, UnicodeEncodeError):
        return _error("Sign in with an authorized Townlight account.", 401)

    if is_parks:
        kind = "attachment"
        file_id = parks_attachment_id
    else:
        kind = "archive" if download.group("kind") == "archive" else "attachment"
        file_id = download.group("request_id") if kind == "archive" else download.group("attachment_id")
    expected_types = CONTENT_TYPES[kind]

    status = None
    response_headers: dict[str, str] = {}
    body = bytearray()
    request_received = False

    async def receive():
        nonlocal request_received
        if not request_received:
            request_received = True
            return {"type": "http.request", "body": b"", "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        nonlocal status, response_headers
        if message["type"] == "http.response.start":
            status = int(message["status"])
            response_headers = {
                key.decode("latin-1").lower(): value.decode("latin-1")
                for key, value in message.get("headers", [])
            }
        elif message["type"] == "http.response.body":
            chunk = message.get("body", b"")
            if len(body) + len(chunk) > limit:
                raise _BodyTooLarge
            body.extend(chunk)

    scope = {
        **request.scope,
        "type": "http",
        "method": "GET",
        "path": path,
        "raw_path": path.encode("ascii"),
        "root_path": "",
        "query_string": b"",
        "headers": [(b"x-townlight-session", session)],
    }
    try:
        with shared_staff_scope(profile_root, proof, principal):
            await domain_app(scope, receive, send)
    except _BodyTooLarge:
        return _error(UNAVAILABLE, 503)
    except (OSError, ValueError, PermissionError):
        return _error(UNAVAILABLE, 503)

    try:
        still_authorized = resolve(proof) == principal
    except (OSError, ValueError, PermissionError):
        still_authorized = False
    if not still_authorized:
        return _error("Sign in with an authorized Townlight account.", 401)

    if status != 200:
        safe_status = status if isinstance(status, int) and 400 <= status <= 599 else 502
        return _error(UNAVAILABLE, safe_status)

    content_type = response_headers.get("content-type", "").split(";", 1)[0].strip().lower()
    content_length = response_headers.get("content-length", "")
    digest_header = response_headers.get("x-content-sha256", "")
    actual_digest = hashlib.sha256(body).hexdigest()
    if (content_type not in expected_types
            or re.fullmatch(r"[0-9]+", content_length) is None
            or int(content_length) != len(body)
            or re.fullmatch(r"[0-9a-fA-F]{64}", digest_header) is None
            or digest_header.lower() != actual_digest):
        return _error(UNAVAILABLE, 503)

    extension = EXTENSIONS[content_type]
    headers = {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Length": str(len(body)),
        "Content-Disposition": f'attachment; filename="{file_id}.{extension}"',
        "X-Content-SHA256": actual_digest,
    }
    return Response(content=bytes(body), media_type=content_type, headers=headers)
