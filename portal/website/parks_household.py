# SPDX-License-Identifier: AGPL-3.0-only
"""CSRF-protected household workflow for resident parks and recreation."""
import uuid

from django.shortcuts import redirect
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from . import parks_session
from .parks_forms import (
    CancelForm,
    CheckoutForm,
    CheckoutReadForm,
    ParticipantEditForm,
    ParticipantForm,
    RefreshForm,
    RegistrationForm,
    RescheduleForm,
)
from .parks_views import GENERIC, PENDING, pending, render_page

HOUSEHOLD_NEW_URL = "/parks/household/new/"
READ_HOUSEHOLD = "parks_read_household"
BOOKING_ID_ACTIONS = frozenset({"cancel_booking", "reschedule_booking"})
CANCEL_REGISTRATION = "cancel_registration"
ACTION_SPECS = {
    "add_participant": (
        "parks_add_participant",
        ParticipantForm,
        "Add participant",
    ),
    "update_participant": (
        "parks_update_participant",
        ParticipantEditForm,
        "Update participant",
    ),
    "cancel_booking": (
        "parks_cancel_booking",
        CancelForm,
        "Cancel booking",
    ),
    "reschedule_booking": (
        "parks_reschedule_booking",
        RescheduleForm,
        "Reschedule booking",
    ),
    "register": (
        "parks_register",
        RegistrationForm,
        "Register for a program",
    ),
    "cancel_registration": (
        "parks_cancel_registration",
        CancelForm,
        "Cancel registration",
    ),
    "prepare_checkout": (
        "parks_prepare_checkout",
        CheckoutForm,
        "Prepare checkout",
    ),
    "read_checkout": (
        "parks_read_checkout",
        CheckoutReadForm,
        "Read checkout",
    ),
    "refresh": (
        READ_HOUSEHOLD,
        RefreshForm,
        "Refresh household",
    ),
}


def _canonical_uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _message(request, title, message, status):
    return render_page(request, {
        "mode": "message",
        "title": title,
        "message": message,
    }, status=status)


def _session_error(request, error):
    if isinstance(error, parks_session.ParksSessionRejected):
        status = 400
    elif isinstance(error, parks_session.ParksSessionNotFound):
        status = 403
    else:
        status = 503
    return _message(request, "Request unavailable", GENERIC, status)


def _selected_session(request):
    return _canonical_uuid(request.GET.get("session"))


def _pending_response(request, command_id, session_id=None):
    if session_id is None:
        return pending(request, command_id)
    return render_page(request, {
        "mode": "pending",
        "title": "Request received",
        "message": PENDING,
        "status_url": "/parks/commands/%s/?session=%s" % (
            command_id,
            session_id,
        ),
    })


def _invalid_form_response(
        request, form, action, title, context_id, booking_id, registration_id):
    return render_page(request, {
        "mode": "form",
        "form": form,
        "action": action,
        "title": title,
        "context_id": context_id,
        "booking_id": booking_id or "",
        "registration_id": registration_id or "",
        "regid": registration_id or "",
    }, status=400)


def _registration_participants(session, context_id):
    row = parks_session.read(session, context_id)
    if not isinstance(row, dict):
        raise parks_session.ParksSessionError
    if row.get("state") != "completed":
        raise parks_session.ParksSessionRejected
    if row.get("operation") != READ_HOUSEHOLD:
        raise parks_session.ParksSessionRejected
    result = row.get("result")
    if not isinstance(result, dict):
        raise parks_session.ParksSessionRejected
    participants = result.get("participants")
    if not isinstance(participants, list):
        raise parks_session.ParksSessionRejected
    return participants


@csrf_protect
@require_http_methods(["GET", "POST"])
def household(request):
    try:
        credential = parks_session.credential(request.session)
    except Exception as error:
        return _session_error(request, error)
    if credential is None:
        return redirect(HOUSEHOLD_NEW_URL)

    if request.method == "GET":
        try:
            command_id = parks_session.submit(
                request.session, READ_HOUSEHOLD, {})
        except Exception as error:
            return _session_error(request, error)
        return _pending_response(
            request, command_id, _selected_session(request))

    action = request.POST.get("action", "")
    context_id = request.POST.get("context_id", "")
    spec = ACTION_SPECS.get(action)
    if spec is None:
        return render_page(request, {
            "mode": "message",
            "title": "Request unavailable",
            "message": GENERIC,
            "action": action,
            "context_id": context_id,
        }, status=400)

    operation, form_class, title = spec
    booking_id = None
    registration_id = None

    if action in BOOKING_ID_ACTIONS:
        booking_id = _canonical_uuid(request.POST.get("booking_id"))
    if action == CANCEL_REGISTRATION:
        registration_id = _canonical_uuid(
            request.POST.get("registration_id")
            or request.POST.get("regid")
        )

    try:
        if action == "register":
            participants = _registration_participants(
                request.session, context_id)
            form = RegistrationForm(
                request.POST, own_participants=participants)
        else:
            form = form_class(request.POST)
    except Exception as error:
        return _session_error(request, error)

    form_valid = form.is_valid()
    if action in BOOKING_ID_ACTIONS and booking_id is None:
        form.add_error(None, GENERIC)
        form_valid = False
    if action == CANCEL_REGISTRATION and registration_id is None:
        form.add_error(None, GENERIC)
        form_valid = False

    if not form_valid:
        return _invalid_form_response(
            request,
            form,
            action,
            title,
            context_id,
            booking_id,
            registration_id,
        )

    payload = form.payload()
    if action in BOOKING_ID_ACTIONS:
        payload["booking_id"] = booking_id
    if action == CANCEL_REGISTRATION:
        payload["registration_id"] = registration_id

    try:
        command_id = parks_session.submit(
            request.session, operation, payload)
    except Exception as error:
        return _session_error(request, error)

    return _pending_response(
        request, command_id, _selected_session(request))


__all__ = ["household"]
