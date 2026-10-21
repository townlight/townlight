"""Bounded local Code/Meetings handoff using their canonical SQL stores."""
import hashlib, json
from datetime import UTC, date, datetime
from uuid import NAMESPACE_URL, uuid4, uuid5

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from civicclerk.agenda_lifecycle import _build_persisted_audit_entry, _last_entry_hash, agenda_item_lifecycle_records as agendas
from civicclerk.meeting_lifecycle import meeting_records as meetings
from civiccode.section_lifecycle import SectionLifecycleStore, section_from_record, version_from_record, version_to_record, code_section_records as sections, section_version_records as versions
from civiccode.source_registry import source_registry_records as sources
from civiccode.ordinance_handoff import OrdinanceHandoffStore, event_to_record, ordinance_handoff_records as handoffs, ordinance_handoff_audit_event_records as handoff_audits
from civiccore.audit import ZERO_HASH


class ConnectionError(Exception):
    def __init__(self, status_code, message):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


metadata = sa.MetaData(schema="civiccode")
connections = sa.Table(
    "code_meeting_connections", metadata,
    sa.Column("id", sa.String(255), primary_key=True),
    sa.Column("payload", JSONB, nullable=False),
    sa.Column("state", JSONB, nullable=False),
)


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, default=str).encode("utf-8")).hexdigest()


def _norm_input(data):
    keys = ("id", "version_id", "meeting_id", "title", "ordinance_number", "proposed_text", "supersedes_id", "reconciliation_note")
    return {k: data.get(k) for k in keys}


def rowget(conn, id, lock=False):
    stmt = sa.select(connections).where(connections.c.id == str(id))
    if lock:
        stmt = stmt.with_for_update()
    row = conn.execute(stmt).mappings().first()
    if not row:
        raise ConnectionError(404, f"connection {id} not found")
    return row


def public(row):
    payload = row["payload"] or {}
    state = row["state"] or {}
    out = {"id": row["id"], "proposal": payload}
    out.update(state)
    out["code_link"] = "townlight://code/connections/" + str(row["id"])
    out["meeting_link"] = "townlight://meetings/" + str(payload.get("meeting_id"))
    out["agenda_item_link"] = "townlight://meetings/agenda-items/" + str(payload.get("agenda_item_id"))
    return out


def ensure_schema(engine):
    metadata.create_all(engine)


def list_connections(engine):
    with engine.connect() as conn:
        rows = conn.execute(sa.select(connections).order_by(connections.c.id)).mappings().all()
        return [public(r) for r in rows]


def get_connection(engine, id):
    with engine.connect() as conn:
        return public(rowget(conn, id))


def _snapshot(conn, data, actor):
    def need(stmt, label):
        row = conn.execute(stmt).mappings().first()
        if row is None:
            raise ConnectionError(404, 'missing ' + label)
        return row

    v = need(sa.select(versions).where(versions.c.version_id == data['version_id']), 'version')
    s = need(sa.select(sections).where(sections.c.section_id == v['section_id']), 'section')
    need(sa.select(meetings).where(meetings.c.id == data['meeting_id']), 'meeting')
    if data.get('supersedes_id'):
        rowget(conn, data['supersedes_id'])
        if not (data.get('reconciliation_note') or '').strip():
            raise ConnectionError(422, 'explain correction')
    return {
        **data,
        'input': dict(data),
        'actor': actor,
        'section_id': v['section_id'],
        'section_number': s['section_number'],
        'source_id': v['source_id'],
        'source_version_id': v['version_id'],
        'source_body': v['body'],
        'source_body_sha256': hashlib.sha256(v['body'].encode()).hexdigest(),
        'proposed_sha256': hashlib.sha256(data['proposed_text'].encode()).hexdigest(),
        'agenda_item_id': str(uuid5(NAMESPACE_URL, 'townlight-code-agenda:' + data['id'])),
        'event_id': 'proposal:' + data['id'],
    }


def _persist_proposal(conn, p, actor):
    now = datetime.now(UTC)
    audit = _build_persisted_audit_entry(
        previous_hash=ZERO_HASH,
        actor=actor,
        action="code_proposal_received",
        details={
            "actor": str(actor),
            "connection_id": p["id"],
            "source_version_id": p["source_version_id"],
            "proposed_sha256": p["proposed_sha256"],
        },
    )
    conn.execute(sa.insert(agendas).values(
        id=p["agenda_item_id"], meeting_id=p["meeting_id"], title=p["title"],
        department_name="Townlight Code", status="ON_AGENDA",
        audit_entries=[audit], created_at=now, updated_at=now,
    ))
    event = OrdinanceHandoffStore().create_event(dict(
        event_id=p["event_id"], external_event_id=p["event_id"],
        civicclerk_meeting_id=p["meeting_id"],
        civicclerk_agenda_item_id=p["agenda_item_id"],
        ordinance_number=p["ordinance_number"], title=p["title"], status="pending",
        affected_sections=[p["section_number"]],
        source_document_url="townlight://code/connections/" + str(p["id"]),
        source_document_hash=p["proposed_sha256"], ordinance_text=p["proposed_text"],
    ), actor=actor)
    conn.execute(sa.insert(handoffs).values(event_to_record(event)))
    conn.execute(sa.insert(handoff_audits).values(
        event_id=str(uuid4()), event_type="code_proposal_delivered", actor=actor,
        target_id=event.event_id, created_at=now,
    ))
    state = {"delivery_status": "delivered", "delivered_at": now.isoformat(),
             "decisions": [], "closeout": None}
    conn.execute(sa.insert(connections).values(id=p["id"], payload=p, state=state))
    return public(rowget(conn, p["id"]))


def send_proposal(engine, data, actor):
    d = _norm_input(data)
    with engine.begin() as conn:
        conn.execute(
            sa.text('SELECT pg_advisory_xact_lock(hashtextextended(:key,0))'),
            {'key': 'code-connection:' + d['id']},
        )
        old = conn.execute(
            sa.select(connections).where(connections.c.id == d['id'])
        ).mappings().first()
        if old:
            if old['payload']['input'] != d:
                raise ConnectionError(
                    409,
                    'Proposal key already used; inspect it and send correction '
                    'under a new id with supersedes_id and reconciliation_note.',
                )
            return public(old)
        return _persist_proposal(conn, _snapshot(conn, d, actor), actor)


def _decision_event(conn, p, d, actor):
    eid = 'decision:' + p['id'] + ':' + d['id']
    adopted = (d['outcome'] == 'adopted')
    e = OrdinanceHandoffStore().create_event({
        'event_id': eid,
        'external_event_id': eid,
        'civicclerk_meeting_id': p['meeting_id'],
        'civicclerk_agenda_item_id': p['agenda_item_id'],
        'ordinance_number': p['ordinance_number'],
        'title': p['title'],
        'status': 'adopted' if adopted else 'pending',
        'affected_sections': [p['section_number']],
        'source_document_url': 'townlight://meetings/' + p['meeting_id'],
        'source_document_hash': digest({'proposal_sha256': p['proposed_sha256'], 'decision': d}),
        'ordinance_text': p['proposed_text'],
        'adopted_at': datetime.fromisoformat(d['decided_at']) if adopted and d.get('decided_at') else None,
    }, actor=actor)
    conn.execute(sa.insert(handoffs).values(event_to_record(e)))
    conn.execute(sa.insert(handoff_audits).values(
        event_id=str(uuid4()), event_type='meeting_decision_received',
        actor=actor, target_id=eid, created_at=datetime.now(UTC),
    ))
    return eid


def record_decision(engine, id, d, actor):
    with engine.begin() as conn:
        row = rowget(conn, id, lock=True)
        p = row['payload']
        state = dict(row['state'])
        history = list(state['decisions'])
        for old in history:
            if old['input']['id'] == d['id']:
                if old['input'] != d:
                    raise ConnectionError(409, 'Decision key changed; use a new id and explain correction.')
                return public(row)
        if history:
            reconciliation_note = d.get('reconciliation_note')
            if not (
                d.get('supersedes_decision_id') == history[-1]['input']['id']
                and reconciliation_note is not None
                and str(reconciliation_note).strip()
            ):
                raise ConnectionError(409, 'Read latest decision and explicitly reconcile it.')
        eid = _decision_event(conn, p, d, actor)
        history.append({
            'input': d, 'actor': actor, 'recorded_at': datetime.now(UTC).isoformat(),
            'event_id': eid,
            'supporting_evidence_status': 'human_supplied_unverified' if d.get('supporting_references') else 'not_provided',
        })
        state['decisions'] = history
        state['current_decision_id'] = d['id']
        conn.execute(sa.update(connections).where(connections.c.id == id).values(state=state))
        agenda = conn.execute(sa.select(agendas).where(agendas.c.id == p['agenda_item_id']).with_for_update()).mappings().one()
        entries = list(agenda['audit_entries'])
        entries.append(_build_persisted_audit_entry(
            previous_hash=_last_entry_hash(entries), actor=actor, action='code_decision_recorded',
            details={'actor': actor, 'connection_id': id, 'decision_id': d['id'],
                     'outcome': d['outcome'], 'event_id': eid},
        ))
        conn.execute(sa.update(agendas).where(agendas.c.id == agenda['id']).values(audit_entries=entries, updated_at=datetime.now(UTC)))
        return public(rowget(conn, id))


def close_connection(engine, id, d, actor):
    with engine.begin() as conn:
        r = rowget(conn, id, lock=True)
        p = r['payload']
        state = dict(r['state'])
        now = datetime.now(UTC)
        if state.get('closeout'):
            if state['closeout'].get('input') == d:
                return public(r)
            raise ConnectionError(409, 'closeout is immutable; use linked correction')
        last = state['decisions'][-1] if state['decisions'] else None
        if not last or last['input']['id'] != d['decision_id'] or last['input']['outcome'] != 'adopted':
            raise ConnectionError(409, 'Read decision; explicitly record/correct adopted outcome before describing it as adopted law.')
        sectionrow = conn.execute(
            sa.select(sections).where(sections.c.section_id == p['section_id']).with_for_update()
        ).mappings().one()
        if conn.execute(sa.select(sources.c.source_id).where(sources.c.source_id == d['source_id'])).first() is None:
            raise ConnectionError(404, 'source not found')
        note = d.get('reconciliation_note')
        if d['body'] != p['proposed_text'] and not (note or '').strip():
            raise ConnectionError(422, 'Explain difference from proposal.')
        store = SectionLifecycleStore()
        store._sections[p['section_id']] = section_from_record(sectionrow)
        for vr in conn.execute(
            sa.select(versions).where(versions.c.section_id == p['section_id']).with_for_update()
        ).mappings().all():
            store._versions[vr['version_id']] = version_from_record(vr)
        v = store.create_version({
            'version_id': d['version_id'], 'section_id': p['section_id'],
            'source_id': d['source_id'], 'version_label': d['version_label'], 'body': d['body'],
            'effective_start': date.fromisoformat(d['effective_start']),
            'effective_end': date.fromisoformat(d['effective_end']) if d.get('effective_end') else None,
            'status': 'adopted', 'is_current': d['is_current'],
            'adoption_event_id': last['event_id'], 'prior_version_id': p['source_version_id'],
            'amendment_summary': d.get('reconciliation_note'),
        })
        if v.is_current:
            conn.execute(sa.update(versions).where(versions.c.section_id == p['section_id']).where(versions.c.version_id != v.version_id).values(is_current=False))
        conn.execute(sa.insert(versions).values(**version_to_record(v)))
        conn.execute(sa.update(handoffs).where(handoffs.c.event_id == last['event_id']).values(
            resolved_by=actor, resolved_at=now, resolved_section_version_id=v.version_id, status='codified',
        ))
        state['closeout'] = {
            'input': d, 'actor': actor, 'codified_at': now.isoformat(),
            'version_id': v.version_id, 'event_id': last['event_id'],
        }
        conn.execute(sa.update(connections).where(connections.c.id == id).values(state=state))
        conn.execute(sa.insert(handoff_audits).values(
            event_id=str(uuid4()), event_type='code_codification_recorded',
            actor=actor, target_id=last['event_id'], created_at=now,
        ))
        return public(rowget(conn, id))
