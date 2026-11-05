"""Assemble exact suite wheels on the verified native bytes of the accepted MSI.

This prepares a build input. New native launchers still need signing; package
assembly does not establish Windows installed acceptance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from demo_wheels import components, inspect_wheels  # noqa: E402

PROFILE = 'inspections-preview'
SUPPORTED_PROFILES = ('planning-preview', 'permitting-preview', PROFILE)
NATIVE = {'.exe', '.dll', '.pyd'}
SUBTREES = {'python', 'postgres', 'ollama', 'station'}
SITE_CUSTOMIZE = 'python/Lib/site-packages/sitecustomize.py'
SIDE_CARS = {f'python/{profile}-candidate-provenance.json' for profile in ('planning', 'permitting', 'inspections')}


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(path, value):
    with path.open('x', encoding='utf-8') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def write_profile_provenance(output, provenance):
    # The full payload also supports its smaller preview compositions. Each
    # activation validates its own provenance file against the payload lock.
    for profile in SUPPORTED_PROFILES:
        name = profile.removesuffix('-preview')
        write_json(output / f'python/{name}-candidate-provenance.json',
                   {**provenance, 'profile': profile, 'build_profile': PROFILE})


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def canonical_digest(data):
    return hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def child(root, name):
    relative = PurePosixPath(name)
    if not relative.parts or relative.is_absolute() or '..' in relative.parts or '\\' in name or ':' in name:
        raise ValueError(f'Unsafe payload relative path: {name}')
    target = root.joinpath(*relative.parts)
    if not target.resolve().is_relative_to(root.resolve()) or target.is_symlink():
        raise ValueError(f'Unsafe payload file: {name}')
    return target


def verify_base_receipts(contract, inventory, exclusions):
    accepted = contract['accepted_msi_sha256']
    if inventory['accepted_msi_sha256'] != accepted or exclusions['accepted_msi_sha256'] != accepted:
        raise ValueError('Historical receipts do not describe the pinned accepted MSI')
    files = inventory['files']
    removed = exclusions['excluded_owned_files']
    if canonical_digest(files) != contract['verified_file_inventory_sha256']:
        raise ValueError('Verified native file inventory digest differs')
    if canonical_digest(sorted(removed)) != contract['historical_owned_exclusions_sha256']:
        raise ValueError('Historical owned-file exclusion digest differs')
    if not set(removed) <= files.keys() or any(not name.startswith('python/') for name in removed):
        raise ValueError('Owned exclusions must be inventoried Python files only')
    return files, set(removed)


def stage_base(source, output, files, removed):
    reused_native = {}
    copied = 0
    for name, item in files.items():
        relative = PurePosixPath(name)
        if relative.parts[0] not in SUBTREES or name in removed or name in SIDE_CARS:
            continue
        if relative.suffix == '.pyc' or '__pycache__' in relative.parts:
            continue
        old, new = child(source, name), child(output, name)
        if not old.is_file() or old.stat().st_size != item['bytes'] or digest(old) != item['sha256']:
            raise ValueError(f'Accepted payload input bytes differ: {name}')
        if relative.suffix.lower() in NATIVE:
            if item['native_signature_verified'] is not True:
                raise ValueError(f'Reused native file lacks signature evidence: {name}')
            reused_native[name] = item['sha256']
        new.parent.mkdir(parents=True, exist_ok=True)
        if new.exists():
            raise ValueError(f'Unexpected existing payload file: {name}')
        shutil.copyfile(old, new)
        if digest(new) != item['sha256']:
            raise ValueError(f'Readback of copied payload differs: {name}')
        copied += 1
    # Same startup isolation policy; update only the descriptive first line.
    customize = child(output, SITE_CUSTOMIZE)
    lines = customize.read_text(encoding='utf-8-sig').splitlines(keepends=True)
    lines[0] = '"""Keep the Townlight embedded runtime isolated from user Python packages."""\n'
    customize.write_text(''.join(lines), encoding='utf-8', newline='\n')
    return copied, reused_native


def make_lock(output, payload_manifest):
    result = []
    for payload in payload_manifest['payloads']:
        files = dict.fromkeys(payload['required_files'])
        for profile in SUPPORTED_PROFILES:
            files.update(dict.fromkeys(payload.get('profile_required_files', {}).get(profile, [])))
        entries = []
        for name in files:
            path = child(output, payload['source_dir'] + '/' + name)
            entries.append({'path': name, 'size_bytes': path.stat().st_size, 'sha256': digest(path)})
        result.append({**{key: payload[key] for key in ('id', 'label', 'source_dir')},
                       'status': 'present', 'required_files': entries})
    # The paired Station service/media must be present in the actual payload.
    entries = []
    for name in ('bin/ffmpeg.exe', 'bin/ffprobe.exe', 'bin/FFMPEG-LICENSE.txt'):
        path = child(output, 'station/' + name)
        entries.append({'path': name, 'size_bytes': path.stat().st_size, 'sha256': digest(path)})
    result.append({'id': 'station-media', 'label': 'Townlight Station media tools', 'source_dir': 'station',
                   'status': 'present', 'required_files': entries})
    return {'schema_version': 1, 'profile': payload_manifest['profile'], 'product_profile': PROFILE,
            'payload_root': str(output), 'payloads': result}


def verify_reused_station(output, wheel):
    """Keep the accepted signed launcher when the Station payload code is unchanged."""
    site = output / 'python/Lib/site-packages'
    normalize = {'.py', '.json', '.html', '.css', '.js', '.txt'}
    counts = {'exact': 0, 'line_endings_only': 0}
    with zipfile.ZipFile(wheel) as archive:
        expected = {name for name in archive.namelist() if name.startswith('townlight_station/') and not name.endswith('/')}
        entry_points = [name for name in archive.namelist() if name.endswith('.dist-info/entry_points.txt')]
        if not expected or len(entry_points) != 1:
            raise ValueError('Station wheel is missing its executable service or entry-point metadata')
        actual = {path.relative_to(site).as_posix() for path in (site / 'townlight_station').rglob('*') if path.is_file()}
        if actual != expected:
            raise ValueError('Accepted Station runtime file inventory differs from the pinned wheel')
        for name in sorted(expected | set(entry_points)):
            accepted, current = child(site, name).read_bytes(), archive.read(name)
            if accepted == current:
                counts['exact'] += 1
            elif Path(name).suffix in normalize and accepted.replace(b'\r\n', b'\n') == current.replace(b'\r\n', b'\n'):
                counts['line_endings_only'] += 1
            else:
                raise ValueError(f'Accepted Station runtime differs from pinned source: {name}')
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ('state', 'wheels', 'accepted-msi', 'base-root', 'base-inventory', 'base-exclusions', 'receipt'):
        parser.add_argument('--' + key, type=Path, required=True)
    args = parser.parse_args()
    manifest = read_json(args.state)
    commit = manifest['desktop_release']['commit']
    head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if head != commit or subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=ROOT):
        raise ValueError('Build checkout is not clean at the bound umbrella source commit')
    canonical = read_json(ROOT / 'config/suite-state.json')
    canonical['desktop_release']['commit'] = head
    if manifest != canonical:
        raise ValueError('Bound state differs from the committed suite contract')
    pins_path = ROOT / 'config/inspections-preview-sources.json'
    config_path = ROOT / 'config/inspections-msi-candidate.json'
    pins = read_json(pins_path)['sources']
    if pins != {item['repository']['name']: item['installer']['source_commit']
                for item in manifest['modules'].values()}:
        raise ValueError('Coordinated wheel sources and desktop contract sources differ')
    errors = inspect_wheels(args.wheels, all_products=True, manifest=manifest)
    if errors:
        raise ValueError('; '.join(errors))
    contract = read_json(ROOT / 'config/coordinated-native-base.json')
    files, removed = verify_base_receipts(contract, read_json(args.base_inventory), read_json(args.base_exclusions))
    if digest(args.accepted_msi) != contract['accepted_msi_sha256']:
        raise ValueError('Accepted MSI hash differs')
    signature = subprocess.check_output(['powershell.exe', '-NoProfile', '-Command',
        '(Get-AuthenticodeSignature -LiteralPath $env:TOWNLIGHT_ACCEPTED_MSI).Status.ToString()'],
        env={**os.environ, 'TOWNLIGHT_ACCEPTED_MSI': str(args.accepted_msi.resolve())}, text=True).strip()
    if signature != 'Valid':
        raise ValueError(f'Accepted MSI Authenticode is {signature}')
    output = (ROOT / 'desktop/runtime/payload').resolve()
    source = args.base_root.resolve()
    if output.is_relative_to(source) or source.is_relative_to(output) or not output.is_relative_to(ROOT):
        raise ValueError('Accepted inputs and new payload must be isolated')
    if args.receipt.resolve().is_relative_to(ROOT) or args.receipt.exists():
        raise ValueError('Build receipt must be a new external file')
    output.mkdir(parents=True, exist_ok=True)
    if {path.name for path in output.iterdir()} - {'.gitignore', 'README.md'}:
        raise ValueError('Refusing to overlay an existing runtime payload')
    copied, reused_native = stage_base(source, output, files, removed)
    wheel_receipt = read_json(args.wheels / 'suite-wheels.json')
    modules = components(True, manifest)
    package_names = {module['legacy']['package_names'][0]: module['versions']['installer'] for module in modules.values()}
    python = output / 'python/python.exe'
    station_reuse = verify_reused_station(output, args.wheels / wheel_receipt['station']['name'])
    env = {key: value for key, value in os.environ.items() if key not in ('PYTHONPATH', 'PYTHONHOME')}
    env.update(TESTING='1', PIP_CONFIG_FILE=os.devnull, PIP_NO_INDEX='1')
    with tempfile.TemporaryDirectory(prefix='tl-embedded-probe-') as cwd:
        def invoke(*command):
            return subprocess.check_output([str(python), '-I', '-B', *command], cwd=cwd, env=env, text=True)
        print(invoke('-m', 'pip', 'install', '--no-index', '--no-deps', '--no-compile', '--force-reinstall',
                     *(str((args.wheels / wheel_receipt[key]['name']).resolve()) for key in modules if key != 'station')), flush=True)
        print(invoke('-m', 'pip', 'check'), flush=True)
        probe = ('import importlib, importlib.metadata as metadata, json, pathlib\n'
                 'expected = json.loads(__import__("sys").argv[1])\n'
                 'site = pathlib.Path(__import__("sys").executable).parent / "Lib/site-packages"\n'
                 'for name, version in expected.items():\n'
                 '    assert metadata.version(name) == version, name\n'
                 '    module = importlib.import_module(name.replace("-", "_"))\n'
                 '    assert pathlib.Path(module.__file__).resolve().is_relative_to(site.resolve()), name\n'
                 'print(json.dumps(expected, sort_keys=True))\n')
        installed = json.loads(invoke('-c', probe, json.dumps(package_names)))
    # Meetings deliberately retains its neutral prompt resource paths. Verify
    # reinstalled copies against the pinned wheel, never the historical MSI.
    prompt_prefix = 'python/Lib/site-packages/'
    with zipfile.ZipFile(args.wheels / wheel_receipt['meetings']['name']) as meetings_wheel:
        wheel_files = set(meetings_wheel.namelist())
        for name in sorted(removed):
            path = child(output, name)
            if not path.exists():
                continue
            wheel_name = name.removeprefix(prompt_prefix)
            if (not name.startswith(prompt_prefix + 'prompts/') or
                    wheel_name not in wheel_files or path.read_bytes() != meetings_wheel.read(wheel_name)):
                raise ValueError(f'An excluded historical service file reappeared: {name}')
    for name, expected in reused_native.items():
        if digest(child(output, name)) != expected:
            raise ValueError(f'Wheel installation altered reused signed native bytes: {name}')
    added_native = sorted(path.relative_to(output).as_posix() for path in output.rglob('*')
                          if path.is_file() and path.suffix.lower() in NATIVE
                          and path.relative_to(output).as_posix() not in reused_native)
    provenance = {'profile': PROFILE, 'build_profile': PROFILE, 'development_only': False,
                  'sources': [{'repository': name, 'source_commit': sha} for name, sha in pins.items()],
                  'contract_sha256': digest(config_path), 'sources_manifest_sha256': digest(pins_path),
                  'wheels': [dict(item) for item in wheel_receipt.values()], 'umbrella_source_commit': commit,
                  'reused_station_runtime': station_reuse,
                  'package_versions': {name.replace('-', '_'): version for name, version in installed.items()}}
    write_profile_provenance(output, provenance)
    lock = make_lock(output, read_json(ROOT / 'desktop/runtime/windows-runtime-payloads.json'))
    lock['accepted_native_base_sha256'] = contract['accepted_msi_sha256']
    lock['umbrella_source_commit'] = commit
    write_json(output / 'runtime-payload-lock.json', lock)
    write_json(args.receipt, {**provenance, 'accepted_msi_sha256': contract['accepted_msi_sha256'],
                             'copied_files': copied, 'reused_signed_native_files': reused_native,
                             'new_native_files_requiring_signing': added_native,
                             'status': 'prepared payload; signing and installed acceptance pending'})
    print(f'Prepared {len(installed) - 1} installed wheels, pinned Station reuse and {len(reused_native)} reused signed native files; '
          f'{len(added_native)} new native files require signing.', flush=True)


if __name__ == '__main__':
    main()
