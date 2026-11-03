"""Actual PostgreSQL readiness must include the added durable support records."""
import os

import pytest
import sqlalchemy as sa

from townlight_runtime.services import _domain_database_status, _sync_database_url


@pytest.mark.parametrize('schema,table', [
    ('townlight_access', 'native_drafts'),
    ('townlight_notice', 'workflow_heads'),
    ('townlight_notice', 'workflow_events'),
    ('townlight_notice', 'workflow_proofs'),
    ('townlight_notice', 'workflow_archives'),
])
def test_missing_support_table_blocks_domain_readiness(monkeypatch, schema, table):
    url = os.environ.get('TOWNLIGHT_TEST_READINESS_DATABASE_URL')
    if not url:
        pytest.skip('Requires a migrated disposable PostgreSQL readiness test database')
    parsed = sa.engine.make_url(url)
    if parsed.database != 'townlight_readiness_test':
        raise RuntimeError('Refusing schema changes outside the named disposable readiness database')
    monkeypatch.setenv('DATABASE_URL', url)
    engine = sa.create_engine(_sync_database_url(url))
    assert _domain_database_status() == {'ok': True, 'reason': 'domain-schema-ready'}
    hidden = table + '_readiness_hidden'
    try:
        with engine.begin() as connection:
            connection.execute(sa.text(f'ALTER TABLE {schema}.{table} RENAME TO {hidden}'))
        assert _domain_database_status() == {'ok': False, 'reason': 'domain-schema-unavailable'}
    finally:
        with engine.begin() as connection:
            connection.execute(sa.text(f'ALTER TABLE {schema}.{hidden} RENAME TO {table}'))
        engine.dispose()
    assert _domain_database_status() == {'ok': True, 'reason': 'domain-schema-ready'}
