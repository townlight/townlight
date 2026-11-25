# SPDX-License-Identifier: AGPL-3.0-only
"""Build the resident household context from an own-read result."""
from .parks_catalog import read_catalog
from .parks_forms import (
    CancelForm,
    CheckoutForm,
    CheckoutReadForm,
    ParticipantEditForm,
    ParticipantForm,
    RegistrationForm,
    RescheduleForm,
)


def _rows(result, key):
    rows = result.get(key) if isinstance(result, dict) else None
    return rows if isinstance(rows, list) else []


def _participant_edit_form(participant):
    snapshot = participant.get("snapshot")
    if not isinstance(snapshot, dict):
        snapshot = {}
    return ParticipantEditForm(initial={
        "participant_id": participant.get("id"),
        "expected_revision": participant.get("revision"),
        "name": snapshot.get("name", ""),
        "birth_date": snapshot.get("birth_date"),
        "accommodations": snapshot.get("accommodations", ""),
    })


def _registration_forms(participants, selected_session):
    try:
        cached = read_catalog()
    except Exception:  # noqa: BLE001 - unavailable cache must not block own records
        return [], True, {}

    if not isinstance(cached, dict):
        return [], True, {}
    if cached.get("available") is False:
        return [], True, {}
    catalog = cached.get("catalog")
    if not isinstance(catalog, dict):
        return [], True, {}

    programs = catalog.get("programs")
    sessions = catalog.get("sessions")
    if not isinstance(programs, list) or not isinstance(sessions, list):
        return [], True, {}

    program_titles = {}
    for program in programs:
        if isinstance(program, dict):
            program_titles[str(program.get("id"))] = program.get("title", "")

    forms = []
    session_programs = {}
    for session in sessions:
        if not isinstance(session, dict) or session.get("state") != "open":
            continue
        session_id = session.get("id")
        label = program_titles.get(str(session.get("program_id")), "")
        session_programs[str(session_id)] = label
        if selected_session not in (None, "") and str(session_id) != str(selected_session):
            continue
        forms.append({
            "session": session,
            "program_title": label,
            "form": RegistrationForm(
                initial={
                    "session_id": session_id,
                    "expected_session_revision": session.get("revision"),
                },
                own_participants=participants,
            ),
        })
    return forms, False, session_programs


def household_context(result, command_id, selected_session=None):
    """Return the household view model, using only the public catalogue cache."""
    result = result if isinstance(result, dict) else {}
    participants = _rows(result, "participants")
    bookings = _rows(result, "bookings")
    registrations = _rows(result, "registrations")
    obligations = _rows(result, "obligations")
    payment_intents = _rows(result, "payment_intents")

    registration_forms, catalog_unavailable, session_programs = _registration_forms(
        participants, selected_session
    )

    cached = None
    try:
        cached = read_catalog()
    except Exception:  # noqa: BLE001 - labels are optional for own records
        cached = None
    resources = []
    if isinstance(cached, dict) and cached.get("available") is not False:
        catalog = cached.get("catalog")
        if isinstance(catalog, dict):
            resources = catalog.get("resources") or []
    resource_names = {
        str(resource.get("id")): resource.get("name", "")
        for resource in resources
        if isinstance(resource, dict)
    }

    return {
        "mode": "household",
        "title": "Household",
        "context_id": command_id,
        "household": result.get("household"),
        "participant_form": ParticipantForm(),
        "participants": [
            {"record": row, "edit_form": _participant_edit_form(row)}
            for row in participants
        ],
        "bookings": [
            {
                "record": row,
                "cancel_form": CancelForm(
                    initial={"expected_revision": row.get("revision")}
                ),
                "reschedule_form": RescheduleForm(
                    initial={"expected_revision": row.get("revision")}
                ),
            }
            for row in bookings
        ],
        "registrations": [
            {
                "record": row,
                "cancel_form": CancelForm(
                    initial={"expected_revision": row.get("revision")}
                ),
            }
            for row in registrations
        ],
        "obligations": [
            {
                "record": row,
                "payment_form": CheckoutForm(
                    initial={"obligation_id": row.get("id")}
                ),
            }
            for row in obligations
        ],
        "payment_intents": [
            {
                "record": row,
                "read_form": CheckoutReadForm(
                    initial={"intent_id": row.get("id")}
                ),
            }
            for row in payment_intents
        ],
        "registration_forms": registration_forms,
        "catalog_unavailable": catalog_unavailable,
        "resource_names": resource_names,
        "session_programs": session_programs,
    }
