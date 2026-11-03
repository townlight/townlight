"""Prove pinned-source validation does not silently inspect a moving checkout."""
import copy
import json
from pathlib import Path
import subprocess
import sys
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from candidate_verifier import bind_local_desktop, pinned_file, verify_pinned_metadata, verify_artifacts, verify_documentation


def git(repo, *args):
    return subprocess.check_output(["git", "-C", str(repo), *args], stderr=subprocess.PIPE).decode().strip()


def commit(repo):
    git(repo, "add", ".")
    git(repo, "-c", "user.name=Synthetic test", "-c", "user.email=synthetic@example.invalid", "commit", "-m", "fixture")
    return git(repo, "rev-parse", "HEAD")


def test_desktop_binding_requires_clean_checkout_and_keeps_canonical_input(tmp_path):
    git(tmp_path, "init")
    tracked = tmp_path / "desktop-source"
    tracked.write_text("verified candidate source")
    expected = commit(tmp_path)
    state = {"modules": {}, "desktop_release": {"channel": "candidate", "published_at": None, "commit": None}}
    assert bind_local_desktop(state, tmp_path)["desktop_release"]["commit"] == expected
    assert state["desktop_release"]["commit"] is None
    tracked.write_text("uncommitted source")
    with pytest.raises(ValueError, match="clean"):
        bind_local_desktop(state, tmp_path)


def test_unbound_desktop_cannot_pass_artifact_or_pinned_source_verification(tmp_path):
    state = {"modules": {}, "desktop_release": {"commit": None}}
    assert "bind the exact" in verify_artifacts(state, {}, tmp_path)[0]
    assert "bind the exact" in verify_pinned_metadata(state, lambda *_: pytest.fail("read unbound source"))[0]


def test_pinned_metadata_rejects_stale_state_and_ignores_new_branch_head(tmp_path):
    core = tmp_path / "core"
    core.mkdir()
    git(core, "init")
    manifest = core / "pyproject.toml"
    manifest.write_text('[project]\nname="townlight-core"\nversion="1.3.0.dev2"\n')
    original = commit(core)
    manifest.write_text('[project]\nname="townlight-core"\nversion="9.0.0"\n')
    commit(core)
    module = {"repository": {"name": "townlight/core", "manifest_path": "pyproject.toml"},
              "installer": {"source_commit": original},
              "legacy": {"package_names": ["townlight-core"]},
              "versions": {field: "1.3.0.dev2" for field in ("development", "installer", "public_status")}}
    state = {"modules": {"core": module}, "desktop_release": {"version": "1.7.0-1", "runtime_version": "0.2.0", "commit": "a" * 40}}
    def read(repository, pin, name):
        if repository == "townlight/core":
            assert pin == original
            return pinned_file(repository, pin, name, tmp_path, False)
        return {"desktop/package.json": json.dumps({"version": "1.7.0-1"}).encode(),
                "desktop/src-tauri/Cargo.toml": b'[package]\nversion="1.7.0-1"',
                "desktop/runtime/python-services/pyproject.toml": b'[project]\nname="townlight-runtime"\nversion="0.2.0"'}[name]
    assert verify_pinned_metadata(state, read) == []
    stale = copy.deepcopy(state)
    stale["modules"]["core"]["versions"]["installer"] = "9.0.0"
    assert any("pinned package version" in error for error in verify_pinned_metadata(stale, read))
    stale = copy.deepcopy(state)
    stale["desktop_release"]["runtime_version"] = "0.1.0"
    assert any("runtime: pinned" in error for error in verify_pinned_metadata(stale, read))


def test_built_documentation_rejects_old_meetings_table():
    state = json.loads((Path(__file__).resolve().parents[1] / "config/suite-state.json").read_text())
    rows = ''.join(f'<tr><td>{m["legacy"]["package_names"][0]}</td><td>{m["versions"]["installer"]}</td></tr>'
                   for m in state["modules"].values())
    rows += f'<tr><td>townlight-runtime</td><td>{state["desktop_release"]["runtime_version"]}</td></tr>'
    assert verify_documentation(state, lambda name: rows.encode()) == []
    errors = verify_documentation(state, lambda name: (rows.replace('1.0.5', '1.0.4') if name == 'manuals/meetings.html' else rows).encode())
    assert len(errors) == 1 and "manuals/meetings.html" in errors[0]


def test_artifact_receipt_requires_hashed_wheels_and_detects_changed_bytes(tmp_path):
    import hashlib
    import zipfile
    state = {"modules": {}, "desktop_release": {"version": "1.7.0-1", "runtime_version": "0.2.0", "commit": "a" * 40}}
    artifacts = []
    for kind, name in [('msi', 'candidate.msi'), ('source', 'source.zip'), ('acceptance', 'ACCEPTANCE.md')]:
        path = tmp_path / name
        path.write_bytes(b'synthetic artifact')
        artifacts.append({'kind': kind, 'name': name, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'size_bytes': path.stat().st_size})
    wheel = tmp_path / 'townlight_runtime-0.2.0-py3-none-any.whl'
    with zipfile.ZipFile(wheel, 'w') as archive:
        archive.writestr('townlight_runtime/__init__.py', '')
        archive.writestr('townlight_runtime-0.2.0.dist-info/METADATA', 'Name: townlight-runtime\nVersion: 0.2.0\n')
    receipt = {'desktop_version': '1.7.0-1', 'source_commit': 'a' * 40, 'artifacts': artifacts}
    assert any('wheel missing from hashed' in e for e in verify_artifacts(state, receipt, tmp_path))
    artifacts.append({'kind': 'wheel', 'name': wheel.name, 'sha256': hashlib.sha256(wheel.read_bytes()).hexdigest(), 'size_bytes': wheel.stat().st_size})
    assert verify_artifacts(state, receipt, tmp_path) == []
    (tmp_path / 'candidate.msi').write_bytes(b'changed')
    assert any('artifact integrity mismatch' in e for e in verify_artifacts(state, receipt, tmp_path))
