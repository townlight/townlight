from dataclasses import dataclass, field, replace
import hashlib
from html.parser import HTMLParser
from uuid import uuid4

import pymupdf
import pytest

from townlight_runtime import council_packet


@dataclass
class Packet:
    id: str = field(default_factory=lambda: str(uuid4()))
    meeting_id: str = field(default_factory=lambda: str(uuid4()))
    title: str = 'City Council <agenda>'
    packet_version: int = 1
    agenda_item_ids: list = field(default_factory=list)
    snapshot_content: list = field(default_factory=list)
    source_references: list = field(default_factory=list)
    delivery_history: list = field(default_factory=list)


class Store:
    def __init__(self, packet):
        self.packet = packet
        self.versions = [packet]

    def get(self, record_id):
        assert record_id == self.packet.id
        return self.packet

    def list_for_meeting(self, meeting_id):
        assert meeting_id == self.packet.meeting_id
        return self.versions

    def record_delivery(self, *, record_id, actor, receipt):
        assert record_id == self.packet.id
        assert actor == receipt['actor']
        self.packet.delivery_history.append(receipt)
        return self.packet


class AgendaOutline(HTMLParser):
    def __init__(self):
        super().__init__()
        self.outline = []

    def handle_starttag(self, tag, attrs):
        if tag == 'html':
            assert dict(attrs)['lang'] == 'en'
        if tag in {'main', 'h1', 'h2', 'ol', 'ul', 'a'}:
            self.outline.append(tag)


@pytest.fixture
def meeting_packet(tmp_path):
    packet = Packet()
    for title, access in [('Road repairs', 'public_candidate'), ('Private settlement', 'staff_only'),
                          ('Acera pública', 'public_candidate')]:
        item_id = str(uuid4())
        packet.agenda_item_ids.append(item_id)
        packet.snapshot_content.append({'id': item_id, 'meeting_id': packet.meeting_id,
                                        'title': title, 'packet_access': access})
    sources = tmp_path / 'Data' / 'files' / 'meetings'
    sources.mkdir(parents=True)
    text = sources / 'maintenance.txt'
    text.write_text('Approved maintenance report', encoding='utf-8')
    private = sources / 'private-settlement.txt'
    private.write_text('Closed session settlement details', encoding='utf-8')
    pdf = sources / 'sidewalk.pdf'
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((40, 50), 'Approved sidewalk diagram')
        page.insert_text((40, 80), 'PRIVATE_HIDDEN_TEXT', render_mode=3)
        document.save(pdf)
    for path, access in [(text, 'public_candidate'), (private, 'staff_only'), (pdf, 'public_candidate')]:
        packet.source_references.append({'stored_path': str(path), 'file_name': path.name,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'size_bytes': path.stat().st_size,
            'packet_access': access})
    meeting = {'title': packet.title, 'location': 'Council Chamber & Annex', 'meeting_type': 'regular',
               'scheduled_start': '2026-11-23T18:00:00-07:00'}
    return tmp_path, packet, meeting, Store(packet)


def test_public_packet_is_selected_ordered_immutable_and_verified(meeting_packet):
    profile, packet, meeting, store = meeting_packet
    first, _, last = packet.agenda_item_ids
    review = council_packet.preview(profile, packet, meeting, 'staff', 'public', [last, first], [2, 0])
    with pytest.raises(ValueError, match='Confirm'):
        council_packet.approve(store, profile, packet, meeting, 'staff', review['preview_id'], review['manifest_sha256'], False)
    with pytest.raises(ValueError, match='own staff session'):
        council_packet.approve(store, profile, packet, meeting, 'other', review['preview_id'], review['manifest_sha256'], True)
    result = council_packet.approve(store, profile, packet, meeting, 'staff', review['preview_id'], review['manifest_sha256'], True)
    assert council_packet.approve(store, profile, packet, meeting, 'staff', review['preview_id'], review['manifest_sha256'], True) == result
    assert len(packet.delivery_history) == 1
    manifest, path = council_packet.approved_public_packet(profile, packet, result['approval_id'])
    assert manifest['agenda_item_ids'] == [first, last]
    assert manifest['source_indexes'] == [0, 2]
    assert manifest['approved_by'] == 'staff'
    assert manifest['index'] == [['Agenda', 2], ['maintenance.txt', 3], ['sidewalk.pdf', 4]]
    html = (path / 'agenda.html').read_text(encoding='utf-8')
    assert 'City Council &lt;agenda&gt;' in html
    assert 'Acera pública' in html
    assert 'Private' not in html and 'private' not in html
    parser = AgendaOutline()
    parser.feed(html)
    assert parser.outline == ['main', 'h1', 'h2', 'ol', 'h2', 'ul', 'a']
    with pymupdf.open(path / 'packet.pdf') as pdf:
        assert pdf.page_count == 4
        assert [row[2] for row in pdf.get_toc()] == [2, 3, 4]
        cover = pdf[0].get_text()
        assert cover.index('City Council') < cover.index('Council Chamber') < cover.index('Agenda') < cover.index('1 / 4')
        ordered = pdf[1].get_text()
        assert ordered.index('Agenda') < ordered.index('Road repairs') < ordered.index('Acera pública') < ordered.index('2 / 4')
        assert 'Approved maintenance report' in pdf[2].get_text()
        assert pdf[3].get_images() and 'PRIVATE_HIDDEN_TEXT' not in pdf[3].get_text()
    from base64 import b64decode
    chunk = council_packet.download_chunk(profile, packet, 'staff', result['approval_id'], result['manifest_sha256'], 'packet.pdf', 0, True)
    assert b64decode(chunk['content_base64']) == (path / 'packet.pdf').read_bytes()
    (path / 'agenda.html').write_text('changed')
    with pytest.raises(ValueError, match='reviewed hashes'):
        council_packet.approved_public_packet(profile, packet, result['approval_id'])


def test_closed_items_and_sources_cannot_be_promoted_in_preview(meeting_packet):
    profile, packet, meeting, _ = meeting_packet
    public, closed, _ = packet.agenda_item_ids
    with pytest.raises(ValueError, match='explicitly designated'):
        council_packet.preview(profile, packet, meeting, 'staff', 'public', [public, closed], [])
    with pytest.raises(ValueError, match='public release copies'):
        council_packet.preview(profile, packet, meeting, 'staff', 'public', [public], [1])
    meeting['meeting_type'] = 'closed_session'
    with pytest.raises(ValueError, match='closed or executive'):
        council_packet.preview(profile, packet, meeting, 'staff', 'public', [public], [0])


def test_changed_sources_newer_revision_and_damaged_document_fail_closed(meeting_packet):
    profile, packet, meeting, store = meeting_packet
    review = council_packet.preview(profile, packet, meeting, 'staff', 'staff', [], [])
    store.versions.append(replace(packet, packet_version=2))
    with pytest.raises(ValueError, match='newer packet revision'):
        council_packet.approve(store, profile, packet, meeting, 'staff', review['preview_id'], review['manifest_sha256'], False)
    store.versions.pop()
    broken = council_packet.upload_source(profile, packet.meeting_id, 'staff', 'broken.pdf', b'this is not a PDF', 1024)
    with pytest.raises(ValueError, match='selected meeting and staff account'):
        council_packet.read_upload(profile, packet.meeting_id, 'other', broken['upload_id'], 'staff_only')
    packet.source_references.append(council_packet.read_upload(profile, packet.meeting_id, 'staff', broken['upload_id'], 'staff_only'))
    with pytest.raises(ValueError, match='selected sources changed'):
        council_packet.approve(store, profile, packet, meeting, 'staff', review['preview_id'], review['manifest_sha256'], False)
    with pytest.raises(ValueError, match='Cannot render broken.pdf'):
        council_packet.preview(profile, packet, meeting, 'staff', 'staff', [], [])
    assert not packet.delivery_history
