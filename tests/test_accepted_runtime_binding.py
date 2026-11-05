"""The name-only release must preserve native inputs and reject stale sources."""
import hashlib
import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('runtime_binding', ROOT / 'desktop/scripts/bind-accepted-runtime.py')
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)
ACCEPTED = '7553bb3ca457360a99878953f86d54211d77a250129a6744d9d637a2fb4be9e3'


@pytest.fixture
def cohort(tmp_path, monkeypatch):
    repo, payload = tmp_path / 'repo', tmp_path / 'payload'
    (repo / 'config').mkdir(parents=True)
    (payload / 'python').mkdir(parents=True)
    binding.write(repo / 'config/inspections-preview-sources.json', {'sources': {'townlight/core': 'a' * 40}})
    binding.write(repo / 'config/inspections-msi-candidate.json', {'desktop_version': '1.7.2-1'})
    native = payload / 'python/python.exe'
    native.write_bytes(b'synthetic native fixture; never executed')
    for profile in ('planning', 'permitting', 'inspections'):
        binding.write(payload / 'python' / f'{profile}-candidate-provenance.json', {
            'profile': profile + '-preview', 'build_profile': 'inspections-preview',
            'sources': [{'repository': 'townlight/core', 'source_commit': 'a' * 40}],
            'umbrella_source_commit': 'b' * 40})
    binding.write(payload / 'runtime-payload-lock.json', {'payloads': [
        {'id': 'python', 'source_dir': 'python', 'required_files': [
            {'path': p.name, 'size_bytes': p.stat().st_size, 'sha256': binding.digest(p)}
            for p in (payload / 'python').iterdir()]}]})
    monkeypatch.setattr(binding.subprocess, 'check_output', lambda args, **kwargs:
                        'fa8a6598dea8ba5ab85201661ead5a69fc055b4a\n' if args[-1].endswith('python-services') else 'c' * 40 + '\n')
    return repo, payload, native


def test_binding_retains_native_bytes_and_refreshes_all_profile_locks(cohort):
    repo, payload, native = cohort
    before = native.read_bytes()
    binding.bind(repo, payload, ACCEPTED)
    assert native.read_bytes() == before
    proof = binding.read(payload / 'accepted-runtime-reuse.json')
    assert proof['preserved_native_sha256']['python/python.exe'] == hashlib.sha256(before).hexdigest()
    for profile in ('planning', 'permitting', 'inspections'):
        p = binding.read(payload / 'python' / f'{profile}-candidate-provenance.json')
        assert p['profile'] == profile + '-preview'
        assert p['umbrella_source_commit'] == 'c' * 40
    for item in binding.read(payload / 'runtime-payload-lock.json')['payloads']:
        for entry in item['required_files']:
            assert entry['sha256'] == binding.digest(payload / item['source_dir'] / entry['path'])


def test_binding_rejects_modified_required_input(cohort):
    repo, payload, native = cohort
    native.write_bytes(b'changed')
    with pytest.raises(ValueError, match='Accepted runtime file differs'):
        binding.bind(repo, payload, ACCEPTED)
    assert not (payload / 'accepted-runtime-reuse.json').exists()


def test_binding_rejects_changed_component_pin(cohort):
    repo, payload, _ = cohort
    binding.write(repo / 'config/inspections-preview-sources.json', {'sources': {'townlight/core': 'd' * 40}})
    with pytest.raises(ValueError, match='Accepted sources differ'):
        binding.bind(repo, payload, ACCEPTED)
    assert not (payload / 'accepted-runtime-reuse.json').exists()
