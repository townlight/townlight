"""HTTP helper resilience for installer lifecycle verification."""

from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys
from pathlib import Path


UMBRELLA_ROOT = Path(__file__).resolve().parents[1]


def _load_installer_module() -> object:
    module_path = UMBRELLA_ROOT / "scripts" / "run-clerk-core-installer.py"
    spec = importlib.util.spec_from_file_location("run_clerk_core_installer_for_tests", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_decode_json_preserves_non_json_http_body_as_diagnostic_payload() -> None:
    installer = _load_installer_module()

    payload = installer.decode_json("Service Unavailable")

    assert payload == {
        "detail": {
            "message": "Received non-JSON HTTP response.",
            "raw_body": "Service Unavailable",
        }
    }


def test_decode_json_wraps_json_scalars_for_dict_callers() -> None:
    installer = _load_installer_module()

    assert installer.decode_json('"created"') == {"detail": "created"}


def test_cleanup_orphan_compose_project_removes_labeled_resources(monkeypatch) -> None:
    installer = _load_installer_module()
    commands: list[list[str]] = []

    def fake_run(command: list[str], *, cwd: Path, timeout: int = 900):
        commands.append(command)
        if command[1:3] == ["container", "ls"]:
            return subprocess.CompletedProcess(command, 0, stdout="container-a\n", stderr="")
        if command[1:3] == ["volume", "ls"]:
            return subprocess.CompletedProcess(command, 0, stdout="volume-a\nvolume-b\n", stderr="")
        if command[1:3] == ["network", "ls"]:
            return subprocess.CompletedProcess(command, 0, stdout="network-a\n", stderr="")
        return subprocess.CompletedProcess(command, 0, stdout="", stderr="")

    monkeypatch.setattr(installer, "docker_command", lambda: "docker")
    monkeypatch.setattr(installer, "run", fake_run)

    result = installer.cleanup_orphan_compose_project("townlight-test-clerk")

    assert result["status"] == "removed_or_absent"
    assert ["docker", "rm", "-f", "container-a"] in commands
    assert ["docker", "volume", "rm", "-f", "volume-a", "volume-b"] in commands
    assert ["docker", "network", "rm", "network-a"] in commands


def test_uninstall_uses_orphan_cleanup_when_source_tree_is_missing(monkeypatch, tmp_path) -> None:
    installer = _load_installer_module()
    install_root = tmp_path / "runtime" / "clerk-core"
    cleanup_projects: list[str] = []
    isolation = installer.resolve_isolation(run_id="test", port_offset=0)

    def fake_cleanup(project: str) -> dict[str, object]:
        cleanup_projects.append(project)
        return {
            "project": project,
            "containers": ["container-a"],
            "volumes": ["volume-a"],
            "networks": ["network-a"],
            "steps": [],
            "status": "removed_or_absent",
        }

    monkeypatch.setattr(installer, "ROOT", tmp_path)
    monkeypatch.setattr(installer, "cleanup_orphan_compose_project", fake_cleanup)

    result = installer.uninstall(
        install_root,
        isolation=isolation,
        report_dir=tmp_path / "reports",
        selected_modules=["townlight_meetings"],
    )

    assert result["status"] == "passed"
    assert cleanup_projects == ["townlight-test-clerk"]
    assert result["steps"][0]["status"] == "skipped_not_selected"
    assert result["steps"][1]["status"] == "source_missing_orphan_cleanup"


def test_normalize_clerk_frontend_dockerfile_installs_rolldown_musl_binding(tmp_path) -> None:
    installer = _load_installer_module()
    source = tmp_path / "townlight_meetings"
    frontend = source / "frontend"
    frontend.mkdir(parents=True)
    (source / "Dockerfile.frontend").write_text(
        "FROM node:24-alpine AS build\n"
        "WORKDIR /app\n"
        "COPY frontend/package.json frontend/package-lock.json ./\n"
        "RUN npm ci\n"
        "COPY frontend/ ./\n"
        "RUN npm run build\n",
        encoding="utf-8",
    )
    (frontend / "package-lock.json").write_text(
        json.dumps(
            {
                "packages": {
                    "node_modules/rolldown": {
                        "optionalDependencies": {
                            "@rolldown/binding-linux-x64-musl": "1.0.3"
                        }
                    }
                }
            }
        )
        + "\n",
        encoding="utf-8",
    )

    installer.normalize_clerk_frontend_dockerfile(source)
    installer.normalize_clerk_frontend_dockerfile(source)

    dockerfile = (source / "Dockerfile.frontend").read_text(encoding="utf-8")
    install_line = "RUN npm install --no-save @rolldown/binding-linux-x64-musl@1.0.3"
    assert dockerfile.count(install_line) == 1
    assert dockerfile.index(install_line) > dockerfile.index("RUN npm ci")
    assert dockerfile.index(install_line) < dockerfile.index("RUN npm run build")


def test_townlight_notice_is_part_of_city_core_installer_lifecycle(monkeypatch, tmp_path) -> None:
    installer = _load_installer_module()
    monkeypatch.setattr(installer, "ROOT", tmp_path)
    install_root = tmp_path / "runtime" / "city-core"
    isolation = installer.resolve_isolation(run_id="test-townlight_notice-default", port_offset=0)

    default_ctx = installer.lifecycle_context(install_root, isolation, selected_modules=None)
    city_core_ctx = installer.lifecycle_context(
        install_root,
        isolation,
        selected_modules=[
            installer.MODULE_RECORDS,
            installer.MODULE_CLERK,
            installer.MODULE_CODE,
            installer.MODULE_NOTICE,
        ],
    )

    assert installer.MODULE_NOTICE in installer.SELECTABLE_MODULES
    assert installer.MODULE_NOTICE not in installer.DEFAULT_SELECTED_MODULES
    assert installer.MODULE_NOTICE not in default_ctx["selected_modules"]
    assert installer.MODULE_NOTICE in city_core_ctx["selected_modules"]
    assert city_core_ctx["notice_source"] == install_root / "sources" / "townlight_notice"
    assert city_core_ctx["notice_project"] == isolation["compose_projects"]["townlight_notice"]


def test_townlight_notice_database_contract_uses_generated_env(tmp_path) -> None:
    installer = _load_installer_module()
    notice_source = tmp_path / "sources" / "townlight_notice"
    notice_source.mkdir(parents=True)
    (notice_source / ".env").write_text(
        "POSTGRES_USER=notice_user\n"
        "POSTGRES_DB=notice_db\n",
        encoding="utf-8",
    )
    ctx = {
        "notice_source": notice_source,
        "notice_project": "townlight-test-notice",
    }

    contract = installer.module_database_contract(ctx, installer.MODULE_NOTICE)

    assert contract["source"] == notice_source
    assert contract["project"] == "townlight-test-notice"
    assert contract["postgres_service"] == "postgres"
    assert contract["postgres_user"] == "notice_user"
    assert contract["postgres_db"] == "notice_db"


def test_townlight_notice_generated_compose_has_parseable_healthcheck(tmp_path) -> None:
    installer = _load_installer_module()
    notice_source = tmp_path / "sources" / "townlight_notice"
    notice_source.mkdir(parents=True)

    installer.write_notice_compose(notice_source)

    compose_text = (notice_source / "docker-compose.yml").read_text(encoding="utf-8")
    assert "test:\n        - CMD-SHELL\n        - >-\n" in compose_text
    assert "urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)" in compose_text

    docker = shutil.which("docker")
    if docker:
        proc = subprocess.run(
            [docker, "compose", "-f", "docker-compose.yml", "config"],
            cwd=notice_source,
            capture_output=True,
            text=True,
            check=False,
        )
        assert proc.returncode == 0, proc.stderr or proc.stdout
