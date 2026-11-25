"""Export the current native composition's schema without lifespan, DB or network.

This is source documentation, never installed endpoint acceptance. Station's
separate unchanged service schema remains its own existing document.
"""
from __future__ import annotations

import argparse
import copy
import html
import json
import os
import secrets
from pathlib import Path
import socket
import sys
import tempfile
import tomllib
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
REPOS = ROOT.parent
SITE = REPOS / 'townlight.github.io'
SOURCES = [REPOS / name for name in ('core', 'meetings', 'ordinances', 'zone', 'plan', 'permit', 'inspect', 'access', 'notice')]
SOURCES += [REPOS / 'sunshine/backend', ROOT / 'desktop/runtime/python-services']
PREFIXES = {
    'meetings': ('/desktop/v1/meetings', '/public/meetings'),
    'code': ('/desktop/v1/code', '/public/code'),
    'zoning': ('/desktop/v1/zoning', '/public/zoning'),
    'planning': ('/desktop/v1/planning', '/public/planning'),
    'permitting': ('/desktop/v1/permitting',),
    'inspections': ('/desktop/v1/inspections',),
    'access': ('/desktop/v1/access',),
    'notice': ('/desktop/v1/notices', '/desktop/v1/notice'),
    'station': ('/desktop/v1/station', '/desktop/v1/meetings/station'),
    '311': ('/desktop/v1/service-requests',),
    'comms': ('/desktop/v1/communications',),
    'parks': ('/desktop/v1/parks',),
}

MODULE_ALIASES = {
    '311': ('311', 'service_requests', 'service-requests'),
    'comms': ('comms', 'communications'),
    'parks': ('parks',),
}


def read_runtime_version():
    with (ROOT / 'desktop/runtime/python-services/pyproject.toml').open('rb') as handle:
        version = tomllib.load(handle).get('project', {}).get('version')
    if not isinstance(version, str) or not version:
        raise ValueError('pyproject.toml project.version is required')
    return version


def reference(slug, schema, identity, site=SITE, candidate_version='1.10.0.1', runtime_version='0.4.0'):
    title = 'Townlight ' + slug.title() + ' API reference'
    esc = html.escape
    manual_slug = 'communications' if slug == 'comms' else slug
    schema_href = f'/api/candidate-1.10.0.1/{slug}-openapi.json'
    body = [f'<h1>{esc(title)}</h1>',
            f'<p>Prepared Windows {esc(candidate_version)} unpublished candidate, runtime {esc(runtime_version)}. Unpublished source schema; no installed acceptance is claimed.</p>',
            f'<p>{esc(identity)}. The HTTP host is {esc(schema["info"]["title"])} '
            f'{esc(schema["info"]["version"])}. Component package versions and the host API version are separate identities.</p>',
            '<p>Generated from the actual native inspections-preview composition without application lifespan, migrations or database/network access. It describes route and validation contracts; it does not establish endpoint behavior, individual authorization or installed acceptance. Standalone product applications have separate deployment boundaries.</p>',
            f'<p><a href="{schema_href}">Machine-readable OpenAPI schema</a> · <a href="/manuals/{manual_slug}.html">Operating manual and limits</a></p>',
            '<h2 id="operations">HTTP operations</h2>']
    for path, item in sorted(schema['paths'].items()):
        for method, operation in item.items():
            if method not in {'get', 'post', 'put', 'patch', 'delete', 'options', 'head'}:
                continue
            heading = f'{method.upper()} {path}'
            body += [f'<details><summary>{esc(heading)}</summary>',
                     '<pre>' + esc(json.dumps(operation, indent=2, ensure_ascii=False)) + '</pre></details>']
    body += ['<h2 id="schemas">Request and response data dictionary</h2>',
             '<p>Each schema includes the actual required fields, types, constraints and descriptions. References resolve against the machine-readable document.</p>']
    for name, value in sorted(schema.get('components', {}).get('schemas', {}).items()):
        body += [f'<details><summary>{esc(name)}</summary><pre>',
                 esc(json.dumps(value, indent=2, ensure_ascii=False)), '</pre></details>']
    if slug == 'station':
        body += ['<h2>Separate Station service</h2><p>The native operations above are the suite authority boundary. '
                 'Station runs its own service and database. Its unchanged 0.3.0 service contract is available in '
                 '<a href="/api/station-service-openapi.json">the separate Station service schema</a>. '
                 'Schema reuse does not establish the changed suite candidate’s installed handoff acceptance.</p>']
    css = (site / 'assets/site.css').read_text(encoding='utf-8')
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{esc(title)}</title><style>{css}\npre{{white-space:pre-wrap;overflow-wrap:anywhere}}'
            'summary{cursor:pointer;padding:.6rem;font-weight:600}details{margin:.5rem 0}</style></head>'
            '<body><a class="skip" href="#main">Skip to content</a><header><a class="brand" href="/index.html">Townlight</a>'
            '<nav aria-label="Main"><a href="/manuals/suite.html">Suite manual</a><a href="/versions.html">Versions and candidate</a>'
            '<a href="/reference/index.html">Technical reference</a></nav></header><main class="reading wrap" id="main">'
            + '\n'.join(body) + '</main><footer>Townlight · AGPL-3.0-only · Source schema evidence only</footer></body></html>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site-root', type=Path, default=SITE,
                        help='Documentation site root (default: existing townlight.github.io checkout)')
    site = parser.parse_args().site_root
    sys.path[:0] = [str(path) for path in SOURCES]
    os.environ.update(TESTING='1', TOWNLIGHT_PRODUCT_PROFILE='inspections-preview',
                      DATABASE_URL='postgresql+asyncpg://schema_export@127.0.0.1:9/schema_export',
                      JWT_SECRET=secrets.token_urlsafe(32), FIRST_ADMIN_PASSWORD=secrets.token_urlsafe(24),
                      ENCRYPTION_KEY='AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
                      JWT_SECRET_FILE='', FIRST_ADMIN_PASSWORD_FILE='')
    connections = []
    def refuse_connection(sock, address):
        connections.append(str(address))
        raise RuntimeError('Schema export attempted network/database access')
    original_connect = socket.socket.connect
    socket.socket.connect = refuse_connection
    try:
        with tempfile.TemporaryDirectory(prefix='tl-schema-') as profile, ExitStack() as stack:
            os.environ['TOWNLIGHT_PROFILE_ROOT'] = profile
            # Source documentation only: substitute the three startup migration-readiness
            # DB probes while constructing the schema. This is not endpoint or installed
            # acceptance; production startup still requires these unchanged readiness checks.
            stack.enter_context(patch('townlight_311.migrations.ready', return_value=True))
            stack.enter_context(patch('townlight_comms.migrations.ready', return_value=True))
            stack.enter_context(patch('townlight_parks.migrations.ready', return_value=True))
            # Schema-only docs app construction: substitute all three startup repository
            # objects (Parks, Communications, Service Requests) solely for schema extraction.
            # The objects are irrelevant to OpenAPI and are not app or acceptance evidence.
            stack.enter_context(patch('townlight_parks.workflow.ParksRepository', MagicMock()))
            stack.enter_context(patch('townlight_comms.workflow.CommunicationsRepository', MagicMock()))
            stack.enter_context(patch('townlight_311.workflow.ServiceRequestRepository', MagicMock()))
            from townlight_runtime.services import create_runtime_app
            outer = create_runtime_app(domain_enabled=True)
            from starlette.routing import Mount
            domain = next(route.app for route in outer.routes
                          if isinstance(route, Mount) and route.path in ('', '/'))
            schema = domain.openapi()
        if connections:
            raise RuntimeError('Schema export attempted external access: ' + ', '.join(connections))
    finally:
        socket.socket.connect = original_connect
    state = json.loads((ROOT / 'config/suite-state.json').read_text(encoding='utf-8'))
    # Preserve the existing Core/Records view membership, then include actual
    # new product routes by prefix. Removed routes are never copied from history.
    membership = {}
    for slug in ('core', 'records'):
        path = site / f'api/{slug}-openapi.json'
        if path.is_file():
            membership[slug] = set(json.loads(path.read_text(encoding='utf-8'))['paths'])
    membership['station'] = {'/desktop/v1/requests/{request_id}/station-recordings'}
    candidate_version = '1.10.0.1'
    runtime_version = read_runtime_version()
    output_dir = site / 'api' / 'candidate-1.10.0.1'
    output_dir.mkdir(parents=True, exist_ok=True)
    for slug in ['suite', 'core', 'records', *PREFIXES]:
        document = copy.deepcopy(schema)
        if slug != 'suite':
            selected = membership.get(slug, set())
            document['paths'] = {path: item for path, item in schema['paths'].items()
                                 if path in selected or any(path.startswith(prefix) for prefix in PREFIXES.get(slug, ()))}
        if not document['paths']:
            raise ValueError('No actual composed API routes for ' + slug)
        if slug == 'suite':
            identity = (f'Windows {candidate_version} unpublished candidate; '
                        f'townlight-runtime {runtime_version}')
        else:
            modules = state.get('modules', {})
            module = next((modules.get(key) for key in MODULE_ALIASES.get(slug, (slug,))
                           if modules.get(key)), None)
            if module:
                version = next((value for value in module.get('versions', {}).values()
                                if isinstance(value, str)), '')
                identity = module.get('public_name', slug) + (' ' + version if version else '')
            else:
                identity = slug + ' source candidate (unpublished)'
        document['info']['description'] = 'Prepared source schema for the actual native composition; installed acceptance remains pending. Exported without lifespan, migrations or database/network access.'
        document['x-townlight-component'] = {'view': slug, 'identity': identity, 'evidence': 'source-schema-only'}
        json_path = output_dir / f'{slug}-openapi.json'
        html_path = output_dir / f'{slug}.html'
        json_path.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        html_path.write_text(reference(slug, document, identity, site, candidate_version, runtime_version), encoding='utf-8')
        print(slug, len(document['paths']), 'actual route paths')
    print('API reference prepared; network/database connections:', len(connections))


if __name__ == '__main__':
    main()
