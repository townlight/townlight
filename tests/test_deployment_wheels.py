"""Reject artifact drift that previously escaped the demo profile observer."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import zipfile

import pytest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
import demo_wheels


def make_wheels(directory, *, core_requirement=None):
    modules = demo_wheels.state()["modules"]
    receipt = {}
    for key in demo_wheels.KEYS:
        module = modules[key]
        name = demo_wheels.wheel_name(module)
        distribution = module["legacy"]["package_names"][0]
        principal = distribution.replace("-", "_")
        metadata = f"Name: {distribution}\nVersion: {module['versions']['installer']}\n"
        if key != "core":
            metadata += "Requires-Dist: " + (core_requirement or "townlight-core==" + modules["core"]["versions"]["installer"]) + "\n"
        path = directory / name
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr(principal + "/__init__.py", "")
            archive.writestr(principal + ".dist-info/METADATA", metadata)
        receipt[key] = dict(name=name, repository=module["repository"]["name"],
                            source_commit=module["installer"]["source_commit"], dirty=False,
                            sha256=hashlib.sha256(path.read_bytes()).hexdigest())
    write_receipt(directory, receipt)
    return receipt


def write_receipt(directory, receipt):
    (directory / "demo-wheels.json").write_text(json.dumps(receipt), encoding="utf-8")


def test_accepts_exact_artifacts_and_normalized_core_name(tmp_path):
    make_wheels(tmp_path, core_requirement="townlight_core==" + demo_wheels.state()["modules"]["core"]["versions"]["installer"])
    assert demo_wheels.inspect_wheels(tmp_path) == []


def test_rejects_tampered_bytes(tmp_path):
    receipt = make_wheels(tmp_path)
    with (tmp_path / receipt["meetings"]["name"]).open("ab") as stream:
        stream.write(b"tampered")
    assert "wheel hash differs" in ";".join(demo_wheels.inspect_wheels(tmp_path))


@pytest.mark.parametrize("field,value", [("dirty", True), ("source_commit", "0" * 40)])
def test_preparation_is_not_release_source_evidence(tmp_path, field, value):
    receipt = make_wheels(tmp_path)
    receipt["code"][field] = value
    write_receipt(tmp_path, receipt)
    assert "clean canonical source pin" in ";".join(demo_wheels.inspect_wheels(tmp_path))
    assert demo_wheels.inspect_wheels(tmp_path, allow_working_tree=True) == []


@pytest.mark.parametrize("requirement", ["townlight-core>=1", "townlight-core==0.1", "townlight-core==1.3.0.dev2; python_version<'3.11'", "townlight-core @ https://example.invalid/core.whl"])
def test_rejects_wrong_or_conditional_core_dependency(tmp_path, requirement):
    make_wheels(tmp_path, core_requirement=requirement)
    assert "Core dependency must be unconditional and pinned" in ";".join(demo_wheels.inspect_wheels(tmp_path))


def test_compose_rejects_remote_artifact_and_missing_mount():
    spec = importlib.util.spec_from_file_location("deployment_profile", SCRIPTS / "verify-deployment-profile.py")
    profile = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(profile)
    compose = profile.load_compose()
    assert profile.check_compose(compose) == []
    service = compose["services"]["townlight_meetings"]
    service["command"].append("https://example.invalid/not-a-release.whl")
    service["volumes"] = []
    errors = ";".join(profile.check_compose(compose))
    assert "remote product artifact URL" in errors
    assert "read-only candidate wheel mount" in errors
