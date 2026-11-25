import json
from uuid import uuid4

import pytest
from fastapi import Request
from starlette.routing import Mount

from test_windows_shared_311 import login
from test_windows_shared_parks import API, parks_gateway
from townlight_runtime.shared_operations import ALLOCATION


BOOKINGS = "/desktop/v1/parks/bookings"
BOOKING_URL = f"{API}{BOOKINGS}"
ID = "11111111-1111-4111-8111-111111111111"


REQUIRED_ALLOCATION_PATHS = [
    "/desktop/v1/meetings/meetings",
    f"/desktop/v1/meetings/meetings/{ID}/packet-snapshots",
    f"/desktop/v1/meetings/meetings/{ID}/council-source",
    "/desktop/v1/meetings/agenda-items",
    f"/desktop/v1/meetings/agenda-items/{ID}/reviews",
    f"/desktop/v1/meetings/packets/{ID}/council-preview",
    f"/desktop/v1/meetings/packets/{ID}/council-approval",
    "/desktop/v1/requests",
    f"/desktop/v1/requests/{ID}/actions",
    "/desktop/v1/communications/articles",
    f"/desktop/v1/communications/articles/{ID}/revisions",
    f"/desktop/v1/communications/articles/{ID}/attachments",
    f"/desktop/v1/communications/articles/{ID}/records",
    "/desktop/v1/parks/catalog/resource",
    "/desktop/v1/parks/catalog/program",
    "/desktop/v1/parks/households",
    "/desktop/v1/parks/participants",
    "/desktop/v1/parks/bookings",
    "/desktop/v1/parks/sessions",
    "/desktop/v1/parks/registrations",
    "/desktop/v1/parks/refunds",
    f"/desktop/v1/parks/resources/{ID}/closures",
    f"/desktop/v1/parks/resources/{ID}/maintenance",
    f"/desktop/v1/parks/attachments/resource/{ID}",
    f"/desktop/v1/parks/attachments/program/{ID}",
    f"/desktop/v1/parks/attachments/booking/{ID}",
    f"/desktop/v1/parks/attachments/registration/{ID}",
    f"/desktop/v1/parks/archives/legacy/{ID}/records",
    "/desktop/v1/municipal-staff/data/parks/preview",
]


REJECTED_ALLOCATION_PATHS = [
    "/desktop/v1/parks",
    "/desktop/v1/parks/",
    "/desktop/v1/parks/resources",
    "/desktop/v1/parks/catalog",
    "/desktop/v1/parks/catalog/resource/settings",
    "/desktop/v1/parks/bookings?limit=1",
    "/desktop/v1/parks/bookings?operation=test",
    "/desktop/v1/parks/bookings/",
    f"/desktop/v1/parks/bookings/{ID}",
    f"/desktop/v1/parks/catalog/resource/{ID}",
    "/desktop/v1/parks/resources/not-an-id/closures",
    f"/desktop/v1/parks/resources/{ID}/closures/extra",
    f"/desktop/v1/parks/attachments/resource/{ID}/extra",
    f"/desktop/v1/parks/attachments/unknown/{ID}",
    f"/desktop/v1/parks/archives//{ID}/records",
    f"/desktop/v1/parks/archives/legacy/not-an-id/records",
    f"/desktop/v1/parks/archives/legacy/{ID}/records/extra",
    "/desktop/v1/municipal-staff/data/parks",
    "/desktop/v1/municipal-staff/data/parks/preview/extra",
    "/desktop/v1/municipal-staff/data/parks/preview/archive",
    "/desktop/v1/municipal-staff/data/parks/preview?limit=1",
    f"/desktop/v1/requests/{ID}/actions/extra",
    f"/desktop/v1/communications/articles//revisions",
]


def _install_booking_upstream(client, forwarded):
    upstream = next(route.app for route in client.app.routes if isinstance(route, Mount))

    @upstream.post(BOOKINGS)
    async def booking(request: Request):
        forwarded.append(
            {
                "method": request.method,
                "path": request.url.path,
                "body": await request.body(),
            }
        )
        return {"booking_id": "44444444-4444-4444-8444-444444444444"}


def test_parks_booking_operation_replay_is_fenced_and_receipted(parks_gateway):
    client, _, _, _, _, forwarded = parks_gateway
    _install_booking_upstream(client, forwarded)
    clerk = login(client, "clerk")

    first_body = b'{"household_id":"household-a","session_id":"session-a"}'
    first_operation = str(uuid4())
    first_headers = {
        **clerk,
        "Content-Type": "application/json",
        "X-Townlight-Operation": first_operation,
    }

    missing_operation = client.post(
        BOOKING_URL,
        headers={**clerk, "Content-Type": "application/json"},
        content=first_body,
    )
    assert missing_operation.status_code == 422
    assert forwarded == []

    first = client.post(BOOKING_URL, headers=first_headers, content=first_body)
    assert first.status_code == 200
    assert len(forwarded) == 1
    assert forwarded[0]["method"] == "POST"
    assert forwarded[0]["path"] == BOOKINGS
    assert forwarded[0]["body"] == first_body

    retry = client.post(BOOKING_URL, headers=first_headers, content=first_body)
    assert retry.status_code == 200
    assert retry.content == first.content
    assert len(forwarded) == 1

    conflicting_body = b'{"household_id":"household-b","session_id":"session-a"}'
    conflict = client.post(
        BOOKING_URL,
        headers={**first_headers, "X-Townlight-Operation": first_operation},
        content=conflicting_body,
    )
    assert conflict.status_code == 409
    assert len(forwarded) == 1

    next_operation = str(uuid4())
    next_response = client.post(
        BOOKING_URL,
        headers={
            **clerk,
            "Content-Type": "application/json",
            "X-Townlight-Operation": next_operation,
        },
        content=conflicting_body,
    )
    assert next_response.status_code == 200
    assert len(forwarded) == 2
    assert forwarded[1]["method"] == "POST"
    assert forwarded[1]["path"] == BOOKINGS
    assert forwarded[1]["body"] == conflicting_body


@pytest.mark.parametrize("path", REQUIRED_ALLOCATION_PATHS)
def test_allocation_fullmatches_all_required_paths(path):
    assert ALLOCATION.fullmatch(path) is not None, path


@pytest.mark.parametrize("path", REJECTED_ALLOCATION_PATHS)
def test_allocation_rejects_settings_listing_preview_archive_and_malformed_tails(path):
    assert ALLOCATION.fullmatch(path) is None, path
