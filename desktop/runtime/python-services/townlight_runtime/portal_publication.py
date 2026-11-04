# SPDX-License-Identifier: AGPL-3.0-only
"""Authenticated, explicit export of already approved public meeting material."""
import hashlib
import json
import os
import tempfile
import zipfile
from pathlib import Path
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import FileResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel, ConfigDict, Field, StrictBool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.desktop_bridge.station import station_url
from townlight_records.audit.logger import write_audit_log
from townlight_records.models.document import Document
from townlight_records.models.request import RecordsRequest, RequestDocument
from townlight_records.models.records_files import RequestReleaseCopy, RequestFileEvidence
from townlight_records.models.records_artifacts import RequestArtifact, RequestPublication
from townlight_records.requests.artifacts import require_current_approval, verify_export, text_hash
from townlight_records.requests.files import verify_managed_file
from townlight_meetings.public_archive import PublicArchiveRepository
from townlight_meetings.meeting_lifecycle import MeetingStore
from townlight_runtime.meetings_bridge import database_url, readiness

router = APIRouter(prefix='/desktop/v1/portal', tags=['portal-publication'])


@router.get('/selections')
async def selections(request_id: UUID, request: Request,
                     proof: str | None = Header(default=None, alias='X-Townlight-Session'),
                     session: AsyncSession = Depends(get_async_session)):
    """Find reviewed choices without exposing SQL, private text or file paths."""
    await mapped_native_actor(request, session, proof, 'townlight_meetings')
    await mapped_native_actor(request, session, proof, 'townlight_records')
    if not readiness():
        raise HTTPException(503, 'Meetings unavailable')
    store = PublicArchiveRepository(db_url=database_url())
    try:
        archives = store.public_calendar()
    finally:
        store.engine.dispose()
    rows = (await session.execute(select(RequestReleaseCopy, RequestDocument, Document)
        .join(RequestDocument, RequestDocument.id == RequestReleaseCopy.attachment_id)
        .join(Document, Document.id == RequestDocument.document_id)
        .where(RequestReleaseCopy.request_id == request_id)
        .order_by(RequestReleaseCopy.created_at.desc()).limit(100))).all()
    choices = []
    for copy, attachment, document in rows:
        source = (document.metadata_ or {}).get('station_source', {})
        for archive in archives:
            if archive.meeting_id != source.get('meeting_id'):
                continue
            try:
                choice = Selection(action='publish', approve_publication=True,
                    archive_id=archive.id, meeting_id=archive.meeting_id,
                    recording_id=source.get('recording_id'), request_id=request_id,
                    release_copy_id=copy.id, expected_release_sha256=copy.sha256)
                manifest, _ = await build_manifest(choice, request, session, proof)
            except (ValueError, KeyError, TypeError, OSError, httpx.HTTPError):
                continue
            # Choosing a record does not approve publication. The form requires
            # a separate confirmation on the authenticated POST boundary.
            selection = choice.model_dump(mode='json')
            selection['approve_publication'] = False
            choices.append({'title': manifest['title'], 'selection': selection})
    await session.commit()
    return {'selections': choices}
def max_release():
    value = int(os.environ.get('TOWNLIGHT_PORTAL_MAX_BYTES', str(8 * 1024**3)))
    if not 0 < value <= 64 * 1024**3:
        raise ValueError('Invalid publication size limit')
    return value

class Selection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    action: Literal['publish', 'withdraw']
    approve_publication: StrictBool
    archive_id: UUID
    meeting_id: UUID
    recording_id: UUID
    request_id: UUID
    release_copy_id: UUID
    expected_release_sha256: str = Field(pattern='^[0-9a-f]{64}$')

async def build_manifest(data, request, session, proof):
    if not readiness():
        raise ValueError('Meetings unavailable')
    archive_store = PublicArchiveRepository(db_url=database_url())
    meeting_store = MeetingStore(db_url=database_url())
    try:
        archive = archive_store.public_detail(str(data.archive_id))
        meeting = meeting_store.get(str(data.meeting_id))
    finally:
        archive_store.engine.dispose()
        meeting_store.engine.dispose()
    if (not archive or archive.meeting_id != str(data.meeting_id) or not meeting
            or meeting.meeting_type in ('closed_session', 'executive') or not meeting.scheduled_start):
        raise ValueError('Meeting archive unavailable')
    req = await session.get(RecordsRequest, data.request_id)
    copy = await session.get(RequestReleaseCopy, data.release_copy_id)
    if not req or not copy or req.fulfilled_at is None or copy.request_id != req.id:
        raise ValueError('Release unavailable')
    require_current_approval(req)
    if not await session.scalar(select(RequestPublication.id).where(RequestPublication.request_id == req.id).limit(1)):
        raise ValueError('Request not fulfilled')
    artifacts = (await session.execute(select(RequestArtifact).where(
        RequestArtifact.request_id == req.id, RequestArtifact.completed_at.is_not(None),
        RequestArtifact.response_sha256 == text_hash(req.response_draft)))).scalars().all()
    for kind in ('response', 'release-package'):
        candidates = [a for a in artifacts if a.kind == kind and a.export_path]
        if kind == 'release-package':
            candidates = [a for a in candidates if copy.sha256 in a.content and a.created_at >= copy.created_at]
        if not candidates:
            raise ValueError('Current completed export unavailable')
        verify_export(request.app.state.desktop_profile_root, candidates[-1], candidates[-1].export_path)
    attachment = await session.get(RequestDocument, copy.attachment_id)
    evidence = await session.get(RequestFileEvidence, copy.attachment_id)
    if not attachment or attachment.request_id != req.id or not evidence or evidence.request_id != req.id:
        raise ValueError('Release attachment unavailable')
    document = await session.get(Document, attachment.document_id)
    latest = await session.scalar(select(RequestReleaseCopy.id).where(
        RequestReleaseCopy.attachment_id == copy.attachment_id).order_by(
        RequestReleaseCopy.position.desc(), RequestReleaseCopy.created_at.desc()).limit(1))
    if latest != copy.id or copy.status not in ('release-ready copy', 'redacted copy'):
        raise ValueError('Release copy superseded or not releasable')
    provenance = (document.metadata_ or {}).get('station_source', {}) if document else {}
    if (provenance.get('recording_id') != str(data.recording_id)
            or provenance.get('meeting_id') != str(data.meeting_id)):
        raise ValueError('Recording provenance mismatch')
    async with httpx.AsyncClient(base_url=station_url(), trust_env=False, follow_redirects=False, timeout=30) as client:
        response = await client.get(f'/v1/recordings/{data.recording_id}', headers={'X-Townlight-Session': proof})
        response.raise_for_status()
        recording = response.json()
    if (recording['id'] != str(data.recording_id) or recording['meeting_id'] != str(data.meeting_id)
            or recording['status'] != 'complete' or recording['details']['sha256'] != provenance.get('sha256')):
        raise ValueError('Station recording changed or incomplete')
    if copy.sha256 != data.expected_release_sha256 or not 0 < copy.size_bytes <= max_release():
        raise ValueError('Release changed or too large')
    path = verify_managed_file(request.app.state.desktop_profile_root, copy)
    with path.open('rb') as stream:
        header = stream.read(12)
    # The Station release workflow uses MP4; identify it by bytes, never a private filename.
    media_type = 'video/mp4' if len(header) >= 12 and header[4:8] == b'ftyp' else 'application/octet-stream'
    manifest = {'version': 1, 'action': 'publish', 'archive_id': str(data.archive_id),
        'meeting_id': str(data.meeting_id), 'recording_id': str(data.recording_id),
        'request_id': str(data.request_id), 'release_copy_id': str(data.release_copy_id),
        'original_sha256': provenance['sha256'],
        'title': archive.title, 'scheduled_start': meeting.scheduled_start.isoformat(),
        'agenda': archive.posted_agenda, 'packet': archive.posted_packet,
        'minutes': archive.approved_minutes, 'summary': archive.plain_language_summary or '',
        'release': {'path': 'release.bin', 'sha256': copy.sha256, 'size': copy.size_bytes, 'media_type': media_type}}
    return manifest, path

@router.post('/bundle')
async def bundle(data: Selection, request: Request,
                 proof: str | None = Header(default=None, alias='X-Townlight-Session'),
                 session: AsyncSession = Depends(get_async_session)):
    actor = await mapped_native_actor(request, session, proof, 'townlight_meetings')
    await mapped_native_actor(request, session, proof, 'townlight_records')
    if data.approve_publication is not True:
        raise HTTPException(422, 'Explicit publication approval is required')
    output_path = None
    try:
        if data.action == 'withdraw':
            manifest, path = {'version': 1, 'action': 'withdraw', 'archive_id': str(data.archive_id)}, None
        else:
            manifest, path = await build_manifest(data, request, session, proof)
        fd, name = tempfile.mkstemp(prefix='townlight-publication-', suffix='.zip')
        os.close(fd)
        output_path = Path(name)
        with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_STORED, allowZip64=True) as archive:
            archive.writestr('manifest.json', json.dumps(manifest, ensure_ascii=False, separators=(',', ':')))
            if path is not None:
                digest = hashlib.sha256()
                size = 0
                with path.open('rb') as source, archive.open('release.bin', 'w', force_zip64=True) as dest:
                    while chunk := source.read(1024 * 1024):
                        size += len(chunk)
                        if size > manifest['release']['size']:
                            raise ValueError('Release changed while exporting')
                        digest.update(chunk)
                        dest.write(chunk)
                if size != manifest['release']['size'] or digest.hexdigest() != manifest['release']['sha256']:
                    raise ValueError('Release changed while exporting')
        await write_audit_log(session=session, action='portal-publication-' + data.action,
            resource_type='public_meeting_record', resource_id=str(data.archive_id), user_id=actor.id,
            details={'meeting_id': str(data.meeting_id), 'release_copy_id': str(data.release_copy_id),
                     'release_sha256': data.expected_release_sha256}, commit=False)
        await session.commit()
    except (ValueError, KeyError, TypeError, OSError, httpx.HTTPError):
        await session.rollback()
        if output_path is not None:
            output_path.unlink(missing_ok=True)
        raise HTTPException(409, 'Publication sources unavailable or changed') from None
    except BaseException:
        if output_path is not None:
            output_path.unlink(missing_ok=True)
        raise
    return FileResponse(output_path, media_type='application/zip', headers={'Cache-Control': 'no-store'},
                        background=BackgroundTask(output_path.unlink, missing_ok=True))
