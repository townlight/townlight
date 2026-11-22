"""Render and retain exact audience-specific versions of a saved Meetings packet."""

import base64
import hashlib
import json
import shutil
import tempfile
import threading
from datetime import UTC, datetime
from html import escape
from pathlib import Path
from uuid import uuid4

from townlight_meetings.desktop_delivery import data_root, verify_source


FILES = ('agenda.html', 'packet.pdf')
_approval_lock = threading.Lock()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def store_path(profile, packet_id, state, artifact_id):
    return data_root(profile) / 'exports' / 'meetings' / 'council-packets' / packet_id / state / artifact_id


def upload_root(profile, meeting_id, actor):
    return data_root(profile) / 'files' / 'meetings' / 'council-sources' / meeting_id / actor


def upload_source(profile, meeting_id, actor, name, content, size_limit):
    if (not 0 < len(content) <= size_limit or Path(name).suffix.casefold() not in ('.pdf', '.txt') or
        any(char in name for char in ('/', '\\', ':')) or any(ord(char) < 32 for char in name)):
        raise ValueError('Choose a PDF or UTF-8 text attachment up to 8 MiB.')
    upload_id = str(uuid4())
    root = upload_root(profile, meeting_id, actor)
    root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=root) as temporary:
        output = Path(temporary) / 'files'
        output.mkdir()
        (output / ('source' + Path(name).suffix.casefold())).write_bytes(content)
        (output / 'receipt.json').write_bytes(canonical({'file_name': name,
            'sha256': hashlib.sha256(content).hexdigest(), 'size_bytes': len(content)}))
        output.rename(root / upload_id)
    return {'upload_id': upload_id}


def read_upload(profile, meeting_id, actor, upload_id, access):
    directory = upload_root(profile, meeting_id, actor) / upload_id
    if not directory.is_dir():
        raise ValueError('This attachment upload is unavailable for the selected meeting and staff account.')
    receipt = json.loads((directory / 'receipt.json').read_bytes())
    stored = directory / ('source' + Path(receipt['file_name']).suffix.casefold())
    return {**receipt, 'original_path': '', 'stored_path': str(stored), 'packet_access': access}


def packet_contents(profile, packet, meeting, audience, agenda_ids=(), source_indexes=()):
    if audience == 'public' and meeting['meeting_type'] in ('closed_session', 'executive'):
        raise ValueError('A closed or executive meeting cannot produce a public council packet.')
    agenda = {item['id']: item for item in packet.snapshot_content}
    for item_id in packet.agenda_item_ids:
        if item_id not in agenda or str(agenda[item_id].get('meeting_id')) != str(packet.meeting_id):
            raise ValueError('An agenda item no longer belongs to this saved meeting snapshot.')
    if audience == 'public':
        if (not agenda_ids or len(agenda_ids) != len(set(agenda_ids)) or any(
            agenda.get(item_id, {}).get('packet_access') != 'public_candidate' for item_id in agenda_ids
        )):
            raise ValueError('Select agenda items explicitly designated for public review in this saved revision.')
        if len(set(source_indexes)) != len(source_indexes) or any(
            index < 0 or index >= len(packet.source_references) or
            packet.source_references[index].get('packet_access') != 'public_candidate'
            for index in source_indexes
        ):
            raise ValueError('Choose attachments marked as public release copies in this saved packet.')
    elif agenda_ids or source_indexes:
        raise ValueError('Selection is only needed for a public packet.')
    if audience == 'staff':
        agenda_ids = packet.agenda_item_ids
        source_indexes = range(len(packet.source_references))
    agenda_ids = [item_id for item_id in packet.agenda_item_ids if item_id in agenda_ids]
    source_indexes = [index for index in range(len(packet.source_references)) if index in source_indexes]
    titles = [agenda[item_id]['title'] for item_id in agenda_ids]
    sources = [(packet.source_references[index], verify_source(profile, packet.source_references[index]))
               for index in source_indexes]
    # Include the original selection and approved-copy hashes, never the local paths.
    if not meeting.get('scheduled_start'):
        raise ValueError('Save the meeting date and time before preparing a council packet.')
    if meeting['title'] != packet.title:
        raise ValueError('The meeting title changed. Save a new packet revision.')
    content = {'audience': audience, 'packet_id': str(packet.id), 'packet_version': packet.packet_version,
               'meeting_id': str(packet.meeting_id), 'title': packet.title,
               'scheduled_start': meeting['scheduled_start'], 'location': meeting.get('location') or '',
               'agenda_item_ids': agenda_ids, 'source_indexes': source_indexes,
               'agenda': '\n'.join(f'{i}. {title}' for i, title in enumerate(titles, 1)),
               'sources': [{key: record[key] for key in ('file_name', 'sha256', 'size_bytes')} for record, _ in sources]}
    return content, titles, sources


def render_agenda(path, content, titles, index):
    title = escape(content['title'])
    entries = ''.join(f'<li>{escape(text)} (page {page})</li>' for text, page in index)
    items = ''.join(f'<li>{escape(text)}</li>' for text in titles)
    path.write_text(
        f'<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>{title}</title></head>'
        f'<body><main><h1>{title}</h1><p><time datetime="{escape(content["scheduled_start"])}">'
        f'{escape(content["scheduled_start"])}</time> · {escape(content["location"])}</p>'
        '<h2>Agenda</h2><ol>' + items + '</ol><h2>Packet contents</h2><ul>' + entries +
        '</ul><p><a href="packet.pdf">Download the printable packet PDF</a></p>'
        '</main></body></html>\n', encoding='utf-8', newline='\n')


def render_pdf(path, content, titles, sources):
    import pymupdf as pdf

    def text_page(doc, heading, blocks):
        page = doc.new_page(width=612, height=792)
        text = f'<h1>{escape(heading)}</h1>' + ''.join(f'<p>{escape(block)}</p>' for block in blocks)
        page.insert_htmlbox(pdf.Rect(48, 42, 564, 745), text,
                            css='body {font: 12pt sans-serif;} h1 {font-size: 20pt;} p{white-space:pre-wrap;}')
        return page.number + 1

    index_size = 18
    labels = [record['file_name'] for record, _ in sources]
    index = []
    with pdf.open() as doc:
        index_pages = max(1, (len(labels) + index_size) // index_size)
        # Reserve index pages so page references stay consistent in both versions.
        for _ in range(index_pages):
            doc.new_page(width=612, height=792)
        page = len(doc) + 1
        index.append(('Agenda', page))
        numbered = [f'{i}. {title}' for i, title in enumerate(titles, 1)]
        for offset in range(0, len(numbered), 10):
            text_page(doc, 'Agenda', numbered[offset:offset + 10])
        for record, source in sources:
            label = record['file_name']
            if record['size_bytes'] > 128 * 1024 * 1024:
                raise ValueError(f'Cannot render {label}: one attachment can be at most 128 MiB.')
            index.append((label, len(doc) + 1))
            if Path(label).suffix.casefold() == '.pdf':
                try:
                    with pdf.open(source, filetype='pdf') as attachment:
                        if not attachment.is_pdf or attachment.needs_pass or not attachment.page_count or attachment.is_repaired:
                            raise ValueError('Replace encrypted, damaged or empty PDFs with a readable PDF.')
                        if len(doc) + attachment.page_count > 1000:
                            raise ValueError('Split the packet into revisions of at most 1,000 pages.')
                        for original in attachment:
                            page = doc.new_page(width=612, height=792)
                            area = pdf.Rect(36, 32, 576, 747)
                            if content['audience'] == 'public':
                                # Include the visible reviewed page only. Drop embedded data and hidden text.
                                scale = 1800 / max(original.rect.width, original.rect.height)
                                image = original.get_pixmap(matrix=pdf.Matrix(scale, scale), annots=True)
                                page.insert_image(area, pixmap=image)
                            elif original.get_contents():
                                page.show_pdf_page(area, attachment, original.number)
                except (RuntimeError, ValueError) as error:
                    raise ValueError(f'Cannot render {label}: {error}') from None
            elif Path(label).suffix.casefold() == '.txt':
                try:
                    raw = source.read_text(encoding='utf-8-sig')
                except UnicodeError:
                    raise ValueError(f'Cannot render {label}: save the document as UTF-8 text or PDF.') from None
                if not raw.strip():
                    raise ValueError(f'Cannot render {label}: the text document is empty.')
                from textwrap import wrap
                lines = [part for line in raw.splitlines() for part in (wrap(line, 88) or [''])]
                if len(doc) + (len(lines) + 31) // 32 > 1000:
                    raise ValueError('Split the packet into revisions of at most 1,000 pages.')
                for offset in range(0, len(lines), 32):
                    text_page(doc, label, ['\n'.join(lines[offset:offset + 32])])
            else:
                raise ValueError(f'Cannot render {label}: save the document as a PDF or UTF-8 text file.')
            if digest(source) != record['sha256']:
                raise ValueError(f'{label} changed during rendering. Save a new packet revision.')
        index_entries = [f'{label}  ·  page {page}' for label, page in index]
        for offset in range(index_pages):
            page = doc[offset]
            subtitle = content['title'] if offset == 0 else 'Packet contents (continued)'
            text = [content['scheduled_start'], content['location'], 'Council packet contents'] if offset == 0 else []
            text += index_entries[offset * index_size:(offset + 1) * index_size]
            html = f'<h1>{escape(subtitle)}</h1>' + ''.join(f'<p>{escape(line)}</p>' for line in text)
            page.insert_htmlbox(pdf.Rect(48, 38, 564, 745), html, css='body {font: 12pt sans-serif;} p {margin: 3pt 0;}')
        for number, page in enumerate(doc, 1):
            page.insert_text((48, 767), f'{number} / {len(doc)}', fontsize=10)
        doc.set_toc([[1, label, page] for label, page in index])
        doc.set_metadata({'title': content['title']})
        doc.save(path, garbage=4, deflate=True)
    return index


def gallery(path):
    return {name: {'sha256': digest(path / name), 'size_bytes': (path / name).stat().st_size} for name in FILES}


def read_manifest(directory, expected):
    content = (directory / 'manifest.json').read_bytes()
    if hashlib.sha256(content).hexdigest() != expected:
        raise ValueError('Council packet metadata changed. Read back the saved packet before continuing.')
    manifest = json.loads(content)
    if manifest['files'] != gallery(directory):
        raise ValueError('Council packet files no longer match their reviewed hashes.')
    return manifest


def preview(profile, packet, meeting, actor, audience, agenda_ids, source_indexes):
    content, titles, sources = packet_contents(profile, packet, meeting, audience, agenda_ids, source_indexes)
    preview_id = str(uuid4())
    directory = store_path(profile, str(packet.id), 'previews', preview_id)
    directory.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=directory.parent) as temporary:
        output = Path(temporary) / 'files'
        output.mkdir()
        index = render_pdf(output / 'packet.pdf', content, titles, sources)
        render_agenda(output / 'agenda.html', content, titles, index)
        manifest = {'schema_version': 1, 'preview_id': preview_id, 'prepared_by': actor,
                    'content_sha256': hashlib.sha256(canonical(content)).hexdigest(), **content,
                    'index': index, 'files': gallery(output)}
        document = canonical(manifest)
        (output / 'manifest.json').write_bytes(document)
        output.rename(directory)
    return {'preview_id': preview_id, 'manifest_sha256': hashlib.sha256(document).hexdigest(),
            'audience': audience, 'folder': str(directory)}


def approve(store, profile, packet, meeting, actor, preview_id, expected, public_confirmed):
    preview_directory = store_path(profile, str(packet.id), 'previews', preview_id)
    with _approval_lock:
        saved = store.get(str(packet.id))
        for receipt in saved.delivery_history:
            if (receipt.get('kind') == 'council-packet-approval' and receipt['approval_id'] == preview_id and
                receipt['actor'] == actor and receipt['preview_sha256'] == expected):
                directory = store_path(profile, str(packet.id), 'approved', preview_id)
                manifest = read_manifest(directory, receipt['manifest_sha256'])
                return {'approval_id': preview_id, 'manifest_sha256': receipt['manifest_sha256'],
                        'audience': manifest['audience'], 'folder': str(directory)}
        if not preview_directory.is_dir():
            raise ValueError('The council packet preview is unavailable. Create a new preview.')
        manifest = read_manifest(preview_directory, expected)
        if manifest['prepared_by'] != actor:
            raise ValueError('Preview the exact files in your own staff session before approving.')
        if manifest['audience'] == 'public' and not public_confirmed:
            raise ValueError('Confirm that you reviewed the selected public agenda and release-ready copies.')
        if saved.packet_version != store.list_for_meeting(str(packet.meeting_id))[-1].packet_version:
            raise ValueError('A newer packet revision exists. Review the new version before approving.')
        public = manifest['audience'] == 'public'
        current, _, _ = packet_contents(profile, packet, meeting, manifest['audience'],
                                        manifest['agenda_item_ids'] if public else (),
                                        manifest['source_indexes'] if public else ())
        if hashlib.sha256(canonical(current)).hexdigest() != manifest['content_sha256']:
            raise ValueError('The meeting or selected sources changed. Create and review a new preview.')
        approved_at = datetime.now(UTC).isoformat()
        manifest.update(approval_id=preview_id, approved_by=actor, approved_at=approved_at)
        document = canonical(manifest)
        approved = store_path(profile, str(packet.id), 'approved', preview_id)
        approved.parent.mkdir(parents=True, exist_ok=True)
        if approved.exists():
            raise ValueError('This approval was interrupted. Read back the packet before preparing another preview.')
        with tempfile.TemporaryDirectory(dir=approved.parent) as temporary:
            target = Path(temporary) / 'files'
            target.mkdir()
            for name in FILES:
                shutil.copyfile(preview_directory / name, target / name)
            if manifest['files'] != gallery(target):
                raise ValueError('The reviewed files changed during approval. Create and review a new preview.')
            (target / 'manifest.json').write_bytes(document)
            target.rename(approved)
        receipt = {'kind': 'council-packet-approval', 'approval_id': preview_id, 'actor': actor,
                   'audience': manifest['audience'], 'approved_at': approved_at,
                   'preview_sha256': expected, 'manifest_sha256': hashlib.sha256(document).hexdigest()}
        if store.record_delivery(record_id=str(packet.id), actor=actor, receipt=receipt) is None:
            raise ValueError('Approval was not recorded. Keep the staff preview and prepare another revision.')
        return {'approval_id': preview_id, 'manifest_sha256': receipt['manifest_sha256'],
                'audience': manifest['audience'], 'folder': str(approved)}


def approved_public_packet(profile, packet, approval_id=None):
    receipts = [receipt for receipt in packet.delivery_history
                if receipt.get('kind') == 'council-packet-approval' and receipt.get('audience') == 'public'
                and (approval_id is None or receipt['approval_id'] == str(approval_id))]
    if not receipts:
        raise ValueError('No approved public council packet is available for this revision.')
    receipt = receipts[-1]
    directory = store_path(profile, str(packet.id), 'approved', receipt['approval_id'])
    manifest = read_manifest(directory, receipt['manifest_sha256'])
    if manifest['audience'] != 'public' or manifest['meeting_id'] != str(packet.meeting_id):
        raise ValueError('The reviewed files do not belong to this public meeting.')
    return manifest, directory


def download_chunk(profile, packet, actor, artifact_id, expected, filename, offset, approved):
    directory = store_path(profile, str(packet.id), 'approved' if approved else 'previews', artifact_id)
    document = (directory / 'manifest.json').read_bytes()
    if hashlib.sha256(document).hexdigest() != expected:
        raise ValueError('The requested packet no longer matches the reviewed manifest.')
    manifest = json.loads(document)
    if approved:
        if not any(receipt.get('kind') == 'council-packet-approval' and receipt.get('approval_id') == artifact_id
                   and receipt.get('manifest_sha256') == expected for receipt in packet.delivery_history):
            raise ValueError('An approved council packet is unavailable.')
    elif manifest.get('prepared_by') != actor:
        raise ValueError('Create a preview in your own staff session to open its files.')
    metadata = manifest['files'][filename]
    if offset >= metadata['size_bytes'] or filename not in FILES:
        raise ValueError('The file offset is outside this council packet.')
    with (directory / filename).open('rb') as stream:
        stream.seek(offset)
        content = stream.read(min(4 * 1024 * 1024, metadata['size_bytes'] - offset))
    if not content:
        raise ValueError('The council packet file is incomplete.')
    return {**metadata, 'offset': offset, 'content_base64': base64.b64encode(content).decode('ascii')}
