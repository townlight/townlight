# SPDX-License-Identifier: AGPL-3.0-only
"""CSRF-protected public communications subscription views."""
import re
import uuid

from django import forms
from django.shortcuts import render
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods

from .resident_inbox import enqueue, read_owned

GENERIC = "We could not complete that request. Please try again."
PENDING = "Your request is being processed. Refresh to check again."
TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{32,128}\Z")
TOPICS = (
    ("all", "All updates"),
    ("meetings", "Meetings"),
    ("code", "Code and ordinances"),
    ("notice", "Public notices"),
    ("311", "311 service updates"),
    ("parks", "Parks and recreation"),
)
LANGUAGES = (("en", "English"), ("es", "Spanish"))


class SubscribeForm(forms.Form):
    email = forms.EmailField(max_length=320)
    topics = forms.MultipleChoiceField(
        choices=TOPICS,
        widget=forms.CheckboxSelectMultiple,
        error_messages={"required": "Choose at least one topic."},
    )
    language = forms.ChoiceField(choices=LANGUAGES, initial="en")


class ConfirmForm(forms.Form):
    token = forms.CharField(max_length=128, widget=forms.HiddenInput)

    def clean_token(self):
        value = self.cleaned_data.get("token", "")
        if not TOKEN_RE.fullmatch(value):
            raise forms.ValidationError("This link is not valid.")
        return value


class PreferencesForm(ConfirmForm):
    topic = forms.ChoiceField(choices=TOPICS, initial="all")
    language = forms.ChoiceField(choices=LANGUAGES, initial="en")
    active = forms.BooleanField(required=False, initial=True)


def _session_key(request):
    key = getattr(request.session, "session_key", None)
    if not key:
        request.session.create()
        key = request.session.session_key
    if not key:
        raise ValueError("session unavailable")
    return key


def _secured(response):
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    response["Referrer-Policy"] = "no-referrer"
    response["X-Content-Type-Options"] = "nosniff"
    return response


def _render(request, context, status=200):
    return _secured(render(
        request, "website/communications_subscriptions.html", context, status=status
    ))


def _message(request, title, message, status=200):
    return _render(request, {"mode": "message", "title": title, "message": message}, status)


def _pending(request, command_id):
    return _render(request, {
        "mode": "pending",
        "title": "Request received",
        "message": PENDING,
        "status_url": "/communications/subscription-command/%s/" % command_id,
    })


def _submit(request, operation, payload):
    command_id = str(uuid.uuid4())
    enqueue(_session_key(request), operation, payload, command_id)
    return _pending(request, command_id)


@csrf_protect
@require_http_methods(["GET", "POST"])
def subscribe(request):
    if request.method == "GET":
        return _render(request, {
            "mode": "subscribe", "title": "Subscribe to city updates",
            "form": SubscribeForm(),
        })
    form = SubscribeForm(request.POST)
    if not form.is_valid():
        return _render(request, {
            "mode": "subscribe", "title": "Subscribe to city updates", "form": form,
        }, 400)
    data = form.cleaned_data
    try:
        return _submit(request, "comms_subscribe", {
            "email": data["email"],
            "topics": data["topics"],
            "language": data["language"],
        })
    except Exception:
        return _message(request, "Request unavailable", GENERIC, 503)


@csrf_protect
@require_http_methods(["GET", "POST"])
def confirm(request):
    if request.method == "GET":
        token = request.GET.get("token", "")
        if not TOKEN_RE.fullmatch(token):
            return _message(request, "Request unavailable", GENERIC, 400)
        return _render(request, {
            "mode": "confirm", "title": "Confirm your subscription",
            "form": ConfirmForm(initial={"token": token}),
        })
    form = ConfirmForm(request.POST)
    if not form.is_valid():
        return _message(request, "Request unavailable", GENERIC, 400)
    try:
        return _submit(request, "comms_confirm", {
            "token": form.cleaned_data["token"],
        })
    except Exception:
        return _message(request, "Request unavailable", GENERIC, 503)


@csrf_protect
@require_http_methods(["GET", "POST"])
def preferences(request):
    if request.method == "GET":
        token = request.GET.get("token", "")
        if not TOKEN_RE.fullmatch(token):
            return _message(request, "Request unavailable", GENERIC, 400)
        return _render(request, {
            "mode": "preferences", "title": "Subscription preferences",
            "form": PreferencesForm(initial={
                "token": token, "topic": "all", "language": "en", "active": True,
            }),
        })
    form = PreferencesForm(request.POST)
    if not form.is_valid():
        return _message(request, "Request unavailable", GENERIC, 400)
    data = form.cleaned_data
    try:
        return _submit(request, "comms_preferences", {
            "token": data["token"],
            "topics": [data["topic"]],
            "language": data["language"],
            "active": bool(data["active"]),
        })
    except Exception:
        return _message(request, "Request unavailable", GENERIC, 503)


@require_GET
def command_status(request, command_id):
    try:
        row = read_owned(_session_key(request), command_id)
    except Exception:
        return _message(request, "Request unavailable", GENERIC, 404)
    state = row.get("state")
    if state == "completed":
        return _message(request, "Request complete", "Your request was completed.")
    if state == "failed":
        return _message(request, "Request not completed", GENERIC, 502)
    return _render(request, {
        "mode": "pending",
        "title": "Request in progress",
        "message": PENDING,
        "status_url": request.path,
    })
