# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import io
import json
import os
import tempfile
import zipfile
from pathlib import Path
from unittest.mock import patch

from django.test import TestCase
from sqlalchemy import create_engine

from townlight_comms.workflow import CommunicationsRepository
from townlight_comms.migrations import upgrade
from townlight_comms.store import canonical_bytes, digest

from .models import ArticlePublication, ArticlePublicationRevision


class CommunicationsPublicationTests(TestCase):
    """Publish actual CommunicationsRepository artifacts through the receiver."""

    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.release_root = self.root / "releases"
        self.key_file = self.root / "publisher-sha256"
        self.token = "Z" * 43
        self.key_file.write_text(
            hashlib.sha256(self.token.encode()).hexdigest(), encoding="ascii"
        )

        environment = patch.dict(os.environ, {
            "TOWNLIGHT_PORTAL_PUBLISHER_TOKEN_SHA256_FILE": str(self.key_file),
            "TOWNLIGHT_RELEASE_ROOT": str(self.release_root),
        })
        environment.start()
        self.addCleanup(environment.stop)

        self.engine = create_engine(f"sqlite:///{self.root / 'comms.sqlite3'}")
        self.addCleanup(self.engine.dispose)
        upgrade(self.engine)
        self.repository = CommunicationsRepository(self.engine)

        self.actor = "publication-clerk"
        self.language = "en"
        self.url = "https://city.example/records/budget"
        self.snapshot = {
            "url": self.url,
            "text": "Captured public record: the budget was adopted 5-2.",
        }
        self.source = {
            "kind": "meetings",
            "id": "council",
            "revision": "1",
            "title": "Council",
            "url": self.url,
            "sha256": digest(canonical_bytes(self.snapshot)),
            "eligible": True,
        }
        self.attachment = b"%PDF-1.7\nPublic attachment\n" + bytes(range(32))
        self.attachment_type = "application/pdf"

    def draft(self, title="Budget adopted", body="The council adopted the budget."):
        article = self.repository.create(
            self.actor,
            "announcement",
            title,
            body,
            self.language,
            [self.source],
            access_review={"reviewed": True, "findings": []},
        )
        article = self.repository.add_attachment(
            article["id"],
            article["current_revision"],
            self.actor,
            "budget-summary.pdf",
            self.attachment_type,
            self.attachment,
            public=True,
        )
        return article

    def approved_artifact(self, article, note):
        article_id = article["id"]
        revision = article["current_revision"]
        sha256 = article["revision"]["sha256"]
        sources = article["revision"]["source_refs"]
        snapshots = []

        for source in sources:
            content = dict(self.snapshot)
            snapshots.append({"reference": source, "content": content})

        self.repository.review(article_id, self.actor, revision, note)
        self.repository.approve(
            article_id, revision, sha256, self.actor, sources
        )
        return self.repository.build_public_artifact(
            article_id, revision, sha256, snapshots
        )

    def bundle(self, article_id, title, artifact=None):
        manifest = {
            "version": 2,
            "kind": "article",
            "action": "publish" if artifact is not None else "withdraw",
            "meeting_id": article_id,
        }
        if artifact is not None:
            manifest["title"] = title
            manifest.update(
                artifact_sha256=hashlib.sha256(artifact).hexdigest(),
                artifact_size=len(artifact),
            )
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest))
            if artifact is not None:
                archive.writestr("release.bin", artifact)
        return buffer.getvalue()

    def post(self, data, article_id, sequence, token=None, digest_value=None):
        return self.client.post(
            f"/townlight/v1/publications/{article_id}/article/{sequence}/",
            data,
            secure=True,
            content_type="application/zip",
            HTTP_AUTHORIZATION="Bearer " + (token or self.token),
            HTTP_X_TOWNLIGHT_SHA256=(
                digest_value or hashlib.sha256(data).hexdigest()
            ),
        )

    def attachment_id(self, article):
        return article["revision"]["attachment_refs"][0]["id"]

    def test_authenticated_publish_replay_and_public_representation(self):
        article = self.draft(
            body="The council adopted the budget. <script>alert(1)</script>"
        )
        artifact = self.approved_artifact(article, "Checked public sources.")
        data = self.bundle(article["id"], article["revision"]["title"], artifact)

        first = self.post(data, article["id"], 1)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["status"], "applied")
        replay = self.post(data, article["id"], 1)
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.json()["status"], "unchanged")

        listing = self.client.get("/communications/")
        self.assertEqual(listing.status_code, 200)
        self.assertContains(listing, "Budget adopted")
        self.assertNotContains(listing, "alert(1)")

        base = f"/communications/{article['id']}"
        detail = self.client.get(base + "/")
        self.assertEqual(detail.status_code, 200)
        self.assertContains(detail, "&lt;script&gt;")

        captured = self.client.get(base + "/sources/0/")
        self.assertEqual(captured.status_code, 200)
        self.assertContains(captured, "the budget was adopted 5-2")

        attachment_id = self.attachment_id(article)
        download = self.client.get(f"{base}/attachments/{attachment_id}/")
        self.assertEqual(download.status_code, 200)
        downloaded = download.content
        self.assertEqual(downloaded, self.attachment)
        self.assertEqual(
            hashlib.sha256(downloaded).hexdigest(),
            hashlib.sha256(self.attachment).hexdigest(),
        )

    def test_correction_withdrawal_and_history_retention(self):
        article = self.draft()
        first_artifact = self.approved_artifact(article, "Initial review.")
        first = self.bundle(
            article["id"], article["revision"]["title"], first_artifact
        )
        self.assertEqual(self.post(first, article["id"], 1).status_code, 200)
        self.assertGreater(article["current_revision"], 1)
        first_response = self.client.get(f"/communications/{article['id']}/")
        self.assertNotContains(
            first_response, 'class="corrected-publication"', status_code=200
        )

        article = self.repository.edit(
            article["id"],
            self.actor,
            article["current_revision"],
            "Budget adopted with correction",
            "Corrected public summary.",
            self.language,
            article["revision"]["source_refs"],
            access_review={"reviewed": True, "findings": []},
        )
        correction_artifact = self.approved_artifact(article, "Correction review.")
        correction = self.bundle(
            article["id"], article["revision"]["title"], correction_artifact
        )
        self.assertEqual(
            self.post(correction, article["id"], 2).json()["status"], "applied"
        )
        corrected_response = self.client.get(f"/communications/{article['id']}/")
        self.assertContains(
            corrected_response, 'class="corrected-publication"', status_code=200
        )
        self.assertContains(corrected_response, "Corrected public summary.")

        stale = self.post(first, article["id"], 1)
        self.assertEqual(stale.status_code, 409)

        retried = self.post(correction, article["id"], 2)
        self.assertEqual(retried.json()["status"], "unchanged")
        retried_response = self.client.get(f"/communications/{article['id']}/")
        self.assertContains(retried_response, 'class="corrected-publication"')
        self.assertEqual(ArticlePublicationRevision.objects.count(), 2)

        withdrawal = self.bundle(article["id"], article["revision"]["title"])
        self.assertEqual(
            self.post(withdrawal, article["id"], 3).json()["status"], "applied"
        )

        base = f"/communications/{article['id']}"
        self.assertEqual(self.client.get(base + "/").status_code, 404)
        self.assertEqual(self.client.get(base + "/sources/0/").status_code, 404)
        self.assertEqual(
            self.client.get(
                f"{base}/attachments/{self.attachment_id(article)}/"
            ).status_code,
            404,
        )

        self.assertEqual(
            len(list(self.release_root.rglob("*.zip"))),
            2,
        )
        self.assertEqual(ArticlePublicationRevision.objects.count(), 3)
        self.assertTrue(ArticlePublication.objects.get().withdrawn)

    def test_rejected_publications_create_no_publication_records(self):
        article = self.draft()
        artifact = self.approved_artifact(article, "Checked before publication.")
        data = self.bundle(article["id"], article["revision"]["title"], artifact)

        wrong_token = self.post(data, article["id"], 1, token="Y" * 43)
        self.assertEqual(wrong_token.status_code, 401)

        wrong_digest = self.post(
            data, article["id"], 1, digest_value="f" * 64
        )
        self.assertEqual(wrong_digest.status_code, 400)

        broken = artifact[:-7]
        invalid = self.bundle(article["id"], article["revision"]["title"], broken)
        self.assertEqual(self.post(invalid, article["id"], 1).status_code, 400)

        self.assertEqual(ArticlePublication.objects.count(), 0)
        self.assertEqual(ArticlePublicationRevision.objects.count(), 0)

    def test_library_elections_source_kinds_are_accepted(self):
        article_ids = set()
        for kind in ("library", "elections"):
            self.source["kind"] = kind
            article = self.draft()
            article_ids.add(article["id"])
            artifact = self.approved_artifact(
                article, f"Checked {kind} source."
            )
            data = self.bundle(
                article["id"], article["revision"]["title"], artifact
            )

            first = self.post(data, article["id"], 1)
            self.assertEqual(first.status_code, 200)
            self.assertEqual(first.json()["status"], "applied")
            replay = self.post(data, article["id"], 1)
            self.assertEqual(replay.status_code, 200)
            self.assertEqual(replay.json()["status"], "unchanged")

            base = f"/communications/{article['id']}"
            detail = self.client.get(base + "/")
            self.assertEqual(detail.status_code, 200)
            source_response = self.client.get(base + "/sources/0/")
            self.assertEqual(source_response.status_code, 200)
            self.assertContains(
                source_response, "the budget was adopted 5-2"
            )

        self.assertEqual(len(article_ids), 2)
        self.assertEqual(ArticlePublicationRevision.objects.count(), 2)

    def test_unknown_or_ineligible_source_refs_rejected(self):
        from .communications_content import _source_ref

        for kind in ("library", "elections"):
            valid = dict(self.source)
            valid["kind"] = kind
            self.assertIsNone(_source_ref(valid))

        unknown = dict(self.source)
        unknown["kind"] = "unknown"
        with self.assertRaises(ValueError):
            _source_ref(unknown)

        ineligible = dict(self.source)
        ineligible["eligible"] = False
        with self.assertRaises(ValueError):
            _source_ref(ineligible)
