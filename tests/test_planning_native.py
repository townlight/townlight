"""Native Planning identity transport against real append-only repositories.

SQL account lookup is an isolated fixture; native proof validation, permissions,
Planning writes, reviewer attribution, immutable bytes and audits are real.
The installed PostgreSQL/native-window journey is a separate acceptance check.
"""
import hashlib
import hmac
import json
import sys
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'desktop/runtime/python-services'))


@pytest.fixture
def native_planning(tmp_path, monkeypatch):
    from fastapi import FastAPI, Request
    from fastapi.testclient import TestClient
    from app.database import get_async_session
    from app.models.user import UserRole
    from civicplan.migrations import source_engine, upgrade
    from civicsuite_runtime import planning_bridge as bridge, services

    url = f'sqlite:///{tmp_path / "planning.db"}'
    engine = source_engine(url)
    upgrade(engine)
    monkeypatch.setenv('DATABASE_URL', url)
    monkeypatch.setattr(bridge, 'source_engine', lambda _: source_engine(url))
    monkeypatch.setattr(services, '_planning_database_status', lambda: {'ok': True})
    monkeypatch.setattr('app.auth.desktop_session.time.time', lambda: 1792620000)
    profile = tmp_path / 'profile'
    config = profile / 'config'
    config.mkdir(parents=True)
    (profile / 'session-mac-secret.key').write_text(bytes(range(32)).hex())
    users = [dict(email=f'{name}@example.invalid', role='city-staff', active=True,
                  display_name=name, passcode_hash=f'fixture-verifier-{name}') for name in ('alpha', 'beta')]
    (config / 'first-admin.json').write_text(json.dumps(dict(email='admin@example.invalid')))
    identities = {u['email']: SimpleNamespace(id=uuid4(), email=u['email'], role=UserRole.STAFF,
                  is_active=True, must_change_password=False) for u in users}

    def sign_in(index=0, role='city-staff', expiry=4102444800):
        users[index]['role'] = role
        (config / 'staff-users.json').write_text(json.dumps(users))
        user = users[index]
        message = f"{user['email']}\n{role}\n{expiry}\n{user['passcode_hash']}"
        proof = hmac.new(bytes(range(32)), message.encode(), hashlib.sha256).hexdigest()
        (config / 'local-session.json').write_text(json.dumps({**user, 'expires_at_unix_seconds': expiry, 'session_hash': proof}))
        return {'X-Townlight-Session': proof}

    async def session(request: Request):
        email = json.loads((config / 'local-session.json').read_text())['email'] if (config / 'local-session.json').exists() else users[0]['email']
        async def execute(_):
            return SimpleNamespace(scalar_one_or_none=lambda: identities[email])
        async def commit():
            pass
        yield SimpleNamespace(execute=execute, commit=commit)

    app = FastAPI()
    app.state.desktop_profile_root = profile
    app.state.desktop_enabled_modules = {'civicplan', 'civicrecords-ai', 'civicclerk', 'civiccode', 'civiczone', 'civicaccess'}
    app.state.desktop_domain_enabled = True
    app.state.planning_providers = {'meetings': lambda **_: [], 'zoning': lambda **_: []}
    app.state.planning_access_rewrite = lambda text: {'advice': 'Fixture advice'}
    app.include_router(bridge.router)
    app.include_router(bridge.public_router)
    app.dependency_overrides[get_async_session] = session
    sign_in()
    with TestClient(app) as client:
        yield client, app, engine, sign_in, users, identities, config
    engine.dispose()


def bundle():
    import base64
    text = 'Fictional adopted housing policy. Preserve accessible housing.'
    return dict(plan_id='fictional-native', title='Fictional native plan', jurisdiction='Fictional',
                plan_type='comprehensive', status='adopted', visibility='public', dataset_kind='municipal',
                source_date='2026-01-01', adopted_on='2026-01-01', effective_on='2026-01-01',
                change_note='Synthetic native acceptance', reviewer_label='forged-client-label',
                documents=[dict(document_id='original', filename='fictional.txt', media_type='text/plain',
                    sha256=hashlib.sha256(text.encode()).hexdigest(), content_base64=base64.b64encode(text.encode()).decode())],
                policies=[dict(policy_id='H1', document_id='original', goal='Housing', objective='Access',
                    topic_key='housing', title='Accessible housing', citation='Fictional native plan H1',
                    anchor='paragraph 1', excerpt=text, relevance='Fictional housing policy context', staff_verified=True)],
                adoption_evidence=[dict(document_id='original', kind='manual-record', reference='Fictional resolution 1', note='Fictional adoption evidence')])


def test_native_actors_review_preview_and_public_boundaries(native_planning):
    from civicplan.source_store import PlanSourceRepository
    from civicplan.workflow_store import WorkflowRepository
    from civicplan.workflow_schema import versions
    import sqlalchemy as sa
    client, app, engine, sign_in, _, identities, _ = native_planning
    headers = sign_in()
    imported = client.post('/desktop/v1/planning/imports', json={'bundle': bundle()}, headers=headers)
    assert imported.status_code == 200, imported.text
    revision = imported.json()['revision_id']
    assert PlanSourceRepository(engine).revision(revision, staff=True)['reviewer_label'] == str(identities['alpha@example.invalid'].id)
    payload = dict(project_name='Fictional native analysis', proposal='Private proposal', staff_notes='PRIVATE NOTES',
                   selected_policies=[dict(plan_id='fictional-native', revision_id=revision, policy_id='H1')])
    saved = client.post('/desktop/v1/planning/analyses', json=payload, headers=headers)
    assert saved.status_code == 200, saved.text
    first = saved.json()
    payload.update(expected_previous_revision=first['revision_id'], audience='public', review_state='reviewed',
                   reviewer_label='impersonated reviewer', reviewed_on='2020-01-01', review_notes='Verified applicability',
                   analysis_text='Staff analysis', public_summary='Reviewed public explanation')
    headers = sign_in(1)
    reviewed = client.post(f"/desktop/v1/planning/analyses/{first['analysis_id']}/revisions", json=payload, headers=headers)
    assert reviewed.status_code == 200, reviewed.text
    workflow = WorkflowRepository(PlanSourceRepository(engine))
    record = workflow.get(first['analysis_id'])
    assert record['payload']['reviewer_label'] == str(identities['beta@example.invalid'].id)
    with engine.connect() as conn:
        assert set(conn.execute(sa.select(versions.c.actor_id)).scalars()) == {str(u.id) for u in identities.values()}
    stale = client.post(f"/desktop/v1/planning/analyses/{first['analysis_id']}/revisions", json={**payload, 'analysis_text':'Stale edit'}, headers=headers)
    assert stale.status_code == 409
    snapshot = dict(expected_revision=reviewed.json()['revision_id'], visibility='public')
    path = f"/desktop/v1/planning/analyses/{first['analysis_id']}"
    preview = client.post(path + '/snapshot-preview', json=snapshot, headers=headers)
    assert preview.status_code == 200, preview.text
    assert workflow.audit(first['analysis_id'])['count'] == 2
    created = client.post(path + '/snapshots', json=snapshot, headers=headers)
    assert created.status_code == 200, created.text
    assert created.json()['sha256'] == preview.json()['sha256']
    public = client.get('/civicplan/snapshots')
    assert public.status_code == 200 and len(public.json()['items']) == 1
    assert 'PRIVATE NOTES' not in public.text and 'Private proposal' not in public.text
    assert client.get('/civicplan/analyses').status_code == 404
    assert client.post('/civicplan/imports', json={'bundle':bundle()}).status_code == 404
    assert workflow.audit(first['analysis_id'])['ok']


@pytest.mark.parametrize('case', ['missing', 'forged', 'expired', 'signed-out', 'disabled', 'records-only', 'module-disabled', 'domain-disabled', 'sql-disabled', 'service-key-spoof'])
def test_native_planning_denials_do_not_write(native_planning, case):
    from civicplan.source_store import PlanSourceRepository
    client, app, engine, sign_in, users, identities, config = native_planning
    headers = sign_in()
    if case == 'missing': headers = {}
    if case == 'forged': headers = {'X-Townlight-Session':'0' * 64}
    if case == 'expired': headers = sign_in(expiry=999)
    if case == 'signed-out': (config / 'local-session.json').unlink()
    if case == 'disabled':
        users[0]['active'] = False
        (config / 'staff-users.json').write_text(json.dumps(users))
    if case == 'records-only': headers = sign_in(role='records-staff')
    if case == 'module-disabled': app.state.desktop_enabled_modules = set()
    if case == 'domain-disabled': app.state.desktop_domain_enabled = False
    if case == 'sql-disabled': identities[users[0]['email']].is_active = False
    if case == 'service-key-spoof': headers = {'X-CivicPlan-Staff-Key':'service-key', 'X-CivicPlan-Role':'staff', 'X-Actor-Id':str(uuid4())}
    response = client.post('/desktop/v1/planning/imports', json={'bundle':bundle()}, headers=headers)
    assert response.status_code in {401, 403, 503}, response.text
    assert PlanSourceRepository(engine).inventory()['items'] == []


def test_planning_profile_is_opt_in_and_missing_schema_or_provider_blocks(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient
    from civicsuite_runtime import services
    for profile in ('records-beta', 'meetings-beta', 'city-core', 'zoning-beta'):
        assert 'civicplan' not in dict(services._required_module_imports(profile))
    monkeypatch.setenv('TOWNLIGHT_PRODUCT_PROFILE', 'planning-preview')
    monkeypatch.setenv('TOWNLIGHT_PROFILE_ROOT', str(tmp_path / 'profile'))
    assert dict(services._required_module_imports('planning-preview'))['civicplan'] == 'civicplan.workflow_store'
    monkeypatch.setattr(services, '_domain_database_status', lambda: {'ok':True,'reason':'ready'})
    monkeypatch.setattr('civicsuite_runtime.meetings_bridge.readiness', lambda: True)
    monkeypatch.setattr(services, '_code_database_status', lambda: {'ok':True})
    monkeypatch.setattr(services, '_zoning_database_status', lambda: {'ok':True})
    monkeypatch.setattr(services, '_planning_database_status', lambda: {'ok':False,'reason':'planning-schema-unavailable'})
    app = services.create_runtime_app(domain_enabled=True)
    with TestClient(app) as client:
        assert client.get('/ready').status_code == 503
        assert client.get('/civicplan/snapshots').status_code == 503
        monkeypatch.setattr(services, '_planning_database_status', lambda: {'ok':True,'reason':'planning-schema-ready'})
        assert client.get('/ready').status_code == 200
        domain = next(route.app for route in app.routes if getattr(route, 'path', None) == '')
        domain.state.planning_providers = {}
        assert client.get('/ready').status_code == 503
