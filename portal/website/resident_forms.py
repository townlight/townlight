import re
import uuid

from django import forms
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
_TRACKING_RE = re.compile(
    r"(?:TL311-([a-f0-9]{32})|([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-"
    r"[a-f0-9]{4}-[a-f0-9]{12}))",
    re.IGNORECASE,
)
_RESERVED_WINDOWS = re.compile(
    r"^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", re.IGNORECASE
)
_UNSAFE_FILENAME_CHARS = frozenset('<>:"/\\|?*')


def _command_field():
    return forms.UUIDField(widget=forms.HiddenInput, initial=uuid.uuid4)


def _revision_field():
    return forms.IntegerField(min_value=1, widget=forms.HiddenInput)


def _tracking_value(value):
    value = (value or "").strip()
    match = _TRACKING_RE.fullmatch(value)
    if not match:
        raise ValidationError(_("Enter a valid 311 tracking number."))
    try:
        return str(uuid.UUID(hex=match.group(1)) if match.group(1) else uuid.UUID(value))
    except ValueError as error:
        raise ValidationError(_("Enter a valid 311 tracking number.")) from error


def _category_choices(categories):
    choices = []
    for entry in categories or ():
        if isinstance(entry, dict):
            code = entry.get("code")
            active = entry.get("active", True)
            label = entry.get("label") or entry.get("name") or code
        else:
            code = entry
            active = True
            label = entry
        if active and code:
            choices.append((str(code), str(label)))
    return choices


def _clean_filename(name):
    if not name or len(name) > 255:
        raise ValidationError(_("Enter a file name of 255 characters or fewer."))
    if (
        name in {".", ".."}
        or ".." in name
        or any(char in _UNSAFE_FILENAME_CHARS for char in name)
        or any(ord(char) < 32 or ord(char) == 127 for char in name)
        or name.endswith((" ", "."))
        or _RESERVED_WINDOWS.match(name)
    ):
        raise ValidationError(_("Use a safe file name."))
    return name


def _actual_media_type(content):
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if b"\x00" in content:
        return None
    try:
        content.decode("utf-8")
    except UnicodeDecodeError:
        return None
    return "text/plain"


class _TrackingForm(forms.Form):
    def clean_tracking(self):
        return _tracking_value(self.cleaned_data["tracking"])


class RequestForm(forms.Form):
    command_id = _command_field()
    category = forms.ChoiceField(label=_("Category"))
    description = forms.CharField(
        max_length=8000,
        label=_("Description"),
        widget=forms.Textarea,
        help_text=_("Describe the issue and where it is happening."),
    )
    location = forms.CharField(max_length=1000, label=_("Location"))
    contact_name = forms.CharField(max_length=255, required=False, label=_("Name"))
    email = forms.EmailField(max_length=320, required=False, label=_("Email"))
    phone = forms.CharField(max_length=64, required=False, label=_("Phone"))

    def __init__(self, *args, categories=(), **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["category"].choices = _category_choices(categories)

    def clean(self):
        cleaned_data = super().clean()
        if not cleaned_data.get("email") and not cleaned_data.get("phone"):
            raise ValidationError(_("Provide either an email address or a phone number."))
        return cleaned_data


class LookupForm(_TrackingForm):
    command_id = _command_field()
    tracking = forms.CharField(max_length=38, label=_("Tracking number"))
    access_token = forms.RegexField(
        regex=r"^[A-Za-z0-9_-]{32,128}$",
        max_length=128,
        label=_("Access token"),
        help_text=_("The private token supplied with your request."),
    )


class CommentForm(forms.Form):
    command_id = _command_field()
    expected_revision = _revision_field()
    message = forms.CharField(max_length=10000, label=_("Message"), widget=forms.Textarea)


class ReopenForm(forms.Form):
    command_id = _command_field()
    expected_revision = _revision_field()
    reason = forms.CharField(max_length=10000, label=_("Reason"), widget=forms.Textarea)


class AttachmentForm(forms.Form):
    command_id = _command_field()
    expected_revision = _revision_field()
    file = forms.FileField(label=_("Attachment"))

    def clean(self):
        cleaned_data = super().clean()
        upload = cleaned_data.get("file")
        if upload is None:
            return cleaned_data
        try:
            upload.seek(0)
            content = upload.read(MAX_ATTACHMENT_BYTES + 1)
        finally:
            upload.seek(0)
        if len(content) > MAX_ATTACHMENT_BYTES:
            self.add_error("file", _("Attachments must be no larger than 10 MiB."))
            return cleaned_data
        media_type = _actual_media_type(content)
        if not content or media_type is None:
            self.add_error("file", _("Upload a PNG, JPEG, PDF, or plain-text file."))
            return cleaned_data
        try:
            cleanname = _clean_filename(upload.name)
        except ValidationError as error:
            self.add_error("file", error)
            return cleaned_data
        cleaned_data.update(
            content_bytes=content, media_type=media_type, cleanname=cleanname
        )
        return cleaned_data


class DownloadForm(forms.Form):
    command_id = _command_field()
    attachment_id = forms.UUIDField(label=_("Attachment"))


class RecoveryStartForm(_TrackingForm):
    command_id = _command_field()
    tracking = forms.CharField(max_length=38, label=_("Tracking number"))
    email = forms.EmailField(max_length=320, label=_("Email"))


class RecoveryCompleteForm(forms.Form):
    command_id = _command_field()
    challenge_id = forms.UUIDField(label=_("Challenge"))
    code = forms.RegexField(
        regex=r"^\d{6}$",
        max_length=6,
        min_length=6,
        label=_("Recovery code"),
    )
