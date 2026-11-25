# SPDX-License-Identifier: AGPL-3.0-only
"""Public parks command-status and payment-return views."""
from urllib.parse import urlsplit

from django.views.decorators.http import require_GET

from . import parks_household_context, parks_session, parks_views

HOUSEHOLD_URL = "/parks/household/"


def _error(request):
    return parks_views.render_page(request, {
        "mode": "message",
        "title": "Request unavailable",
        "message": parks_views.GENERIC,
    }, 503)


def _checkout_url(value):
    if not isinstance(value, str):
        return None
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError:
        return None
    if parts.scheme != "https":
        return None
    if (parts.hostname or "").lower() != "checkout.stripe.com":
        return None
    if parts.username or parts.password:
        return None
    if port not in (None, 443):
        return None
    return value


def _payment(result):
    if not isinstance(result, dict):
        return {"checkout_url": None}
    payment = dict(result)
    payment["checkout_url"] = _checkout_url(result.get("checkout_url"))
    return payment


@require_GET
def command(request, command_id):
    try:
        row = parks_session.read(request.session, str(command_id))
        if not isinstance(row, dict):
            return _error(request)
        state = row.get("state")
        if state in ("queued", "claimed"):
            return parks_views.pending(request, command_id)
        if state == "failed":
            return _error(request)
        if state != "completed":
            return _error(request)
        operation = row.get("operation")
        result = row.get("result")
        if operation == "parks_create_household":
            if not isinstance(result, dict):
                return _error(request)
            token = result.get("tracking_token")
            if not isinstance(token, str) or not token:
                return _error(request)
            link = HOUSEHOLD_URL + token + "/"
            return parks_views.render_page(request, {
                "mode": "created",
                "title": "Household created",
                "message": "Your parks household is ready.",
                "private_link": link,
                "save_url": link,
                "household_url": HOUSEHOLD_URL,
            })
        if operation == "parks_read_household":
            context = parks_household_context.household_context(
                result, str(command_id), request.GET.get("session"))
            if not isinstance(context, dict):
                return _error(request)
            context = dict(context)
            context["mode"] = "household"
            context.setdefault("household_url", HOUSEHOLD_URL)
            return parks_views.render_page(request, context)
        if operation == "parks_availability":
            return parks_views.render_page(request, {
                "mode": "availability",
                "title": "Availability",
                "availability": result,
            })
        if operation in ("parks_prepare_checkout", "parks_read_checkout"):
            payment = _payment(result)
            return parks_views.render_page(request, {
                "mode": "payment",
                "title": "Payment",
                "payment": payment,
                "checkout_url": payment.get("checkout_url"),
            })
        return parks_views.render_page(request, {
            "mode": "message",
            "title": "Request complete",
            "message": "Your parks request was completed.",
            "household_url": HOUSEHOLD_URL,
        })
    except Exception:
        return _error(request)


@require_GET
def payments_return(request):
    return parks_views.render_page(request, {
        "mode": "message",
        "title": "Payment return received",
        "message": ("Your payment return was received. We are verifying the "
                    "payment with the host; it is not marked paid yet."),
        "paid": False,
        "household_url": HOUSEHOLD_URL,
    })
