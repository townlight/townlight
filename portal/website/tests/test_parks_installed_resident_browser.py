# SPDX-License-Identifier: AGPL-3.0-only
"""Run the actual installed Parks browser adapter against a disposable portal."""

import json
import os
import subprocess
import threading
import uuid
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
import pytest
from sqlalchemy import select
from townlight_parks.models import bookings, registrations, participants
from townlight_runtime.resident_commands import ResidentCommandPump
from datetime import datetime, timedelta, timezone
from test_parks_resident_flow import runtime
from test_resident_catalog import catalog_env, TOKEN, canonical, worker_post
from townlight_parks.workflow import ParksRepository
from website.parks_catalog import receive_catalog
from website.models import ResidentCommand


@pytest.fixture(scope="session")
def django_db_modify_db_settings(tmp_path_factory):
    # File-backed WAL mirrors the hosted fixture and permits the live server
    # and command pump to write without shared-memory SQLite table locks.
    from django.conf import settings

    settings.DATABASES["default"]["TEST"]["NAME"] = str(
        tmp_path_factory.mktemp("parks-browser-db") / "portal.sqlite3"
    )
    settings.DATABASES["default"]["OPTIONS"] = {
        "timeout": 30,
        "init_command": "PRAGMA journal_mode=WAL;",
        "transaction_mode": "IMMEDIATE",
    }


@pytest.fixture
def browser_runner():
    # Match the portal's existing opt-in headless-browser regression contract.
    module = os.environ.get("TOWNLIGHT_PLAYWRIGHT_MODULE", "")
    if not (os.path.isabs(module) and os.path.exists(module)):
        pytest.skip("Playwright module is unavailable")
    def run(live_server, dispatch, engine, resource_id, session_id):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_GET(self):
                rid = self.path.rsplit("/", 1)[-1]
                with engine.connect() as conn:
                    conn = conn.execution_options(
                        schema_translate_map={"townlight_parks": None}
                    )
                    table = (
                        bookings if self.path.startswith("/booking/") else registrations
                    )
                    row = (
                        conn.execute(
                            select(table).where(table.c.id == str(uuid.UUID(rid)))
                        )
                        .mappings()
                        .first()
                    )
                body = json.dumps(dict(row) if row else {}, default=str).encode()
                self.send_response(200 if row else 404)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        control = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        control_url = f"http://127.0.0.1:{control.server_address[1]}"
        ct = threading.Thread(target=control.serve_forever, daemon=True)
        ct.start()

        pump = ResidentCommandPump(
            dispatch,
            config=lambda: (
                live_server.url.replace("localhost", "127.0.0.1"),
                "Z" * 43,
            ),
        )
        errors, stop = [], threading.Event()

        def loop():
            while not stop.is_set():
                try:
                    pump.run_once()
                except Exception as e:
                    errors.append(e)
                stop.wait(0.2)

        pt = threading.Thread(target=loop, daemon=True)
        pt.start()

        try:
            script = Path(__file__).with_name("parks-installed-resident-browser.mjs")
            proc = subprocess.run(
                ["node", str(script)],
                input=json.dumps(
                    {
                        "helper": str(
                            Path(__file__).resolve().parents[3]
                            / "desktop/tests/installed/parks-resident-browser.mjs"
                        ),
                        "base": live_server.url,
                        "control": control_url,
                        "resource": str(resource_id),
                        "session": str(session_id),
                    }
                ),
                capture_output=True,
                text=True,
                timeout=180,
            )
            assert proc.returncode == 0, (proc.stderr or "")[-300:]
            data = json.loads(proc.stdout)
            assert data.get("passed") is True
        finally:
            stop.set()
            pt.join(timeout=5)
            control.shutdown()
            control.server_close()
            ct.join(timeout=5)

        assert not pt.is_alive() and not ct.is_alive(), "Fixture threads did not stop"
        assert not errors, type(errors[0]).__name__
        return data

    return run


@pytest.fixture
def resident_key(catalog_env):
    return catalog_env.read_bytes()


@pytest.mark.django_db(transaction=True)
def test_installed_resident_parks(
    settings, runtime, catalog_env, live_server, browser_runner
):
    settings.SECURE_SSL_REDIRECT = False
    settings.SESSION_COOKIE_SECURE = False
    settings.CSRF_COOKIE_SECURE = False
    engine, dispatch = runtime
    repo = ParksRepository(engine)
    resource = repo.catalog_create(
        "resource",
        "staff",
        {
            "name": "Hall",
            "address": "1 Test Way",
            "timezone": "UTC",
            "description": "",
            "amenities": [],
            "accessibility": "",
            "hours": {
                day: [["00:00", "24:00"]]
                for day in ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
            },
            "public": True,
            "approval_required": False,
            "buffer_before_minutes": 0,
            "buffer_after_minutes": 0,
            "fee_cents": 0,
            "deposit_cents": 0,
            "currency": "USD",
        },
    )
    program = repo.catalog_create(
        "program",
        "staff",
        {
            "title": "Adult program",
            "description": "",
            "timezone": "UTC",
            "min_age": None,
            "max_age": None,
            "eligibility_text": "",
            "accessibility": "",
            "public": True,
        },
    )
    start = datetime.now(timezone.utc) + timedelta(days=10)
    session = repo.session_create(
        program["id"], "staff", start, start + timedelta(hours=1), 20, 0, "USD"
    )
    projection = repo.public_catalog()
    assert (
        worker_post(
            receive_catalog,
            {"catalog": projection, "sha256": canonical(projection)},
            token=TOKEN,
            host="testserver",
        ).status_code
        == 200
    )
    data = browser_runner(live_server, dispatch, engine, resource["id"], session["id"])
    ids = data["actualIds"]
    with engine.connect() as connection:
        connection = connection.execution_options(
            schema_translate_map={"townlight_parks": None}
        )

        def row(table, key):
            return (
                connection.execute(
                    select(table).where(table.c.id == str(uuid.UUID(ids[key])))
                )
                .mappings()
                .one()
            )

        booking = row(bookings, "bookingId")
        assert booking["state"] == "cancelled"
        assert booking["revision"] >= 3
        assert (
            booking["starts_at"].date()
            == (datetime.now(timezone.utc) + timedelta(days=8)).date()
        )
        registration = row(registrations, "registrationId")
        assert registration["session_id"] == str(session["id"])
        participant = row(participants, "participantId")
        assert participant["snapshot"]["name"] == "Browser Resident"
        assert registration["participant_id"] == participant["id"]
        assert booking["household_id"] == participant["household_id"]
    outcomes = list(ResidentCommand.objects.values_list("operation", "state"))
    assert all(state == "completed" for _, state in outcomes)
    assert {op for op, _ in outcomes} >= {
        "parks_create_household",
        "parks_read_household",
        "parks_add_participant",
        "parks_availability",
        "parks_create_booking",
        "parks_reschedule_booking",
        "parks_cancel_booking",
        "parks_register",
    }
