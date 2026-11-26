# SPDX-License-Identifier: AGPL-3.0-only
import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cryptography.fernet import Fernet
from django.http import HttpResponse
from django.test import Client, LiveServerTestCase, RequestFactory, TestCase, override_settings

from website import parks_views, resident_views
from website.models import ResidentCommand


def _csrf(html):
    match = re.search(r'name="csrfmiddlewaretoken" value="([^"]+)"', html)
    return match.group(1) if match else ""


@override_settings(ALLOWED_HOSTS=["testserver"], SECURE_SSL_REDIRECT=False,
                   SESSION_COOKIE_SECURE=False, CSRF_COOKIE_SECURE=False)
class FormPolicyTests(TestCase):
    def test_resident_modes(self):
        rf = RequestFactory()
        for mode in ("home", "lookup", "detail", "recovery", "recovery_complete"):
            with patch("website.resident_views.render", return_value=HttpResponse("ok")):
                response = resident_views._render(rf.get("/"), {"mode": mode})
            self.assertEqual(response["Referrer-Policy"], "origin")
        for mode in ("created", "recovered", "pending", "message", "payment"):
            with patch("website.resident_views.render", return_value=HttpResponse("ok")):
                response = resident_views._render(rf.get("/"), {"mode": mode})
            self.assertEqual(response["Referrer-Policy"], "no-referrer")

    def test_parks_modes(self):
        rf = RequestFactory()
        for mode in ("form", "resource", "household"):
            with patch("website.parks_views.render", return_value=HttpResponse("ok")):
                response = parks_views.render_page(rf.get("/"), {"mode": mode})
            self.assertEqual(response["Referrer-Policy"], "origin")
        for mode in ("created", "recovered", "pending", "message", "payment"):
            with patch("website.parks_views.render", return_value=HttpResponse("ok")):
                response = parks_views.render_page(rf.get("/"), {"mode": mode})
            self.assertEqual(response["Referrer-Policy"], "no-referrer")

    def test_actual_get_keeps_query_and_origin(self):
        client = Client()
        lookup = "/service-requests/track/"
        response = client.get(lookup, {"q": "needle"})
        self.assertEqual((response.status_code, response["Referrer-Policy"]), (200, "origin"))
        self.assertEqual(response.wsgi_request.GET["q"], "needle")
        response = client.get("/parks/household/new/", {"q": "needle"})
        self.assertEqual((response.status_code, response["Referrer-Policy"]), (200, "origin"))
        self.assertEqual(response.wsgi_request.GET["q"], "needle")

    def test_parks_capture_redirect_no_referrer(self):
        client = Client()
        token = "A" * 43
        with patch("website.parks_session.save_credential"):
            response = client.get(f"/parks/household/{token}/")
        self.assertIn(response.status_code, (301, 302))
        self.assertEqual(response["Referrer-Policy"], "no-referrer")

    def test_csrf_both_forms(self):
        paths = ["/service-requests/track/", "/parks/household/new/"]
        before = ResidentCommand.objects.count()
        for path in paths:
            client = Client(enforce_csrf_checks=True)
            self.assertEqual(client.post(path, {}).status_code, 403)
            page = client.get(path)
            self.assertEqual(page.status_code, 200)
            token = _csrf(page.content.decode())
            self.assertTrue(token)
            response = client.post(path, {"csrfmiddlewaretoken": token},
                                   HTTP_ORIGIN="https://evil.example")
            self.assertEqual(response.status_code, 403)
        self.assertEqual(ResidentCommand.objects.count(), before)


@override_settings(ALLOWED_HOSTS=["localhost", "127.0.0.1", "testserver"],
                   SECURE_SSL_REDIRECT=False, SESSION_COOKIE_SECURE=False,
                   CSRF_COOKIE_SECURE=False)
class ResidentFormBrowserTests(LiveServerTestCase):
    @classmethod
    def setUpClass(cls):
        module = os.environ.get("TOWNLIGHT_PLAYWRIGHT_MODULE", "")
        if not (os.path.isabs(module) and os.path.exists(module)):
            raise unittest.SkipTest("Playwright module is unavailable")
        cls.playwright_module = module
        super().setUpClass()

    def setUp(self):
        super().setUp()
        fd, self.resident_key_file = tempfile.mkstemp()
        with os.fdopen(fd, "w") as handle:
            handle.write(Fernet.generate_key().decode())
        self.env_patch = patch.dict(os.environ, {
            "TOWNLIGHT_PORTAL_RESIDENT_KEY_FILE": self.resident_key_file,
        })
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        try:
            os.unlink(self.resident_key_file)
        except FileNotFoundError:
            pass
        super().tearDown()

    def test_browser_form_policy(self):
        helper = Path(__file__).parent / "tests" / "resident-form-browser.mjs"
        payload = json.dumps({
            "base_url": self.live_server_url,
            "module": self.playwright_module,
        })
        result = subprocess.run(
            ["node", str(helper)], input=payload, text=True,
            capture_output=True, timeout=90, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr[-500:])
        data = json.loads(result.stdout)
        for key in ("lookup", "household", "sameOriginPrivacy", "crossOriginPrivacy"):
            self.assertIs(data.get(key), True)
        self.assertEqual(
            sorted(ResidentCommand.objects.values_list("operation", "state")),
            [("parks_create_household", "queued"), ("read_request", "queued")],
        )
