"""Bind unchanged accepted runtime inputs to the new umbrella build identity."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def bind(repo, payload, accepted):
    if accepted != '7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3':
        raise ValueError('Unexpected accepted runtime identity')
    pins_path = repo / 'config/inspections-preview-sources.json'
    pins = read(pins_path)['sources']
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, encoding='utf-8').strip()
    runtime_tree = subprocess.check_output(['git', 'rev-parse', 'HEAD:desktop/runtime/python-services'], cwd=repo, encoding='utf-8').strip()
    if runtime_tree != 'fa8a6598dea8ba5ab85201661ead5a69fc055b4a':
        raise ValueError('Suite runtime source changed; do not reuse accepted runtime')
    if read(repo / 'config/inspections-msi-candidate.json')['desktop_version'] != '1.7.2-1':
        raise ValueError('Accepted runtime reuse is scoped to Windows1.7.2.1')
    lock = read(payload / 'runtime-payload-lock.json')
    # Verify previously required bytes before changing metadata.
    for item in lock['payloads']:
        for entry in item['required_files']:
            path = payload / item['source_dir'] / entry['path']
            if path.stat().st_size != entry['size_bytes'] or digest(path) != entry['sha256']:
                raise ValueError(f'Accepted runtime file differs: {path}')
    native = {p.relative_to(payload).as_posix(): digest(p)
              for p in payload.rglob('*') if p.is_file() and p.suffix.lower() in ('.exe', '.dll', '.pyd')}
    for profile in ('planning', 'permitting', 'inspections'):
        path = payload / 'python' / f'{profile}-candidate-provenance.json'
        proof = read(path)
        original = {row['repository']: row['source_commit'] for row in proof['sources']}
        if original != pins or proof['build_profile'] != 'inspections-preview':
            raise ValueError('Accepted sources differ; do not reuse runtime for changed components')
        proof['umbrella_source_commit'] = source
        proof['contract_sha256'] = digest(repo / 'config/inspections-msi-candidate.json')
        proof['sources_manifest_sha256'] = digest(pins_path)
        proof['accepted_runtime_msi_sha256'] = accepted
        write(path, proof)
    for item in lock['payloads']:
        for entry in item['required_files']:
            path = payload / item['source_dir'] / entry['path']
            entry['size_bytes'] = path.stat().st_size
            entry['sha256'] = digest(path)
    lock['umbrella_source_commit'] = source
    lock['accepted_runtime_msi_sha256'] = accepted
    lock['payload_root'] = str(payload)
    write(payload / 'runtime-payload-lock.json', lock)
    write(payload / 'accepted-runtime-reuse.json', dict(
        schema_version=1, umbrella_source_commit=source, accepted_msi_sha256=accepted,
        accepted_source_commit='919f2492cf43a83e693db71fe1371001e529cf40',
        sources=pins, preserved_native_sha256=native,
        changed_files=['runtime-payload-lock.json'] + [f'python/{p}-candidate-provenance.json' for p in ('planning', 'permitting', 'inspections')],
        assembly='Exact accepted runtime; only umbrella provenance and lock hashes refreshed. No pip install or native rebuild.'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--repo', type=Path, required=True)
    parser.add_argument('--payload', type=Path, required=True)
    parser.add_argument('--accepted-msi-sha256', required=True)
    args = parser.parse_args()
    bind(args.repo, args.payload, args.accepted_msi_sha256)
