import xml.etree.ElementTree as ET

from fastapi import APIRouter, HTTPException, Response

from townlight_runtime.service_requests import Actor, Repository, call_repository

router = APIRouter(prefix="/desktop/v1/service-requests/open311")


def _field(row, name, default=None):
    if isinstance(row, dict):
        return row.get(name, default)
    return getattr(row, name, default)


def _xml_response(root):
    return Response(
        ET.tostring(root, encoding="utf-8", xml_declaration=True),
        media_type="text/xml",
    )


@router.get("/services.json")
async def list_services_json(actor: Actor, repository: Repository):
    rows = await call_repository(repository.categories)
    return [
        {
            "service_code": _field(row, "code"),
            "service_name": _field(row, "name"),
            "description": _field(row, "name"),
            "group": _field(row, "department"),
            "metadata": False,
            "type": "realtime",
        }
        for row in rows
        if bool(_field(row, "active", True))
    ]


@router.get("/services.xml")
async def list_services_xml(actor: Actor, repository: Repository):
    rows = await call_repository(repository.categories)
    root = ET.Element("services")

    for row in rows:
        if not bool(_field(row, "active", True)):
            continue

        service = ET.SubElement(root, "service")
        ET.SubElement(service, "service_code").text = str(_field(row, "code", ""))
        ET.SubElement(service, "service_name").text = str(_field(row, "name", ""))
        ET.SubElement(service, "description").text = str(_field(row, "name", ""))
        ET.SubElement(service, "group").text = str(_field(row, "department", ""))
        ET.SubElement(service, "metadata").text = "false"
        ET.SubElement(service, "type").text = "realtime"

    return _xml_response(root)


@router.get("/services/{service_code}.json")
async def get_service_json(
    service_code: str, actor: Actor, repository: Repository
):
    rows = await call_repository(repository.categories)
    row = next(
        (
            item
            for item in rows
            if str(_field(item, "code", "")) == service_code
            and bool(_field(item, "active", True))
        ),
        None,
    )

    if row is None:
        raise HTTPException(status_code=404, detail="Service not found")

    return {
        "service_code": _field(row, "code"),
        "attributes": [],
    }


@router.get("/services/{service_code}.xml")
async def get_service_xml(
    service_code: str, actor: Actor, repository: Repository
):
    rows = await call_repository(repository.categories)
    row = next(
        (
            item
            for item in rows
            if str(_field(item, "code", "")) == service_code
            and bool(_field(item, "active", True))
        ),
        None,
    )

    if row is None:
        raise HTTPException(status_code=404, detail="Service not found")

    root = ET.Element("service_definition")
    ET.SubElement(root, "service_code").text = str(
        _field(row, "code", service_code)
    )
    ET.SubElement(root, "attributes")
    return _xml_response(root)