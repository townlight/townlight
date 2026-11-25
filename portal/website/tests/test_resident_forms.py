import uuid

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase
from website.resident_forms import (
    MAX_ATTACHMENT_BYTES,
    AttachmentForm,
    _clean_filename,
    CommentForm,
    DownloadForm,
    LookupForm,
    RecoveryCompleteForm,
    RecoveryStartForm,
    ReopenForm,
    RequestForm,
)

CATEGORIES = [
    {"code": "pothole", "name": "Pothole", "active": True},
    {"code": "retired", "name": "Retired", "active": False},
]


def request_data(**changes):
    data = {
        "command_id": str(uuid.uuid4()),
        "category": "pothole",
        "description": "A deep pothole blocks the lane.",
        "location": "100 Main Street",
        "email": "resident@example.org",
    }
    data.update(changes)
    return data


class RequestFormTests(SimpleTestCase):
    def test_command_id_initial_and_category_catalogue(self):
        form = RequestForm(categories=CATEGORIES)
        self.assertIsInstance(uuid.UUID(form["command_id"].value()), uuid.UUID)
        self.assertIn(("pothole", "Pothole"), form.fields["category"].choices)
        self.assertNotIn("retired", dict(form.fields["category"].choices))

        supplied = uuid.uuid4()
        bound = RequestForm(request_data(command_id=str(supplied)), categories=CATEGORIES)
        self.assertTrue(bound.is_valid(), bound.errors)
        self.assertEqual(bound.cleaned_data["command_id"], supplied)

    def test_invalid_category_and_contact_required(self):
        invalid = RequestForm(request_data(category="retired"), categories=CATEGORIES)
        self.assertFalse(invalid.is_valid())
        self.assertIn("category", invalid.errors)

        for data in (request_data(email="", phone=""), request_data(email="", phone="", contact_name="Resident")):
            form = RequestForm(data, categories=CATEGORIES)
            self.assertFalse(form.is_valid())
            self.assertIn("Provide either", str(form.non_field_errors()))


class LookupAndCommentFormTests(SimpleTestCase):
    def test_tracking_token_and_uuid_are_canonical(self):
        expected = uuid.uuid4()
        for tracking in (
            f"TL311-{expected.hex.upper()}",
            str(expected).upper(),
        ):
            form = LookupForm({
                "command_id": str(uuid.uuid4()),
                "tracking": tracking,
                "access_token": "A" * 32,
            })
            self.assertTrue(form.is_valid(), form.errors)
            self.assertEqual(form.cleaned_data["tracking"], str(expected))

        for tracking in ("TL311-xyz", str(uuid.uuid4())[:-1]):
            form = LookupForm({
                "command_id": str(uuid.uuid4()),
                "tracking": tracking,
                "access_token": "A" * 32,
            })
            self.assertFalse(form.is_valid())
            self.assertIn("tracking", form.errors)

    def test_revision_and_recovery_code_validation(self):
        comment = CommentForm({
            "command_id": str(uuid.uuid4()),
            "expected_revision": "0",
            "message": "Any update?",
        })
        self.assertFalse(comment.is_valid())
        self.assertIn("expected_revision", comment.errors)

        reopen = ReopenForm({
            "command_id": str(uuid.uuid4()),
            "expected_revision": "2",
            "reason": "The issue has returned.",
        })
        self.assertTrue(reopen.is_valid(), reopen.errors)

        complete = RecoveryCompleteForm({
            "command_id": str(uuid.uuid4()),
            "challenge_id": str(uuid.uuid4()),
            "code": "12345a",
        })
        self.assertFalse(complete.is_valid())
        self.assertIn("code", complete.errors)

        complete = RecoveryCompleteForm({
            "command_id": str(uuid.uuid4()),
            "challenge_id": str(uuid.uuid4()),
            "code": "012345",
        })
        self.assertTrue(complete.is_valid(), complete.errors)


class AttachmentFormTests(SimpleTestCase):
    def attachment(self, name, content, content_type="application/octet-stream"):
        return AttachmentForm(
            {"command_id": str(uuid.uuid4()), "expected_revision": "3"},
            {"file": SimpleUploadedFile(name, content, content_type=content_type)},
        )

    def test_actual_magic_overrides_client_content_type(self):
        png = b"\x89PNG\r\n\x1a\n" + b"png body"
        form = self.attachment("photo.png", png, "application/pdf")
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["media_type"], "image/png")
        self.assertEqual(form.cleaned_data["content_bytes"], png)
        self.assertEqual(form.cleaned_data["cleanname"], "photo.png")

        pdf = b"%PDF-1.7\nbody"
        form = self.attachment("mislabelled.png", pdf, "image/png")
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["media_type"], "application/pdf")

        jpeg = b"\xff\xd8\xff\xe0body"
        form = self.attachment("photo.dat", jpeg, "text/plain")
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["media_type"], "image/jpeg")

        text = b"Plain UTF-8 text"
        form = self.attachment("note.bin", text, "application/zip")
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.cleaned_data["media_type"], "text/plain")

    def test_oversize_binary_and_unsafe_names_rejected(self):
        oversize = self.attachment("large.pdf", b"%PDF-" + b"x" * MAX_ATTACHMENT_BYTES)
        self.assertFalse(oversize.is_valid())

        binary = self.attachment("bad.bin", b"\xff\x00binary")
        self.assertFalse(binary.is_valid())

        unsafe_names = ("CON.txt", "../escape.pdf", "C:\\Windows\\file.pdf", "bad\x00.txt", "x" * 256 + ".txt")
        for name in unsafe_names:
            with self.assertRaises(ValidationError, msg=name):
                _clean_filename(name)

        for name in ("CON.txt", "bad?.txt", "bad\x00.txt"):
            form = self.attachment(name, b"%PDF-body")
            self.assertFalse(form.is_valid(), name)

        traversal = self.attachment("../escape.pdf", b"%PDF-body")
        if traversal.is_valid():
            cleanname = traversal.cleaned_data["cleanname"]
            self.assertEqual(cleanname, "escape.pdf")
            self.assertNotIn("/", cleanname)
            self.assertNotIn("\\", cleanname)
        else:
            self.assertIn("file", traversal.errors)


class DownloadAndRecoveryTests(SimpleTestCase):
    def test_download_uuid_only_and_recovery_start(self):
        download = DownloadForm({
            "command_id": str(uuid.uuid4()),
            "attachment_id": "not-a-uuid",
        })
        self.assertFalse(download.is_valid())
        self.assertIn("attachment_id", download.errors)

        expected = uuid.uuid4()
        recovery = RecoveryStartForm({
            "command_id": str(uuid.uuid4()),
            "tracking": f"TL311-{expected.hex}",
            "email": "resident@example.org",
        })
        self.assertTrue(recovery.is_valid(), recovery.errors)
        self.assertEqual(recovery.cleaned_data["tracking"], str(expected))

        recovery = RecoveryStartForm({
            "command_id": str(uuid.uuid4()),
            "tracking": f"TL311-{expected.hex}",
            "email": "",
        })
        self.assertFalse(recovery.is_valid())
        self.assertIn("email", recovery.errors)
