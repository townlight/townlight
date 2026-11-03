# SPDX-License-Identifier: AGPL-3.0-only
"""Validate the private native bundle before changing the public projection."""
import hashlib
import json
import os
import re
import stat
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from django.db import transaction
from django.conf import settings
from .models import Meeting

def max_release():
    value = int(os.environ.get('TOWNLIGHT_PORTAL_MAX_BYTES', str(8 * 1024**3)))
    if not 0 < value <= 64 * 1024**3:
        raise ValueError('Invalid publication size limit')
    return value


def release_root():
    root = Path(os.environ.get('TOWNLIGHT_RELEASE_ROOT', str(settings.BASE_DIR / 'private-releases')))
    if not root.is_absolute():
        raise ValueError('Release root must be absolute')
    root = root.resolve()
    media = Path(settings.MEDIA_ROOT).resolve()
    if root == media or root.is_relative_to(media):
        raise ValueError('Release root must not be publicly served media')
    root.mkdir(parents=True, exist_ok=True)
    return root


def release_file(item):
    if not re.fullmatch(r'[0-9a-f]{64}\.bin', item.release_path or ''):
        raise ValueError('Invalid release path')
    path = (release_root() / item.release_path).resolve(strict=True)
    if path.parent != release_root() or not path.is_file():
        raise ValueError('Invalid release path')
    return path


def native_origin():
    origin = os.environ.get('TOWNLIGHT_NATIVE_ORIGIN', '').rstrip('/')
    url = urlsplit(origin)
    if (not url.hostname or url.username or url.password or url.path or url.query or url.fragment
            or (url.scheme != 'https' and not (url.scheme == 'http' and url.hostname in ('127.0.0.1', '::1')))):
        raise ValueError('Configure a trusted native origin')
    return origin


def native_headers():
    proof_path = Path(os.environ.get('TOWNLIGHT_NATIVE_PROOF_FILE', ''))
    if not proof_path.is_absolute() or not proof_path.is_file():
        raise ValueError('Configure the server-side native proof file')
    proof = proof_path.read_text(encoding='utf-8').strip()
    if not proof or '\n' in proof or '\r' in proof:
        raise ValueError('Invalid native proof')
    return {'X-Townlight-Session': proof}


def publication_choices(request_id):
    ident = str(UUID(str(request_id)))
    with httpx.Client(base_url=native_origin(), trust_env=False, follow_redirects=False, timeout=120) as client:
        response = client.get('/desktop/v1/portal/selections', params={'request_id': ident}, headers=native_headers())
        response.raise_for_status()
        data = response.json()
    return data['selections']


def fetch(selection, destination):
    with httpx.Client(base_url=native_origin(), trust_env=False, follow_redirects=False, timeout=120) as client:
        with client.stream('POST', '/desktop/v1/portal/bundle', json=selection,
                           headers=native_headers()) as response:
            response.raise_for_status()
            size = 0
            with open(destination, 'wb') as out:
                for chunk in response.iter_bytes(1024 * 1024):
                    size += len(chunk)
                    if size > max_release() + 2 * 1024 * 1024:
                        raise ValueError('Bundle too large')
                    out.write(chunk)


def ingest(blob, selection):
    if Path(blob).stat().st_size > max_release() + 2 * 1024 * 1024:
        raise ValueError('Bundle too large')
    with zipfile.ZipFile(blob) as archive:
        members = archive.infolist()
        names = [m.filename for m in members]
        if len(names) != len(set(names)) or any(n not in ('manifest.json', 'release.bin') for n in names):
            raise ValueError('Unexpected bundle paths')
        if any(stat.S_ISLNK(m.external_attr >> 16) or m.is_dir() or m.file_size > max_release() for m in members):
            raise ValueError('Unsafe bundle member')
        if 'manifest.json' not in names or archive.getinfo('manifest.json').file_size > 1024 * 1024:
            raise ValueError('Invalid manifest')
        manifest = json.loads(archive.read('manifest.json'))
        if not isinstance(manifest, dict) or manifest.get('version') != 1 or manifest.get('action') != selection['action']:
            raise ValueError('Invalid bundle contract')
        if manifest.get('archive_id') != str(UUID(str(selection['archive_id']))):
            raise ValueError('Archive mismatch')
        if manifest['action'] == 'withdraw':
            if set(manifest) != {'version', 'action', 'archive_id'} or names != ['manifest.json']:
                raise ValueError('Invalid withdrawal')
            with transaction.atomic():
                Meeting.objects.filter(vendor='townlight', tenant='native', external_id=manifest['archive_id']).update(published=False)
            return
        expected = {'version','action','archive_id','meeting_id','recording_id','request_id','release_copy_id','original_sha256','title','scheduled_start','agenda','packet','minutes','summary','release'}
        if set(manifest) != expected or set(names) != {'manifest.json', 'release.bin'}:
            raise ValueError('Invalid publication fields')
        for key in ('meeting_id', 'recording_id', 'request_id', 'release_copy_id'):
            if manifest[key] != str(UUID(str(selection[key]))):
                raise ValueError('Identity mismatch')
        for key in ('title', 'agenda', 'packet', 'minutes', 'summary'):
            if not isinstance(manifest[key], str) or len(manifest[key]) > (400 if key == 'title' else 250000):
                raise ValueError('Invalid public text')
        if not isinstance(manifest['original_sha256'], str) or not re.fullmatch(r'[0-9a-f]{64}', manifest['original_sha256']):
            raise ValueError('Invalid original hash')
        dt = datetime.fromisoformat(manifest['scheduled_start'])
        if dt.tzinfo is None:
            raise ValueError('Meeting time must have a timezone')
        release = manifest['release']
        if not isinstance(release, dict) or set(release) != {'path','sha256','size','media_type'}:
            raise ValueError('Invalid release metadata')
        if (release['path'] != 'release.bin' or release['media_type'] not in ('video/mp4','application/octet-stream')
                or type(release['size']) is not int or not 0 < release['size'] <= max_release()
                or not re.fullmatch(r'[0-9a-f]{64}', release['sha256'])
                or release['sha256'] != selection['expected_release_sha256']
                or archive.getinfo('release.bin').file_size != release['size']):
            raise ValueError('Invalid release metadata')
        public_json = json.dumps(manifest, sort_keys=True, ensure_ascii=False)
        display_timezone = os.environ.get('TOWNLIGHT_DISPLAY_TIMEZONE', 'UTC')
        ZoneInfo(display_timezone)
        root = release_root()
        name = release['sha256'] + '.bin'
        temp_name = None
        try:
            with tempfile.NamedTemporaryFile(dir=root, prefix='.incoming-', delete=False) as out:
                temp_name = out.name
                digest, size, header = hashlib.sha256(), 0, b''
                with archive.open('release.bin') as source:
                    while chunk := source.read(1024 * 1024):
                        if not size: header = chunk[:12]
                        size += len(chunk)
                        if size > release['size']: raise ValueError('Release size mismatch')
                        digest.update(chunk)
                        out.write(chunk)
                if size != release['size'] or digest.hexdigest() != release['sha256']:
                    raise ValueError('Release hash mismatch')
                if release['media_type'] == 'video/mp4' and header[4:8] != b'ftyp':
                    raise ValueError('Invalid video')
            os.replace(temp_name, root / name)
            temp_name = None
            with transaction.atomic():
                Meeting.objects.update_or_create(vendor='townlight', tenant='native', external_id=manifest['archive_id'], defaults={
                    'title': manifest['title'], 'scheduled_start': dt, 'display_timezone': display_timezone, 'cancelled': False,
                    'published': True, 'agenda': [{'title': manifest['agenda']}], 'documents': [], 'recording_url': '',
                    'source_url': '', 'source_body': public_json, 'source_digest': hashlib.sha256(public_json.encode()).hexdigest(),
                    'revision': release['sha256'], 'release_path': name, 'release_media_type': release['media_type']})
        finally:
            if temp_name is not None: Path(temp_name).unlink(missing_ok=True)


def sync(selection):
    if selection.get('approve_publication') is not True:
        raise ValueError('Explicit publication approval is required')
    with tempfile.TemporaryDirectory(prefix='townlight-portal-bundle-') as directory:
        bundle_path = Path(directory) / 'bundle.zip'
        fetch(selection, bundle_path)
        ingest(bundle_path, selection)
