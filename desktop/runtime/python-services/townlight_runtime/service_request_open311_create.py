from typing import Annotated
from urllib.parse import parse_qsl
from uuid import UUID
from xml.etree import ElementTree as ET

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response

from townlight_runtime.service_requests import (
    Actor,
    Repository,
    audit_actor,
    call_repository,
)

router = APIRouter()

_ALLOWED_FORM_KEYS = {
    "service_code",
    "description",
    "address_string",
    "first_name",
    "last_name",
    "email",
    "phone",
}


@router.post("/desktop/v1/service-requests/open311/requests.{format}")
async def open311_create_request(
    format: str,
    request: Request,
    actor: Actor,
    repository: Repository,
    operation: Annotated[UUID, Header(alias="X-Townlight-Operation")],
    resident_token: Annotated[
        str,
        Header(
            alias="X-Townlight-Resident-Token",
            min_length=32,
            max_length=128,
        ),
    ],
):
    if format not in {"json", "xml"}:
        raise HTTPException(status_code=404)

    content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
    if content_type != "application/x-www-form-urlencoded":
        raise HTTPException(status_code=415)

    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > 65536:
            raise HTTPException(status_code=413)

    try:
        text = bytes(body).decode("utf-8", errors="strict")
        items = parse_qsl(
            text,
            keep_blank_values=True,
            max_num_fields=32,
            errors="strict",
        )
    except (UnicodeError, ValueError):
        raise HTTPException(status_code=422) from None

    keys = [key for key, _ in items]

    if len(keys) != len(set(keys)):
        raise HTTPException(status_code=422, detail="duplicate form field")
    if any(key not in _ALLOWED_FORM_KEYS for key in keys):
        raise HTTPException(status_code=422, detail="unsupported form field")
    if any(not isinstance(value, str) for _, value in items):
        raise HTTPException(status_code=422, detail="unsupported form value")

    data = dict(items)
    first_name = data.get("first_name", "")
    last_name = data.get("last_name", "")

    result = await call_repository(
        repository.create_request,
        category=data.get("service_code"),
        description=data.get("description"),
        location=data.get("address_string"),
        contact={
            "name": f"{first_name} {last_name}".strip(),
            "email": data.get("email", ""),
            "phone": data.get("phone", ""),
        },
        resident_token=resident_token,
        idempotency_key=str(operation),
        actor=audit_actor(actor),
    )

    service_request_id = result["tracking"]

    if format == "json":
        return JSONResponse([{"service_request_id": service_request_id}])

    root = ET.Element("service_requests")
    service_request = ET.SubElement(root, "service_request")
    ET.SubElement(service_request, "service_request_id").text = str(service_request_id)
    return Response(ET.tostring(root, encoding="unicode"), media_type="application/xml")