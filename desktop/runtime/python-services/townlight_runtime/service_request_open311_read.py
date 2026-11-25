import re
import uuid
import xml.etree.ElementTree as ET
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Response
from fastapi.responses import JSONResponse
from townlight_311.store import json_safe

from townlight_runtime.service_requests import Actor, Repository, call_repository

router = APIRouter(prefix="/desktop/v1/service-requests/open311")


@router.get("/requests/{identifier}.{format}")
async def get_open311_request(
    identifier: str,
    format: str,
    actor: Actor,
    repository: Repository,
    resident_token: Annotated[
        str,
        Header(
            alias="X-Townlight-Resident-Token",
            min_length=32,
            max_length=128,
        ),
    ],
):
    if format not in ("json", "xml"):
        raise HTTPException(status_code=404)

    try:
        if identifier.startswith("TL311-"):
            hex_part = identifier[6:]
            if not re.fullmatch(r"[0-9a-fA-F]{32}", hex_part):
                raise ValueError
            request_id = uuid.UUID(hex=hex_part)
        else:
            request_id = uuid.UUID(identifier)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=422)

    row = await call_repository(
        repository.open311,
        str(request_id),
        resident_token,
    )

    if format == "json":
        return JSONResponse([json_safe(row)])

    root = ET.Element("service_requests")
    service_request = ET.SubElement(root, "service_request")
    for key, value in row.items():
        element = ET.SubElement(service_request, str(key))
        safe_value = json_safe(value)
        element.text = "" if safe_value is None else str(safe_value)

    return Response(
        content=ET.tostring(root, encoding="utf-8"),
        media_type="text/xml",
    )