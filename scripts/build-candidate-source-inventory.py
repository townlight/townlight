"""Inventory actual current owned source bytes; preserve the prior receipt.

Optional --source-companion records only a real built companion's digest.
Without it the documentation explicitly records that assembly is pending.
"""
from __future__ import annotations

import argparse
import ast
import hashlib
import html
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
REPOS = ROOT.parent
SITE = REPOS / 'townlight.github.io'
PACKAGES = {
    'core': ('core', 'townlight_core'), 'records': ('sunshine', 'backend/townlight_records'),
    'meetings': ('meetings', 'townlight_meetings'), 'code': ('ordinances', 'townlight_code'),
    'zoning': ('zone', 'townlight_zoning'), 'planning': ('plan', 'townlight_planning'),
    'permitting': ('permit', 'townlight_permitting'), 'inspections': ('inspect', 'townlight_inspections'),
    'access': ('access', 'townlight_access'), 'notice': ('notice', 'townlight_notice'),
    'station': ('station', 'beta-1/townlight_station'),
    'runtime': ('townlight', 'desktop/runtime/python-services/townlight_runtime'),
}


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def describe(repo, path):
    value = {'source': path.relative_to(repo).as_posix(), 'sha256': digest(path),
             'bytes': path.stat().st_size, 'routes': [], 'models': [], 'configuration': []}
    if path.suffix != '.py':
        return value
    tree = ast.parse(path.read_text(encoding='utf-8-sig'), filename=value['source'])
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for decorator in node.decorator_list:
                if (isinstance(decorator, ast.Call) and isinstance(decorator.func, ast.Attribute)
                    and decorator.func.attr in {'get', 'post', 'put', 'patch', 'delete', 'head', 'options'}
                    and decorator.args and isinstance(decorator.args[0], ast.Constant)
                    and isinstance(decorator.args[0].value, str)):
                    value['routes'].append({'method': decorator.func.attr.upper(),
                        'declared_path': decorator.args[0].value, 'function': node.name, 'line': node.lineno})
        elif isinstance(node, ast.ClassDef):
            fields = [{'name': child.target.id, 'type': ast.unparse(child.annotation), 'line': child.lineno}
                      for child in node.body if isinstance(child, ast.AnnAssign) and isinstance(child.target, ast.Name)]
            if fields:
                value['models'].append({'name': node.name, 'bases': [ast.unparse(base) for base in node.bases],
                                        'fields': fields, 'line': node.lineno})
        elif isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
            if (isinstance(node.func.value, ast.Attribute) and isinstance(node.func.value.value, ast.Name)
                and node.func.value.value.id == 'os' and node.func.value.attr == 'environ'
                and node.func.attr in {'get', 'setdefault'} and node.args
                and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                value['configuration'].append({'environment': node.args[0].value, 'line': node.lineno})
    return value


def preserve_original(repo, relative):
    original = subprocess.run(['git', 'show', 'HEAD:' + relative], cwd=repo, capture_output=True)
    if original.returncode:
        return
    destination = repo / 'docs/history/pre-naming-2026-11/source-inventory.json'
    if repo == SITE:
        destination = repo / 'history/pre-naming-2026-11/source-inventory.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        destination.write_bytes(original.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-companion', type=Path)
    args = parser.parse_args()
    source_hash = digest(args.source_companion.resolve(strict=True)) if args.source_companion else None
    inventory = {'source_companion_sha256': source_hash, 'source_companion_pending': source_hash is None,
        'basis': 'Actual current candidate source bytes. Source AST declarations do not establish router mounting, authorization, installed behavior or delivery. Use the composed OpenAPI reference and exact candidate acceptance separately.',
        'products': {}}
    for slug, (repository, package) in PACKAGES.items():
        repo = REPOS / repository
        files = sorted(path for path in (repo / package).rglob('*') if path.is_file()
                       and '__pycache__' not in path.parts and path.suffix in {'.py', '.json', '.ini', '.sql', '.yaml', '.yml', '.md', '.txt', '.html', '.css', '.js'})
        if slug == 'runtime':
            for folder, suffixes in [('desktop/src-tauri/src', {'.rs'}), ('desktop/src', {'.js', '.mjs', '.css', '.html', '.ts'})]:
                files += sorted(path for path in (repo / folder).rglob('*') if path.is_file() and path.suffix in suffixes)
        head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
        dirty = bool(subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=repo))
        inventory['products'][slug] = {'repository': 'townlight/' + repository, 'repository_head': head,
            'working_tree_modified': dirty, 'principal_import': 'townlight_' + slug if slug != 'runtime' else 'townlight_runtime',
            'source': [describe(repo, path) for path in files]}
    preserve_original(SITE, 'reference/source-inventory.json')
    destinations = [SITE / 'reference']
    for name in [value[0] for value in PACKAGES.values()]:
        repo = REPOS / name
        destination = repo / 'docs/beta-1/reference'
        if destination.is_dir() and destination not in destinations:
            preserve_original(repo, 'docs/beta-1/reference/source-inventory.json')
            destinations.append(destination)
    text = json.dumps(inventory, indent=2, ensure_ascii=False) + '\n'
    rows = ''.join(f'<tr><td>Townlight {html.escape(slug.title())}</td><td><a href="../api/{slug if slug != "runtime" else "suite"}.html">API reference</a></td><td>{len(product["source"])} source files</td></tr>'
                   for slug, product in inventory['products'].items())
    page = ('<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Townlight candidate technical reference</title><link rel="stylesheet" href="../assets/site.css"></head><body>'
            '<a class="skip" href="#main">Skip to content</a><header><a class="brand" href="../index.html">Townlight</a></header>'
            '<main id="main" class="reading wrap"><h1>Current candidate technical reference</h1>'
            '<p>Prepared November 2, 2026. Build, signing, exact installed acceptance and publication remain pending.</p>'
            '<p>The API pages describe the actual native composition; standalone applications and the separate Station service have their documented boundaries.</p>'
            '<p><a href="../api/suite.html">Complete native domain API</a> · <a href="source-inventory.json">Current source inventory and SHA-256 values</a> · '
            '<a href="../versions.html">Component versions</a></p><table><thead><tr><th>Product</th><th>Contract</th><th>Inventory</th></tr></thead><tbody>'
            + rows + '</tbody></table><p>AST route declarations alone do not prove mounting or runtime behavior. '
            'The inventory marks source companion assembly as pending until an actual built companion is supplied; it makes no signed-installer claim.</p>'
            '</main><footer>Townlight · AGPL-3.0-only</footer></body></html>')
    for destination in destinations:
        (destination / 'source-inventory.json').write_text(text, encoding='utf-8')
        (destination / 'index.html').write_text(page, encoding='utf-8')
    count = sum(len(product['source']) for product in inventory['products'].values())
    print(f'Inventoried {count} actual owned source files across {len(PACKAGES)} packages; {len(destinations)} current documentation copies.')
    print('Source companion pending:', source_hash is None)


if __name__ == '__main__':
    main()
