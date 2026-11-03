# SPDX-License-Identifier: AGPL-3.0-only
"""Check the deployment boundary in a fresh process, independent of test settings."""
import os
from pathlib import Path
import subprocess
import sys

from django.test import SimpleTestCase


class DeploymentTests(SimpleTestCase):
    def settings_process(self, key=None):
        env = {k: v for k, v in os.environ.items() if k != 'TOWNLIGHT_SECRET_KEY'}
        env.update(TOWNLIGHT_DEBUG='0')
        if key is not None:
            env['TOWNLIGHT_SECRET_KEY'] = key
        return subprocess.run([sys.executable, '-c',
            'from portal import settings as s; '
            'assert s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE and s.SECURE_SSL_REDIRECT; '
            'assert s.STATIC_ROOT; print("deployment settings verified")'],
            env=env, cwd=Path(__file__).resolve().parents[1], capture_output=True, text=True)

    def test_production_refuses_missing_or_short_key(self):
        for key in (None, 'short'):
            result = self.settings_process(key)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('TOWNLIGHT_SECRET_KEY', result.stderr)

    def test_production_cookie_and_tls_defaults(self):
        result = self.settings_process('synthetic-test-secret-' * 4)
        self.assertEqual(result.returncode, 0, result.stderr)
