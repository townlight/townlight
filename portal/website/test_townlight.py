# SPDX-License-Identifier: AGPL-3.0-only
import hashlib
import io
import json
import zipfile
import os
import tempfile
from pathlib import Path
from uuid import uuid4
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.urls import reverse
from unittest.mock import patch
from website.models import Meeting
from website.townlight import ingest, release_file

class NativeBundleTests(TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.env = patch.dict(os.environ, {'TOWNLIGHT_RELEASE_ROOT': str(Path(self.temp.name) / 'releases')})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.ids = {key: str(uuid4()) for key in ('archive_id','meeting_id','recording_id','request_id','release_copy_id')}
        self.content = b'\x00\x00\x00\x18ftypisom' + b'approved video'
        self.sha = hashlib.sha256(self.content).hexdigest()
        self.selection = dict(self.ids, action='publish', approve_publication=True, expected_release_sha256=self.sha)
        self.manifest = dict(self.ids, version=1, action='publish', original_sha256='a'*64,
            title='Council', scheduled_start='2026-10-01T12:00:00+00:00', agenda='Agenda', packet='Packet', minutes='Minutes', summary='',
            release={'path':'release.bin','sha256':self.sha,'size':len(self.content),'media_type':'video/mp4'})
    def blob(self, manifest=None, content=None, extra=None):
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w') as z:
            z.writestr('manifest.json', json.dumps(manifest or self.manifest))
            z.writestr('release.bin', self.content if content is None else content)
            if extra: z.writestr(extra, b'bad')
        path = Path(self.temp.name) / f'{uuid4()}.zip'
        path.write_bytes(output.getvalue())
        return path
    def test_publish_range_idempotent_and_withdraw(self):
        ingest(self.blob(), self.selection); ingest(self.blob(), self.selection)
        self.assertEqual(Meeting.objects.count(), 1)
        item=Meeting.objects.get()
        response=self.client.get(f'/meetings/{item.pk}/release/', HTTP_RANGE='bytes=0-3')
        self.assertEqual(response.status_code,206); self.assertEqual(b''.join(response.streaming_content),self.content[:4])
        selection=dict(self.selection, action='withdraw')
        output=io.BytesIO()
        with zipfile.ZipFile(output,'w') as z: z.writestr('manifest.json',json.dumps({'version':1,'action':'withdraw','archive_id':self.ids['archive_id']}))
        path=Path(self.temp.name)/'withdraw.zip'; path.write_bytes(output.getvalue())
        ingest(path, selection)
        self.assertEqual(self.client.get(f'/meetings/{item.pk}/').status_code,404)
        self.assertEqual(self.client.get(f'/meetings/{item.pk}/release/').status_code,404)
    def test_tampering_does_not_change_published_projection(self):
        ingest(self.blob(), self.selection)
        for bad in (self.blob(content=b'wrong'), self.blob(extra='../private')):
            with self.assertRaises(ValueError): ingest(bad, self.selection)
        self.assertTrue(Meeting.objects.get().published)
        self.assertEqual(release_file(Meeting.objects.get()).read_bytes(),self.content)

    def test_editor_cannot_trigger_publication(self):
        user = get_user_model().objects.create_user(username='editor', password='example', is_staff=True)
        user.user_permissions.add(Permission.objects.get(content_type__app_label='wagtailadmin', codename='access_admin'))
        self.client.force_login(user)
        with patch('website.wagtail_hooks.sync') as sync:
            response = self.client.post(reverse('townlight-publication'), self.selection)
        self.assertIn(response.status_code, (302, 403))
        sync.assert_not_called()

    def test_superuser_can_open_publication_form(self):
        user = get_user_model().objects.create_superuser(username='publisher', password='example', email='publisher@example.com')
        self.client.force_login(user)
        self.assertEqual(self.client.get(reverse('townlight-publication')).status_code, 200)

    def test_large_release_is_streamed_and_configured_limit_enforced(self):
        self.content = b'\x00\x00\x00\x18ftypisom' + b'x' * (2 * 1024 * 1024)
        self.sha = hashlib.sha256(self.content).hexdigest()
        self.selection['expected_release_sha256'] = self.sha
        self.manifest['release'].update(sha256=self.sha, size=len(self.content))
        path = self.blob()
        with patch.dict(os.environ, {'TOWNLIGHT_PORTAL_MAX_BYTES': str(1024 * 1024)}):
            with self.assertRaises(ValueError): ingest(path, self.selection)
        self.assertEqual(Meeting.objects.count(), 0)
        ingest(path, self.selection)
        response = self.client.get(f'/meetings/{Meeting.objects.get().pk}/release/')
        chunks = list(response.streaming_content)
        self.assertGreater(len(chunks), 1)
        self.assertLessEqual(max(map(len, chunks)), 1024 * 1024)
        self.assertEqual(hashlib.sha256(b''.join(chunks)).hexdigest(), self.sha)

    def test_head_closes_unconsumed_release_file(self):
        ingest(self.blob(), self.selection)
        item = Meeting.objects.get()
        stream = release_file(item).open('rb')
        with patch('website.views.release_file') as path:
            path.return_value.open.return_value = stream
            response = self.client.head(f'/meetings/{item.pk}/release/')
            self.assertEqual(response.status_code, 200)
            response.close()
        self.assertTrue(stream.closed)

    def test_staff_lookup_prefills_selection_without_approving(self):
        user = get_user_model().objects.create_superuser(username='lookup', password='example', email='lookup@example.invalid')
        self.client.force_login(user)
        choice = {'title': 'Approved public title', 'selection': dict(self.selection, approve_publication=False)}
        with patch('website.wagtail_hooks.publication_choices', return_value=[choice]) as lookup:
            response = self.client.get(reverse('townlight-publication'), {
                'request_id': self.ids['request_id'], 'release_copy_id': self.ids['release_copy_id'],
                'archive_id': self.ids['archive_id']})
        self.assertEqual(response.status_code, 200)
        lookup.assert_called_once()
        form = response.context['form']
        self.assertEqual(form.initial['release_copy_id'], self.ids['release_copy_id'])
        self.assertIs(form.initial['approve_publication'], False)
