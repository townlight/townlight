# SPDX-License-Identifier: AGPL-3.0-only
import json
import re
from datetime import date, datetime, timedelta, timezone

import httpx
import pytest
from cryptography.fernet import Fernet
from django.core.wsgi import get_wsgi_application
from django.template.loader import render_to_string
from django.test import Client
from sqlalchemy import select

from website import parks_household_context, parks_session
from website.parks_catalog import receive_catalog
from townlight_parks.models import (
    bookings,
    households,
    participants,
    registrations,
)
from townlight_parks.workflow import ParksRepository
from townlight_runtime.resident_commands import ResidentCommandPump

from test_parks_resident_flow import (
    _csrf,
    publisher,
    resident_key,
    runtime,
)
from test_resident_catalog import (
    TOKEN,
    canonical,
    catalog_env,
    worker_post,
)

pytestmark = pytest.mark.django_db

HOUSEHOLD_NEW_URL = "/parks/household/new/"
HOUSEHOLD_URL = "/parks/household/"


def _extract_command_path(response):
    match = re.search(rb"/parks/commands/[0-9a-f-]{36}/", response.content)
    assert match, response.content[:500]
    return match.group(0).decode()


def _extract_hidden(response, name):
    pattern = rb'name="%s"[^>]*value="([^"]+)"' % name.encode()
    match = re.search(pattern, response.content)
    if not match:
        pattern = rb'value="([^"]+)"[^>]*name="%s"' % name.encode()
        match = re.search(pattern, response.content)
    assert match, f"no hidden input {name} in {response.content[:500]}"
    return match.group(1).decode()


def _query_rows(engine, table, **filters):
    with engine.connect() as connection:
        translated = connection.execution_options(
            schema_translate_map={"townlight_parks": None}
        )
        stmt = select(table)
        for key, value in filters.items():
            stmt = stmt.where(getattr(table.c, key) == value)
        rows = translated.execute(stmt).mappings().all()
    return rows


def _create_household(resident, pump, email, resident_key):
    page = resident.get(HOUSEHOLD_NEW_URL)
    assert page.status_code == 200
    csrf = _csrf(page)
    submitted = resident.post(
        HOUSEHOLD_NEW_URL,
        {
            "csrfmiddlewaretoken": csrf,
            "contact_name": "Test Household",
            "email": email,
            "phone": "",
            "address": "",
            "language": "en",
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    status = resident.get(status_path)
    assert status.status_code == 200
    assert b"Your parks household is ready." in status.content
    match = re.search(
        rb"/parks/household/([A-Za-z0-9_-]{20,})/", status.content
    )
    assert match, status.content[:500]
    link_token = match.group(1).decode()

    raw_vault = resident.session[parks_session.VAULT_KEY]
    vault = json.loads(
        Fernet(resident_key).decrypt(raw_vault.encode("ascii")).decode("utf-8")
    )
    token = vault["tracking_token"]
    household_id = vault["household_id"]
    assert token == link_token

    capture = resident.get(f"/parks/household/{token}/")
    assert capture.status_code == 302
    return token, household_id


def _read_household(resident, pump):
    pending = resident.get(HOUSEHOLD_URL)
    assert pending.status_code == 200
    status_path = _extract_command_path(pending)
    pump.run_once()
    command_id = status_path.rstrip("/").rsplit("/", 1)[-1]
    owned = parks_session.read(resident.session, command_id)
    result = owned.get("result") if isinstance(owned, dict) else None
    diagnostic = {
        "state": owned.get("state") if isinstance(owned, dict) else type(owned).__name__,
        "operation": owned.get("operation") if isinstance(owned, dict) else None,
        "result_keys": sorted(result) if isinstance(result, dict) else None,
    }
    assert isinstance(owned, dict), diagnostic
    assert owned.get("state") == "completed", diagnostic
    assert isinstance(result, dict), diagnostic
    context = parks_household_context.household_context(
        result, command_id, None
    )
    assert isinstance(context, dict)
    assert context.get("mode") == "household"
    assert context.get("context_id") == command_id
    render_to_string("website/parks_household.html", context)
    status = resident.get(status_path)
    assert status.status_code == 200
    return status


def _add_participant(resident, pump, page, name, birth_date):
    csrf = _csrf(page)
    context_id = _extract_hidden(page, "context_id")
    submitted = resident.post(
        HOUSEHOLD_URL,
        {
            "csrfmiddlewaretoken": csrf,
            "action": "add_participant",
            "context_id": context_id,
            "name": name,
            "birth_date": birth_date,
            "accommodations": "",
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    completed = resident.get(status_path)
    assert completed.status_code == 200
    return _read_household(resident, pump)


def _book_resource(
    resident, pump, resource_id, resource_revision, starts_at, ends_at
):
    page = resident.get(f"/parks/resources/{resource_id}/")
    assert page.status_code == 200
    csrf = _csrf(page)
    submitted = resident.post(
        f"/parks/resources/{resource_id}/",
        {
            "csrfmiddlewaretoken": csrf,
            "action": "booking",
            "resource_id": resource_id,
            "expected_resource_revision": resource_revision,
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
            "purpose": "Test booking",
            "repeat_weeks": 1,
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    completed = resident.get(status_path)
    assert completed.status_code == 200


def _reschedule_booking(
    resident, pump, page, booking_id, expected_revision, starts_at, ends_at
):
    csrf = _csrf(page)
    context_id = _extract_hidden(page, "context_id")
    submitted = resident.post(
        HOUSEHOLD_URL,
        {
            "csrfmiddlewaretoken": csrf,
            "action": "reschedule_booking",
            "context_id": context_id,
            "booking_id": booking_id,
            "expected_revision": expected_revision,
            "reason": "Reschedule",
            "starts_at": starts_at.isoformat(),
            "ends_at": ends_at.isoformat(),
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    completed = resident.get(status_path)
    assert completed.status_code == 200
    return _read_household(resident, pump)


def _cancel_booking(resident, pump, page, booking_id, expected_revision):
    csrf = _csrf(page)
    context_id = _extract_hidden(page, "context_id")
    submitted = resident.post(
        HOUSEHOLD_URL,
        {
            "csrfmiddlewaretoken": csrf,
            "action": "cancel_booking",
            "context_id": context_id,
            "booking_id": booking_id,
            "expected_revision": expected_revision,
            "reason": "Cancel",
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    completed = resident.get(status_path)
    assert completed.status_code == 200
    return _read_household(resident, pump)


def _register_for_session(
    resident, pump, page, session_id, session_revision, participant_id
):
    csrf = _csrf(page)
    context_id = _extract_hidden(page, "context_id")
    submitted = resident.post(
        HOUSEHOLD_URL,
        {
            "csrfmiddlewaretoken": csrf,
            "action": "register",
            "context_id": context_id,
            "session_id": session_id,
            "expected_session_revision": session_revision,
            "participant_id": participant_id,
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    completed = resident.get(status_path)
    assert completed.status_code == 200
    return _read_household(resident, pump)


def _cancel_registration(
    resident, pump, page, registration_id, expected_revision
):
    csrf = _csrf(page)
    context_id = _extract_hidden(page, "context_id")
    submitted = resident.post(
        HOUSEHOLD_URL,
        {
            "csrfmiddlewaretoken": csrf,
            "action": "cancel_registration",
            "context_id": context_id,
            "registration_id": registration_id,
            "expected_revision": expected_revision,
            "reason": "Cancel registration",
        },
    )
    assert submitted.status_code == 200
    status_path = _extract_command_path(submitted)
    pump.run_once()
    completed = resident.get(status_path)
    assert completed.status_code == 200
    return _read_household(resident, pump)


@pytest.fixture
def parks_repo(runtime):
    engine, _ = runtime
    return ParksRepository(engine)


@pytest.fixture
def resident_key(catalog_env):
    return catalog_env.read_bytes()


@pytest.fixture
def publisher(catalog_env):
    return TOKEN


def test_household_booking_reschedule_cancel(
    settings, runtime, publisher, resident_key, catalog_env, parks_repo
):
    parks_engine, dispatch = runtime
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    hours = {
        day: [["00:00", "24:00"]]
        for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
    }
    resource = parks_repo.catalog_create(
        "resource",
        "staff",
        {
            "name": "Public Hall",
            "address": "1 Park Lane",
            "timezone": "UTC",
            "description": "Neighborhood room",
            "amenities": ["restroom", "parking"],
            "accessibility": "Step-free entry",
            "hours": hours,
            "public": True,
            "approval_required": False,
            "buffer_before_minutes": 0,
            "buffer_after_minutes": 0,
            "fee_cents": 100,
            "deposit_cents": 20,
            "currency": "USD",
        },
    )
    resource_id = str(resource["id"])
    resource_revision = resource["revision"]

    projection = parks_repo.public_catalog()
    digest = canonical(projection)
    resp = worker_post(
        receive_catalog,
        {"catalog": projection, "sha256": digest},
        token=publisher,
        host="testserver",
    )
    assert resp.status_code == 200

    def factory(**kwargs):
        return httpx.Client(
            transport=httpx.WSGITransport(get_wsgi_application()), **kwargs
        )

    pump = ResidentCommandPump(
        dispatch,
        config=lambda: ("https://testserver", publisher),
        client_factory=factory,
    )

    resident = Client(enforce_csrf_checks=True)
    email = "parks-booking@example.org"
    token, household_id = _create_household(
        resident, pump, email, resident_key
    )

    page = _read_household(resident, pump)
    birth_date = (date.today() - timedelta(days=365 * 30)).isoformat()
    page = _add_participant(
        resident, pump, page, "Alice Resident", birth_date
    )

    participant_rows = _query_rows(
        parks_engine, participants, household_id=household_id
    )
    assert len(participant_rows) == 1
    participant = participant_rows[0]
    assert participant["snapshot"]["name"] == "Alice Resident"

    start = datetime.now(timezone.utc) + timedelta(days=5)
    end = start + timedelta(hours=1)
    _book_resource(
        resident, pump, resource_id, resource_revision, start, end
    )

    booking_rows = _query_rows(
        parks_engine, bookings, household_id=household_id
    )
    assert len(booking_rows) == 1
    booking = booking_rows[0]
    assert booking["state"] == "confirmed"
    booking_id = str(booking["id"])
    booking_revision = booking["revision"]

    page = _read_household(resident, pump)
    new_start = start + timedelta(days=1)
    new_end = new_start + timedelta(hours=1)
    page = _reschedule_booking(
        resident,
        pump,
        page,
        booking_id,
        booking_revision,
        new_start,
        new_end,
    )

    booking_rows = _query_rows(parks_engine, bookings, id=booking_id)
    booking = booking_rows[0]
    assert booking["revision"] == booking_revision + 1

    page = _cancel_booking(
        resident, pump, page, booking_id, booking["revision"]
    )
    booking_rows = _query_rows(parks_engine, bookings, id=booking_id)
    booking = booking_rows[0]
    assert booking["state"] == "cancelled"


def test_program_registration_and_cancel(
    settings, runtime, publisher, resident_key, catalog_env, parks_repo
):
    parks_engine, dispatch = runtime
    settings.SECURE_SSL_REDIRECT = False
    settings.ALLOWED_HOSTS = ["testserver"]

    program = parks_repo.catalog_create(
        "program",
        "staff",
        {
            "title": "Story Time",
            "description": "",
            "timezone": "UTC",
            "min_age": 3,
            "max_age": 8,
            "eligibility_text": "",
            "accessibility": "",
            "public": True,
        },
    )
    program_id = str(program["id"])
    session_start = datetime.now(timezone.utc) + timedelta(days=10)
    session_end = session_start + timedelta(hours=1)
    session = parks_repo.session_create(
        program["id"], "staff", session_start, session_end, 2, 0, "USD"
    )
    session_id = str(session["id"])
    session_revision = session["revision"]

    projection = parks_repo.public_catalog()
    digest = canonical(projection)
    resp = worker_post(
        receive_catalog,
        {"catalog": projection, "sha256": digest},
        token=publisher,
        host="testserver",
    )
    assert resp.status_code == 200

    def factory(**kwargs):
        return httpx.Client(
            transport=httpx.WSGITransport(get_wsgi_application()), **kwargs
        )

    pump = ResidentCommandPump(
        dispatch,
        config=lambda: ("https://testserver", publisher),
        client_factory=factory,
    )

    resident = Client(enforce_csrf_checks=True)
    email = "parks-program@example.org"
    token, household_id = _create_household(
        resident, pump, email, resident_key
    )

    page = _read_household(resident, pump)
    birth_date = (date.today() - timedelta(days=365 * 5)).isoformat()
    page = _add_participant(
        resident, pump, page, "Bob Resident", birth_date
    )

    participant_rows = _query_rows(
        parks_engine, participants, household_id=household_id
    )
    assert len(participant_rows) == 1
    participant = participant_rows[0]
    participant_id = str(participant["id"])

    page = _register_for_session(
        resident,
        pump,
        page,
        session_id,
        session_revision,
        participant_id,
    )

    reg_rows = _query_rows(
        parks_engine,
        registrations,
        participant_id=participant_id,
        session_id=session_id,
    )
    assert len(reg_rows) == 1
    registration = reg_rows[0]
    assert registration["state"] == "confirmed"
    registration_id = str(registration["id"])
    registration_revision = registration["revision"]

    page = _read_household(resident, pump)
    assert b"Bob Resident" in page.content

    page = _cancel_registration(
        resident,
        pump,
        page,
        registration_id,
        registration_revision,
    )
    reg_rows = _query_rows(
        parks_engine, registrations, id=registration_id
    )
    registration = reg_rows[0]
    assert registration["state"] == "cancelled"
