"""Real-FastAPI coverage for parks booking/payment and session/roster staff flows."""

from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from parks_http_support import (
    HOUSEHOLD,
    PROGRAM,
    RESOURCE,
    future_slot,
    parks_app,
)

PARKS = "/desktop/v1/parks"


def _ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def test_booking_payment_receipt(parks_app):
    client, _repository = parks_app
    resource = _ok(client.post(f"{PARKS}/catalog/resource", json={"payload": RESOURCE}))
    household = _ok(client.post(f"{PARKS}/households", json={"payload": HOUSEHOLD}))
    assert resource["snapshot"]["approval_required"] is False

    starts_at = future_slot()
    booking_body = {
        "resource_id": resource["id"],
        "household_id": household["id"],
        "expected_resource_revision": resource["revision"],
        "occurrences": [
            {
                "starts_at": starts_at.isoformat(),
                "ends_at": (starts_at + timedelta(hours=1)).isoformat(),
            }
        ],
        "purpose": "Staff booking",
    }
    booking = _ok(client.post(f"{PARKS}/bookings", json=booking_body))["bookings"][0]
    assert booking["purpose"] == "Staff booking"
    assert booking["state"] == "confirmed"

    overlap = client.post(
        f"{PARKS}/bookings",
        json={
            **booking_body,
            "occurrences": [
                {
                    "starts_at": (starts_at + timedelta(minutes=30)).isoformat(),
                    "ends_at": (starts_at + timedelta(hours=2)).isoformat(),
                }
            ],
        },
    )
    assert overlap.status_code == 409, overlap.text

    obligation_id = booking["obligation_id"]
    _ok(
        client.post(
            f"{PARKS}/obligations/{obligation_id}/offline-payment",
            json={
                "amount_cents": 120,
                "reference": "cash",
                "idempotency_key": f"cash-{uuid4()}",
            },
        )
    )
    receipt = _ok(client.get(f"{PARKS}/obligations/{obligation_id}/receipt"))
    assert receipt["totals"]["paid_cents"] == 120
    assert receipt["totals"]["balance_cents"] == 0


def test_session_waitlist_promotion_and_check_in(parks_app):
    client, _repository = parks_app
    program = _ok(client.post(f"{PARKS}/catalog/program", json={"payload": PROGRAM}))
    starts_at = future_slot(hour=9)
    session = _ok(
        client.post(
            f"{PARKS}/sessions",
            json={
                "program_id": program["id"],
                "starts_at": starts_at.isoformat(),
                "ends_at": (starts_at + timedelta(hours=2)).isoformat(),
                "capacity": 1,
                "fee_cents": 0,
                "currency": "USD",
            },
        )
    )
    assert session["revision"] == 1

    registrations = []
    for name, email in (("Ada One", "ada@example.test"), ("Bob Two", "bob@example.test")):
        household = _ok(
            client.post(
                f"{PARKS}/households",
                json={
                    "payload": {
                        **HOUSEHOLD,
                        "contact_name": name,
                        "email": email,
                    }
                },
            )
        )
        participant = _ok(
            client.post(
                f"{PARKS}/participants",
                json={
                    "household_id": household["id"],
                    "payload": {
                        "name": name,
                        "birth_date": "2000-01-01",
                        "accommodations": "",
                    },
                },
            )
        )
        revision = _ok(client.get(f"{PARKS}/sessions/{session['id']}"))["revision"]
        registrations.append(
            _ok(
                client.post(
                    f"{PARKS}/registrations",
                    json={
                        "session_id": session["id"],
                        "participant_id": participant["id"],
                        "expected_session_revision": revision,
                    },
                )
            )
        )

    assert registrations[0]["state"] == "confirmed"
    assert registrations[1]["state"] == "waitlisted"

    rows = _ok(client.get(f"{PARKS}/sessions/{session['id']}/roster"))
    assert {(row["name"], row["state"]) for row in rows} == {
        ("Ada One", "confirmed"),
        ("Bob Two", "waitlisted"),
    }

    cancelled = _ok(
        client.post(
            f"{PARKS}/registrations/{registrations[0]['id']}/cancel",
            json={
                "expected_revision": registrations[0]["revision"],
                "reason": "Staff cancellation",
            },
        )
    )
    assert cancelled["registration"]["state"] == "cancelled"
    assert [row["id"] for row in cancelled["promoted"]] == [registrations[1]["id"]]

    promoted = _ok(client.get(f"{PARKS}/registrations/{registrations[1]['id']}"))
    assert promoted["state"] == "confirmed"

    checked_in = _ok(
        client.post(
            f"{PARKS}/registrations/{registrations[1]['id']}/check-in",
            json={
                "expected_revision": promoted["revision"],
                "reason": "Arrived for camp",
            },
        )
    )
    assert checked_in["state"] == "confirmed"
    assert checked_in["checked_in_at"] is not None
