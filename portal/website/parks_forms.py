# SPDX-License-Identifier: AGPL-3.0-only
"""Django forms for resident parks and recreation operations."""
import uuid
from datetime import date, datetime, timedelta, timezone as dt_timezone

from django import forms
from django.core.validators import RegexValidator

BCP47 = RegexValidator(
    r"^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})?$",
    "Enter a valid BCP 47 language tag.",
)
DT_FORMAT = "%Y-%m-%dT%H:%M:%S%z"


class AwareDateTimeField(forms.DateTimeField):
    """Require an ISO datetime carrying an explicit UTC offset."""

    def to_python(self, value):
        if isinstance(value, datetime):
            dt = value
        else:
            raw = (value or "").strip()
            if not raw:
                return None
            if raw.endswith(("Z", "z")):
                raw = raw[:-1] + "+00:00"
            try:
                dt = datetime.fromisoformat(raw)
            except ValueError:
                raise forms.ValidationError(
                    "Enter an ISO date and time with a timezone offset."
                )
        if dt.utcoffset() is None:
            raise forms.ValidationError(
                "Include a timezone offset; local times are not assumed."
            )
        return dt


def _iso_utc(value):
    return value.astimezone(dt_timezone.utc).isoformat()


def _validate_window(form, cleaned):
    starts = cleaned.get("starts_at")
    ends = cleaned.get("ends_at")
    if starts and ends and ends <= starts:
        form.add_error("ends_at", "End must be after start.")
    return cleaned


def _datetime_input():
    return forms.DateTimeInput(
        format=DT_FORMAT,
        attrs={"placeholder": "2025-01-31T14:30:00+00:00"},
    )


class HouseholdForm(forms.Form):
    contact_name = forms.CharField(max_length=200)
    email = forms.EmailField(max_length=254)
    phone = forms.CharField(max_length=50, required=False)
    address = forms.CharField(max_length=1000, required=False, widget=forms.Textarea)
    language = forms.CharField(max_length=16, initial="en", validators=[BCP47])

    def payload(self):
        data = self.cleaned_data
        return {
            "household": {
                "contact_name": data["contact_name"],
                "email": data["email"],
                "phone": data["phone"],
                "address": data["address"],
                "language": data["language"],
            }
        }


class ParticipantForm(forms.Form):
    name = forms.CharField(max_length=200)
    birth_date = forms.DateField(
        widget=forms.DateInput(attrs={"type": "date"}, format="%Y-%m-%d")
    )
    accommodations = forms.CharField(
        max_length=5000, required=False, widget=forms.Textarea
    )

    def clean_birth_date(self):
        value = self.cleaned_data["birth_date"]
        if value > date.today():
            raise forms.ValidationError("Birth date cannot be in the future.")
        return value

    def payload(self):
        data = self.cleaned_data
        return {
            "participant": {
                "name": data["name"],
                "birth_date": data["birth_date"].isoformat(),
                "accommodations": data["accommodations"],
            }
        }


class BookingForm(forms.Form):
    resource_id = forms.UUIDField(widget=forms.HiddenInput)
    expected_resource_revision = forms.IntegerField(
        min_value=1, widget=forms.HiddenInput
    )
    starts_at = AwareDateTimeField(widget=_datetime_input())
    ends_at = AwareDateTimeField(widget=_datetime_input())
    purpose = forms.CharField(max_length=2000, widget=forms.Textarea)
    repeat_weeks = forms.IntegerField(
        min_value=1, max_value=52, initial=1,
        widget=forms.NumberInput(attrs={"min": 1, "max": 52}),
    )

    def clean(self):
        cleaned = _validate_window(self, super().clean())
        starts = cleaned.get("starts_at")
        ends = cleaned.get("ends_at")
        weeks = cleaned.get("repeat_weeks")
        if starts and ends and weeks:
            cleaned["occurrences"] = [
                {
                    "starts_at": _iso_utc(starts + timedelta(weeks=index)),
                    "ends_at": _iso_utc(ends + timedelta(weeks=index)),
                }
                for index in range(weeks)
            ]
        return cleaned

    def payload(self):
        data = self.cleaned_data
        return {
            "resource_id": str(data["resource_id"]),
            "expected_resource_revision": data["expected_resource_revision"],
            "occurrences": data["occurrences"],
            "purpose": data["purpose"],
        }


class AvailabilityForm(forms.Form):
    resource_id = forms.UUIDField(widget=forms.HiddenInput)
    starts_at = AwareDateTimeField(widget=_datetime_input())
    ends_at = AwareDateTimeField(widget=_datetime_input())

    def clean(self):
        return _validate_window(self, super().clean())

    def payload(self):
        data = self.cleaned_data
        return {
            "resource_id": str(data["resource_id"]),
            "starts_at": _iso_utc(data["starts_at"]),
            "ends_at": _iso_utc(data["ends_at"]),
        }


class CancelForm(forms.Form):
    expected_revision = forms.IntegerField(min_value=1, widget=forms.HiddenInput)
    reason = forms.CharField(max_length=2000, widget=forms.Textarea)

    def payload(self):
        data = self.cleaned_data
        return {
            "expected_revision": data["expected_revision"],
            "reason": data["reason"],
        }


class RescheduleForm(CancelForm):
    starts_at = AwareDateTimeField(widget=_datetime_input())
    ends_at = AwareDateTimeField(widget=_datetime_input())

    def clean(self):
        return _validate_window(self, super().clean())

    def payload(self):
        data = self.cleaned_data
        return {
            "expected_revision": data["expected_revision"],
            "reason": data["reason"],
            "starts_at": _iso_utc(data["starts_at"]),
            "ends_at": _iso_utc(data["ends_at"]),
        }


def _participant_choice(item):
    participant_id = item["id"]
    snapshot = item.get("snapshot") or {}
    return str(participant_id), str(snapshot.get("name", ""))


class RegistrationForm(forms.Form):
    session_id = forms.UUIDField(widget=forms.HiddenInput)
    expected_session_revision = forms.IntegerField(
        min_value=1, widget=forms.HiddenInput
    )
    participant_id = forms.ChoiceField(choices=())

    def __init__(self, *args, own_participants=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["participant_id"].choices = [
            _participant_choice(item) for item in (own_participants or [])
        ]

    def clean_participant_id(self):
        try:
            return str(uuid.UUID(str(self.cleaned_data["participant_id"])))
        except (ValueError, TypeError, AttributeError):
            raise forms.ValidationError("Choose one of your participants.")

    def payload(self):
        data = self.cleaned_data
        return {
            "session_id": str(data["session_id"]),
            "expected_session_revision": data["expected_session_revision"],
            "participant_id": data["participant_id"],
        }


class CheckoutForm(forms.Form):
    obligation_id = forms.UUIDField(widget=forms.HiddenInput)

    def payload(self):
        return {"obligation_id": str(self.cleaned_data["obligation_id"])}


class CheckoutReadForm(forms.Form):
    intent_id = forms.UUIDField(widget=forms.HiddenInput)

    def payload(self):
        return {"intent_id": str(self.cleaned_data["intent_id"])}


class RefreshForm(forms.Form):
    def payload(self):
        return {}


class ParticipantEditForm(ParticipantForm):
    participant_id = forms.UUIDField(widget=forms.HiddenInput)
    expected_revision = forms.IntegerField(min_value=1, widget=forms.HiddenInput)

    def payload(self):
        data = super().payload()
        data.update({
            "participant_id": str(self.cleaned_data["participant_id"]),
            "expected_revision": self.cleaned_data["expected_revision"],
        })
        return data
