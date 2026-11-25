"""Integration test for ParksRepository -> ParksEmailDelivery.tick."""

from __future__ import annotations

import re
from datetime import timedelta

from parks_http_support import HOUSEHOLD, RESOURCE, future_slot, parks_app
from townlight_runtime.parks_email import ParksEmailDelivery

PARKS = "/desktop/v1/parks"
PUBLIC_ORIGIN = "https://parks.example.test"


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


class _ControlledTransport:
    sender = "parks-notifications@example.test"

    def __init__(self) -> None:
        self.messages = []

    def send(self, message) -> None:
        self.messages.append(message)


class _ControlledEmailStore:
    def __init__(self) -> None:
        self._transport = _ControlledTransport()

    def transport(self):
        return self._transport


def test_parks_email_delivery_tick(parks_app):
    client, repository = parks_app
    key = client.app.state.desktop_parks_key

    resource = _ok(
        client.post(f"{PARKS}/catalog/resource", json={"payload": RESOURCE})
    )
    household = _ok(
        client.post(f"{PARKS}/households", json={"payload": HOUSEHOLD})
    )
    assert resource["snapshot"]["approval_required"] is False

    starts_at = future_slot()
    booking = _ok(
        client.post(
            f"{PARKS}/bookings",
            json={
                "resource_id": resource["id"],
                "household_id": household["id"],
                "expected_resource_revision": resource["revision"],
                "occurrences": [
                    {
                        "starts_at": starts_at.isoformat(),
                        "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
                    }
                ],
                "purpose": "Email delivery integration test",
            },
        )
    )["bookings"][0]
    booking_id = booking["id"]

    queued = repository.queue_notification_events(
        key=key,
        portal_base_url=PUBLIC_ORIGIN,
        limit=50,
    )
    assert queued >= 1
    assert queued <= 10

    pending_summary = repository.notification_summary("booking", booking_id)
    assert pending_summary["counts"]["pending"] == queued
    assert pending_summary["counts"]["sent"] == 0

    store = _ControlledEmailStore()
    delivery = ParksEmailDelivery(
        repository,
        store,
        key=key,
        public_origin=PUBLIC_ORIGIN,
    )

    processed = delivery.tick()
    assert processed == queued
    assert delivery.tick() == 0

    transport = store._transport
    assert len(transport.messages) == queued

    delivered = repository.notification_summary("booking", booking_id)
    assert delivered["counts"]["sent"] == queued
    assert delivered["counts"]["pending"] == 0
    assert delivered["last_error"] is None

    tracking_prefix = f"{PUBLIC_ORIGIN}/parks/household/"
    tracking_pattern = re.compile(re.escape(tracking_prefix) + r"([^\s/]+)/")
    for message in transport.messages:
        assert message["To"] == HOUSEHOLD["email"]
        assert message["From"] == transport.sender
        body = message.get_content()
        assert tracking_prefix in body
        match = tracking_pattern.search(body)
        assert match is not None
        assert match.group(1)
