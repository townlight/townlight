# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import io
import json
import os
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase

from .models import Meeting, PublicationCursor


class PublisherReceiverTests(TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        self.key_file = root / "publisher-sha256"
        self.token = "Z" * 43
        self.key_file.write_text(hashlib.sha256(self.token.encode()).hexdigest(), encoding="ascii")
        settings = patch.dict(os.environ, {
            "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE": str(self.key_file),
            "TOWNLIGHT_RELEASE_ROOT": str(root / "releases"),
        })
        settings.start()
        self.addCleanup(settings.stop)
        self.meeting = str(uuid4())
        self.packet = b"%PDF-1.7\nReviewed meeting packet"
        self.recording = b"\0\0\0\x18ftypisom" + b"Reviewed recording"

    def bundle(self, kind, content=None, **changes):
        data = {"version": 2, "action": "withdraw" if content is None else "publish", "kind": kind,
                "meeting_id": self.meeting}
        if content is not None:
            data.update(title="Council", scheduled_start="2026-11-21T12:00:00-07:00",
                        artifact_sha256=hashlib.sha256(content).hexdigest(), artifact_size=len(content))
            if kind == "packet":
                data.update(agenda="Public agenda <script>alert(1)</script>", index=[["Agenda", 3]])
            else:
                data.update(media_type="video/mp4")
        data.update(**changes)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("manifest.json", json.dumps(data))
            if content is not None:
                archive.writestr("packet.pdf" if kind == "packet" else "release.bin", content)
        return buffer.getvalue()

    def post(self, data, kind, sequence, token=None, digest=None):
        return self.client.post(f"/townlight/v1/publications/{self.meeting}/{kind}/{sequence}/",
                                data, secure=True, content_type="application/zip",
                                HTTP_AUTHORIZATION="Bearer " + (token or self.token),
                                HTTP_X_TOWNLIGHT_SHA256=digest or hashlib.sha256(data).hexdigest())

    def test_independent_correction_and_withdrawal_are_ordered_and_retryable(self):
        packet = self.bundle("packet", self.packet)
        self.assertEqual(self.post(packet, "packet", 1).json()["status"], "applied")
        self.assertEqual(self.post(packet, "packet", 1).json()["status"], "unchanged")
        self.assertEqual(self.post(self.bundle("recording", self.recording), "recording", 1).status_code, 200)
        item = Meeting.objects.get()
        base = f"/meetings/{item.pk}"
        self.assertContains(self.client.get(base + "/"), "&lt;script&gt;")
        self.assertContains(self.client.get(base + "/documents/packet/"), "page 3")
        response = self.client.get(base + "/packet.pdf")
        self.assertEqual(b"".join(response.streaming_content), self.packet)
        correction = self.bundle("packet", b"%PDF-1.7\nCorrection")
        self.assertEqual(self.post(correction, "packet", 2).status_code, 200)
        self.assertEqual(self.post(packet, "packet", 1).status_code, 409)
        self.assertEqual(self.post(self.bundle("recording"), "recording", 2).status_code, 200)
        self.assertEqual(self.client.get(base + "/release/").status_code, 404)
        remaining_packet = self.client.get(base + "/packet.pdf")
        self.assertEqual(remaining_packet.status_code, 200)
        remaining_packet.close()
        self.assertEqual(self.post(self.bundle("packet"), "packet", 3).status_code, 200)
        self.assertEqual(self.client.get(base + "/packet.pdf").status_code, 404)
        self.assertEqual(self.client.get(base + "/").status_code, 404)

    def test_confirmed_digest_authorization_and_schema_are_required(self):
        packet = self.bundle("packet", self.packet)
        self.assertEqual(self.post(packet, "packet", 1, token="Y" * 43).status_code, 401)
        self.assertEqual(self.post(packet, "packet", 1, digest="f" * 64).status_code, 400)
        private = self.bundle("packet", self.packet, staff_notes="Private data")
        self.assertEqual(self.post(private, "packet", 1).status_code, 400)
        self.assertEqual(Meeting.objects.count(), 0)
        self.assertEqual(PublicationCursor.objects.count(), 0)
        self.key_file.unlink()
        self.assertEqual(self.post(packet, "packet", 1).status_code, 401)

    def test_withdrawal_before_arrival_blocks_delayed_publish(self):
        self.assertEqual(self.post(self.bundle("packet"), "packet", 2).status_code, 200)
        self.assertEqual(self.post(self.bundle("packet", self.packet), "packet", 1).status_code, 409)
        self.assertFalse(Meeting.objects.get().published)
