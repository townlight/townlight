"""Full Windows payload must remain activatable after preview module removal."""
import importlib.util
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / 'desktop/scripts/assemble-coordinated-payload.py'
spec = importlib.util.spec_from_file_location('coordinated_payload', SCRIPT)
assembly = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assembly)


def test_subset_preview_activation_has_locked_provenance(tmp_path):
    python = tmp_path / 'python'
    python.mkdir()
    source = {'umbrella_source_commit': '1' * 40, 'package_versions': {'townlight_planning': '0.4.0.dev2'}}
    assembly.write_profile_provenance(tmp_path, source)
    profiles = {}
    for profile in assembly.SUPPORTED_PROFILES:
        name = profile.removesuffix('-preview') + '-candidate-provenance.json'
        profiles[profile] = [name]
        receipt = json.loads((python / name).read_text())
        assert receipt == {**source, 'profile': profile, 'build_profile': 'inspections-preview'}
    station = tmp_path / 'station/bin'
    station.mkdir(parents=True)
    for filename in ('ffmpeg.exe', 'ffprobe.exe', 'FFMPEG-LICENSE.txt'):
        (station / filename).write_text('test native input')
    lock = assembly.make_lock(tmp_path, {'profile': 'windows-local-1.0', 'payloads': [{
        'id': 'cpython-services', 'label': 'Python services', 'source_dir': 'python',
        'required_files': [], 'profile_required_files': profiles}]})
    entries = {entry['path']: entry for entry in lock['payloads'][0]['required_files']}
    for required in profiles.values():
        entry = entries[required[0]]
        assert entry['sha256'] == assembly.digest(python / required[0])
        assert entry['size_bytes'] == (python / required[0]).stat().st_size
