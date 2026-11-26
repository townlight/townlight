# SPDX-License-Identifier: AGPL-3.0-only
"""Public parks views backed by the publisher-only catalogue cache."""
import uuid

from django.shortcuts import redirect, render
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods

from . import parks_session
from .parks_catalog import read_catalog
from .parks_forms import AvailabilityForm, BookingForm, HouseholdForm
from .parks_session import TOKEN_RE

TEMPLATE = "website/parks.html"
GENERIC = "We could not complete that request. Please try again."
UNAVAILABLE = "Parks information is temporarily unavailable. Please try again."
PENDING = "Your request is being processed. Refresh to check again."
HOUSEHOLD_URL = "/parks/household/"
ACTIONS = {
    "availability": ("parks_availability", AvailabilityForm),
    "booking": ("parks_create_booking", BookingForm),
}


def secured(response):
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    response["Referrer-Policy"] = "no-referrer"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def render_page(request, context, status=200):
    response = secured(render(request, TEMPLATE, context, status=status))
    # Origin (scheme/host/port only) keeps Edge same-origin form POSTs working;
    # paths and queries are omitted, and non-form modes remain no-referrer.
    if context.get("mode") in {"form", "resource", "household"}:
        response["Referrer-Policy"] = "origin"
    return response


def pending(request, command_id):
    return render_page(request, {
        "mode": "pending",
        "title": "Request received",
        "message": PENDING,
        "status_url": "/parks/commands/%s/" % command_id,
    })


def _message(request, title, message, status=200):
    return render_page(request, {
        "mode": "message", "title": title, "message": message,
    }, status)


def _uuid(value):
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        return None


def _cached(request):
    try:
        data = read_catalog(request)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _find(items, ident):
    for item in items or []:
        if isinstance(item, dict) and item.get("id") == ident:
            return item
    return None


def _catalog(data):
    value = data.get("catalog")
    return value if isinstance(value, dict) else {}


def _resource_page(resource, booking_form=None, availability_form=None, error=None):
    context = {
        "mode": "resource",
        "title": resource.get("name", "Resource"),
        "resource": resource,
        "booking_form": booking_form or BookingForm(initial={
            "resource_id": resource.get("id"),
            "expected_resource_revision": resource.get("revision"),
        }),
        "availability_form": availability_form or AvailabilityForm(initial={
            "resource_id": resource.get("id"),
        }),
        "timezone_help": (
            "Enter times with an explicit UTC offset; this resource uses %s."
            % resource.get("timezone", "its published timezone")
        ),
    }
    if error:
        context["error"] = error
    return context


@require_GET
def home(request):
    data = _cached(request)
    if data is None:
        return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    catalog = _catalog(data)
    return render_page(request, {
        "mode": "home",
        "title": "Parks and recreation",
        "available": bool(data.get("available")),
        "last_updated": data.get("updated_at"),
        "updated_at": data.get("updated_at"),
        "resources": catalog.get("resources") or [],
        "programs": catalog.get("programs") or [],
        "household_url": HOUSEHOLD_URL,
    })


@csrf_protect
@require_http_methods(["GET", "POST"])
def resource(request, resource_id):
    ident = _uuid(resource_id)
    if ident is None:
        return _message(request, "Resource not found", GENERIC, 404)
    data = _cached(request)
    if data is None:
        return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    item = _find(_catalog(data).get("resources"), ident)
    if item is None:
        return _message(request, "Resource not found", GENERIC, 404)
    if not data.get("available"):
        return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    if request.method == "GET":
        return render_page(request, _resource_page(item))
    action = request.POST.get("action", "")
    selected = ACTIONS.get(action)
    if selected is None:
        return render_page(request, _resource_page(
            item, error="Choose availability or booking."), 400)
    operation, form_class = selected
    form = form_class(request.POST)
    if not form.is_valid():
        kwargs = ({action == "booking" and "booking_form" or "availability_form":
                   form})
        return render_page(request, _resource_page(item, **kwargs), 400)
    if str(form.cleaned_data.get("resource_id")) != ident:
        kwargs = ({action == "booking" and "booking_form" or "availability_form":
                   form})
        return render_page(request, _resource_page(
            item, error=GENERIC, **kwargs), 400)
    if action == "booking" and str(
            form.cleaned_data.get("expected_resource_revision")
    ) != str(item.get("revision")):
        return render_page(request, _resource_page(
            item, booking_form=form, error=GENERIC), 400)
    if action == "booking":
        try:
            if not parks_session.credential(request.session):
                return redirect(HOUSEHOLD_URL)
        except Exception:
            return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    try:
        command_id = parks_session.submit(
            request.session, operation, form.payload())
    except Exception:
        return _message(request, "Request unavailable", GENERIC, 503)
    return pending(request, command_id)


@csrf_protect
@require_http_methods(["GET", "POST"])
def program(request, program_id):
    ident = _uuid(program_id)
    if ident is None:
        return _message(request, "Program not found", GENERIC, 404)
    data = _cached(request)
    if data is None:
        return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    catalog = _catalog(data)
    item = _find(catalog.get("programs"), ident)
    if item is None:
        return _message(request, "Program not found", GENERIC, 404)
    if not data.get("available"):
        return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    sessions = [
        session for session in catalog.get("sessions") or []
        if isinstance(session, dict) and session.get("program_id") == ident
    ]
    if request.method == "POST":
        session_id = _uuid(request.POST.get("session_id", ""))
        if session_id is None or not any(
                session.get("id") == session_id for session in sessions):
            return _message(request, "Session not found", GENERIC, 400)
        return redirect("%s?session=%s" % (HOUSEHOLD_URL, session_id))
    return render_page(request, {
        "mode": "program",
        "title": item.get("title", "Program"),
        "program": item,
        "sessions": sessions,
        "household_url": HOUSEHOLD_URL,
    })


@csrf_protect
@require_http_methods(["GET", "POST"])
def create_household(request):
    title = "Create a parks household"
    if request.method == "GET":
        return render_page(request, {
            "mode": "form", "title": title, "form": HouseholdForm(),
        })
    form = HouseholdForm(request.POST)
    if not form.is_valid():
        return render_page(request, {
            "mode": "form", "title": title, "form": form,
        }, 400)
    try:
        command_id = parks_session.submit(
            request.session, "parks_create_household", form.payload())
    except Exception:
        return _message(request, "Request unavailable", GENERIC, 503)
    return pending(request, command_id)


@require_GET
def capture(request, token):
    if not isinstance(token, str) or not TOKEN_RE.fullmatch(token):
        return _message(request, "Parks unavailable", GENERIC, 400)
    try:
        parks_session.save_credential(request.session, token)
    except Exception:
        return _message(request, "Parks unavailable", UNAVAILABLE, 503)
    return secured(redirect(HOUSEHOLD_URL))


__all__ = [
    "capture",
    "create_household",
    "home",
    "pending",
    "program",
    "render_page",
    "resource",
    "secured",
]
