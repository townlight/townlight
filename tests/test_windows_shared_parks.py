"""Focused security coverage for Parks and Parks data through the shared staff gateway.

The upstream app is a fake FastAPI service that only records what reaches it.  All
authentication, role checks, path matching and query validation are performed by
the real shared-staff gateway and the real townlight_runtime.parks_proxy policy.
"""

import json

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from townlight_runtime.parks_proxy import parks_data_route, parks_route
from townlight_runtime.shared_staff import install_shared_staff

# The fixture itself is not used directly below because it does not expose the
# upstream FastAPI app.  It is imported to keep this test coupled to the same
# real shared-staff gateway fixture and login helper used by the 311 suite.
from test_windows_shared_311 import gateway, login, staff  # noqa: F401


API = "/staff/v1/api"

CATALOG_GET = "/desktop/v1/parks/catalog/resource"
CATALOG_PUT_TEMPLATE = "/desktop/v1/parks/catalog/resource/{catalog_id}"
CATALOG_ID = "11111111-1111-4111-8111-111111111111"
CATALOG_PUT = f"/desktop/v1/parks/catalog/resource/{CATALOG_ID}"

RESOURCE_ID = "22222222-2222-4222-8222-222222222222"
CLOSURE_ID = "33333333-3333-4333-8333-333333333333"
CLOSURE_DELETE = (
    f"/desktop/v1/parks/resources/{RESOURCE_ID}/closures/{CLOSURE_ID}"
)

DATA_STATUS = "/desktop/v1/municipal-staff/data/parks"

LEGACY_CATALOG_WRITE = f"/desktop/v1/parks/catalog/{CATALOG_ID}"
WRONG_MUNICIPAL_DATA = "/desktop/v1/municipal-staff/data/parks-other/status"


@pytest.fixture
def parks_gateway(tmp_path):
    """Real shared-staff gateway in front of a recording fake Parks upstream."""
    config = tmp_path / "config"
    config.mkdir()
    admin = staff("Admin", "local-admin", "admin-passphrase")
    clerk = staff("Clerk", "clerk", "clerk-passphrase")
    records = staff("Records", "records-staff", "records-passphrase")
    (config / "first-admin.json").write_text(json.dumps(admin))
    users = config / "staff-users.json"
    users.write_text(json.dumps([clerk, records]))

    forwarded = []
    upstream = FastAPI()

    async def record(request: Request):
        forwarded.append(
            {
                "method": request.method,
                "path": request.url.path,
                "body": await request.body(),
            }
        )

    @upstream.get(CATALOG_GET)
    async def catalog_get(request: Request):
        await record(request)
        return {"items": []}

    @upstream.put(CATALOG_PUT_TEMPLATE)
    async def catalog_put(catalog_id: str, request: Request):
        await record(request)
        return {"id": catalog_id, "updated": True}

    @upstream.delete(
        "/desktop/v1/parks/resources/{resource_id}/closures/{closure_id}"
    )
    async def closure_delete(resource_id: str, closure_id: str, request: Request):
        await record(request)
        return {"resource_id": resource_id, "closure_id": closure_id, "deleted": True}

    @upstream.get(DATA_STATUS)
    async def data_status(request: Request):
        await record(request)
        return {"ok": True}

    app = FastAPI()
    install_shared_staff(app, upstream, tmp_path)
    app.mount("/", upstream)
    with TestClient(app) as client:
        yield client, users, clerk, records, tmp_path, forwarded


def test_parks_get_put_delete_forward_exact_method_path_and_body(parks_gateway):
    client, _, _, _, _, forwarded = parks_gateway
    clerk = login(client, "clerk")
    payload = {"name": "Updated resource", "active": True}

    assert client.get(f"{API}{CATALOG_GET}", headers=clerk).status_code == 200
    assert (
        client.put(f"{API}{CATALOG_PUT}", headers=clerk, json=payload).status_code
        == 200
    )
    assert client.delete(f"{API}{CLOSURE_DELETE}", headers=clerk).status_code == 200

    assert [(entry["method"], entry["path"]) for entry in forwarded] == [
        ("GET", CATALOG_GET),
        ("PUT", CATALOG_PUT),
        ("DELETE", CLOSURE_DELETE),
    ]
    assert forwarded[0]["body"] == b""
    assert json.loads(forwarded[1]["body"]) == payload
    assert forwarded[2]["body"] == b""


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", CATALOG_GET),
        ("PUT", CATALOG_PUT),
        ("DELETE", CLOSURE_DELETE),
    ],
)
def test_records_role_is_rejected_for_parks_routes(parks_gateway, method, path):
    client, _, _, _, _, forwarded = parks_gateway
    records = login(client, "records")

    response = client.request(method, f"{API}{path}", headers=records)

    assert response.status_code == 403
    assert forwarded == []


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", CATALOG_GET),
        ("PUT", CATALOG_PUT),
        ("DELETE", CLOSURE_DELETE),
    ],
)
def test_anonymous_is_rejected_for_parks_routes(parks_gateway, method, path):
    client, _, _, _, _, forwarded = parks_gateway

    response = client.request(method, f"{API}{path}")

    assert response.status_code == 401
    assert forwarded == []


@pytest.mark.parametrize(
    "path",
    [
        f"{CATALOG_GET}?unknown=value",
        f"{CATALOG_GET}?public_only=true&public_only=false",
        f"{CATALOG_GET}?limit=1&limit=1",
        WRONG_MUNICIPAL_DATA,
    ],
)
def test_parks_gateway_rejects_unknown_duplicate_wrong_root(parks_gateway, path):
    client, _, _, _, _, forwarded = parks_gateway
    clerk = login(client, "clerk")

    assert client.get(f"{API}{path}", headers=clerk).status_code == 404
    assert forwarded == []


@pytest.mark.parametrize("method", ["PUT", "DELETE"])
def test_legacy_catalog_write_paths_do_not_inherit_write_policy(
    parks_gateway, method
):
    client, _, _, _, _, forwarded = parks_gateway
    clerk = login(client, "clerk")

    response = client.request(method, f"{API}{LEGACY_CATALOG_WRITE}", headers=clerk)

    assert response.status_code == 404
    assert forwarded == []


def test_parks_data_status_is_admin_only(parks_gateway):
    client, _, _, _, _, forwarded = parks_gateway
    clerk = login(client, "clerk")
    admin = login(client, "admin")

    assert client.get(f"{API}{DATA_STATUS}", headers=clerk).status_code == 403
    assert forwarded == []

    response = client.get(f"{API}{DATA_STATUS}", headers=admin)

    assert response.status_code == 200
    assert [(entry["method"], entry["path"]) for entry in forwarded] == [
        ("GET", DATA_STATUS)
    ]


def test_actual_parks_proxy_policy_contract():
    assert parks_route("GET", CATALOG_GET, "")
    assert parks_route("PUT", CATALOG_PUT, "")
    assert parks_route("DELETE", CLOSURE_DELETE, "")
    assert parks_data_route("GET", DATA_STATUS, "")

    assert not parks_route("GET", CATALOG_GET, "unknown=value")
    assert not parks_route("GET", CATALOG_GET, "public_only=true&public_only=false")
    assert not parks_route("GET", CATALOG_GET, "limit=1&limit=1")
    assert not parks_data_route("GET", WRONG_MUNICIPAL_DATA, "")
    assert not parks_route("PUT", LEGACY_CATALOG_WRITE, "")
    assert not parks_route("DELETE", LEGACY_CATALOG_WRITE, "")
