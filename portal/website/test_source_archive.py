import copy
from io import BytesIO, StringIO
import json
from pathlib import Path
import shutil
import uuid
from zipfile import ZipFile

from django.conf import settings
from django.core.management import call_command
from django.test import TestCase


class SourceArchivePrivacyTests(TestCase):
    def test_runtime_fixture_is_not_public(self):
        root = Path(settings.BASE_DIR)
        sample = root / "fixtures" / "meeting.json"
        fixture = copy.deepcopy(json.loads(sample.read_text(encoding="utf-8")))
        marker = uuid.uuid4().hex
        private_title = f"private-title-{marker}"
        private_url = f"https://private.example/{marker}"
        fixture["meetings"][0]["documentList"].append(
            {"id": 999, "title": private_title, "link": private_url, "private": True}
        )
        suffix = uuid.uuid4().hex
        input_path = root / "fixtures" / f"private-input-{suffix}.json"
        other_json = root / "website" / f"runtime-{suffix}.json"
        export_dir = root / f"test-export-{suffix}"
        try:
            input_path.write_text(json.dumps(fixture), encoding="utf-8")
            other_json.write_text(private_title, encoding="utf-8")
            call_command("import_synthetic", str(input_path), stdout=StringIO())

            response = self.client.get("/source/")
            self.assertEqual(response.status_code, 200)
            with ZipFile(BytesIO(response.content)) as archive:
                names = set(archive.namelist())
                self.assertTrue(
                    {
                        "manage.py",
                        "portal/settings.py",
                        "website/models.py",
                        "website/importing.py",
                        "vendor/civiccast/agenda_import/primegov.py",
                        "vendor/civiccore/manifest.py",
                        "fixtures/meeting.json",
                        "LICENSE",
                        "LICENSE-CIVICCAST-APACHE-2.0",
                        "requirements.lock",
                        "README.md",
                    }.issubset(names)
                )
                self.assertNotIn(f"fixtures/{input_path.name}", names)
                self.assertNotIn(f"website/{other_json.name}", names)
                for name in names:
                    data = archive.read(name)
                    self.assertNotIn(private_title.encode(), data)
                    self.assertNotIn(private_url.encode(), data)

            call_command("export_public", str(export_dir), stdout=StringIO())
            for path in export_dir.iterdir():
                data = path.read_bytes()
                self.assertNotIn(private_title.encode(), data)
                self.assertNotIn(private_url.encode(), data)
                self.assertNotIn(input_path.name.encode(), data)
        finally:
            input_path.unlink(missing_ok=True)
            other_json.unlink(missing_ok=True)
            if export_dir.exists():
                shutil.rmtree(export_dir)
