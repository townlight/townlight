"""Verify the post-foundation local demo deployment profile.

This is a profile guard, not a production readiness certification. It verifies
that the umbrella deployment docs/compose file stay aligned with the current
bounded demo target: Townlight Records + Townlight Meetings + Townlight Code + Townlight Zoning with
local-first defaults and no cloud LLM provider enabled by default.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from argparse import ArgumentParser
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import yaml

from demo_wheels import inspect_wheels, state, wheel_name


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
COMPOSE_FILE = ROOT / "deploy" / "post-foundation-demo.compose.yml"
DOC_FILE = ROOT / "docs" / "deployment" / "local-demo-profile.md"
EXPECTED_SERVICES = {
    "postgres",
    "redis",
    "ollama",
    "townlight_records-api",
    "townlight_records-frontend",
    "townlight_meetings",
    "townlight_code",
    "townlight_zoning",
}
MODULE_SERVICES = {
    "townlight_meetings": ("townlight_meetings.main", "app", "meetings", 8010),
    "townlight_code": ("townlight_code.main", "app", "code", 8020),
    "townlight_zoning": ("townlight_zoning.main", "app", "zoning", 8030),
}
FORBIDDEN_PROVIDER_VALUES = {"openai", "anthropic"}


def fail(message: str) -> str:
    return f"FAIL: {message}"


def load_compose() -> dict[str, Any]:
    with COMPOSE_FILE.open(encoding="utf-8") as handle:
        data = yaml.safe_load(handle)
    if not isinstance(data, dict):
        raise AssertionError("compose file did not parse to a mapping")
    return data


def run_compose_config() -> list[str]:
    proc = subprocess.run(
        ["docker", "compose", "-f", str(COMPOSE_FILE), "config", "--quiet"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        return [fail(f"docker compose config failed: {(proc.stderr or proc.stdout).strip()}")]
    return []


def check_compose(compose: dict[str, Any]) -> list[str]:
    errors = []
    services = compose.get("services")
    if not isinstance(services, dict):
        return [fail("compose file has no services mapping")]

    missing = EXPECTED_SERVICES - set(services)
    if missing:
        errors.append(fail(f"missing services: {', '.join(sorted(missing))}"))

    for service_name in ("townlight_meetings", "townlight_code", "townlight_zoning"):
        service = services.get(service_name, {})
        if not isinstance(service, dict):
            errors.append(fail(f"{service_name} service is not a mapping"))
            continue
        command = json.dumps(service.get("command", ""))
        modules = state()["modules"]
        key = MODULE_SERVICES[service_name][2]
        for expected in (wheel_name(modules["core"]), wheel_name(modules[key])):
            if "/wheels/" + expected not in command:
                errors.append(fail(f"{service_name} command does not install exact local wheel {expected}"))
        if "https://" in command or "http://" in command:
            errors.append(fail(f"{service_name} command contains a remote product artifact URL"))
        if "${TOWNLIGHT_DEMO_WHEELS:-../.candidate-wheels}:/wheels:ro" not in service.get("volumes", []):
            errors.append(fail(f"{service_name} has no read-only candidate wheel mount"))
        env = service.get("environment", {})
        if not isinstance(env, dict):
            errors.append(fail(f"{service_name} environment is not a mapping"))
            continue
        provider = str(env.get("TOWNLIGHT_CORE_LLM_PROVIDER", "")).lower()
        if provider != "ollama":
            errors.append(fail(f"{service_name} default TOWNLIGHT_CORE_LLM_PROVIDER is {provider!r}, expected 'ollama'"))
        if provider in FORBIDDEN_PROVIDER_VALUES:
            errors.append(fail(f"{service_name} defaults to cloud LLM provider {provider!r}"))

    records_env = services.get("townlight_records-api", {}).get("environment", {})
    if isinstance(records_env, dict):
        provider = str(records_env.get("TOWNLIGHT_CORE_LLM_PROVIDER", "")).lower()
        if provider != "ollama":
            errors.append(fail(f"townlight_records-api default TOWNLIGHT_CORE_LLM_PROVIDER is {provider!r}, expected 'ollama'"))
    else:
        errors.append(fail("townlight_records-api environment is not a mapping"))

    return errors



def check_docs() -> list[str]:
    errors = []
    if not DOC_FILE.is_file():
        return [fail(f"missing deployment doc {DOC_FILE.relative_to(ROOT)}")]
    text = DOC_FILE.read_text(encoding="utf-8")
    required_phrases = (
        "evaluation profile, not production packaging",
        "Townlight Records + Townlight Meetings + Townlight Code + Townlight Zoning",
        "No-Network Meaning",
        "Production Pilot Install",
        "Do not treat this compose file as production pilot packaging",
    )
    for phrase in required_phrases:
        if phrase not in text:
            errors.append(fail(f"deployment doc missing phrase: {phrase}"))
    return errors


@contextmanager
def block_outbound_sockets():
    original_create_connection = socket.create_connection

    def blocked_create_connection(*args: Any, **kwargs: Any) -> Any:
        raise AssertionError(f"outbound socket blocked during no-network smoke: {args!r} {kwargs!r}")

    socket.create_connection = blocked_create_connection
    try:
        yield
    finally:
        socket.create_connection = original_create_connection


def check_module_health_without_network() -> list[str]:
    from fastapi.testclient import TestClient

    errors = []
    os.environ.setdefault("TOWNLIGHT_CORE_LLM_PROVIDER", "ollama")
    modules = state()["modules"]
    for key in ("core", "meetings", "code", "zoning"):
        sys.path.insert(0, str(WORKSPACE / modules[key]["repository"]["name"].split("/")[1]))
    with block_outbound_sockets():
        for module_name, (import_path, app_name, key, _port) in MODULE_SERVICES.items():
            expected_version = modules[key]["versions"]["installer"]
            module = __import__(import_path, fromlist=[app_name])
            app = getattr(module, app_name)
            client = TestClient(app)
            response = client.get("/health")
            if response.status_code != 200:
                errors.append(fail(f"{module_name} /health returned {response.status_code}: {response.text}"))
                continue
            payload = response.json()
            if payload.get("version") != expected_version:
                errors.append(
                    fail(f"{module_name} /health version {payload.get('version')!r} != {expected_version!r}")
                )
            townlight_core_version = payload.get("townlight_core_version") or payload.get("townlight_core")
            if townlight_core_version != modules["core"]["versions"]["installer"]:
                errors.append(
                    fail(
                        f"{module_name} /health townlight_core version {townlight_core_version!r} "
                        f"!= {modules['core']['versions']['installer']!r}"
                    )
                )
    return errors


def main() -> int:
    print("==> Deployment profile verification")
    parser = ArgumentParser(description="Verify the post-foundation local demo deployment profile.")
    parser.add_argument(
        "--static-only",
        action="store_true",
        help="Check compose/docs/pins without Docker Compose execution or sibling-clone health imports.",
    )
    parser.add_argument("--wheel-dir", type=Path, default=ROOT / ".candidate-wheels")
    parser.add_argument("--allow-working-tree", action="store_true",
                        help="Preparation-only wheel check; never clean-pin/release evidence")
    args = parser.parse_args()
    if args.static_only:
        print("mode=static-only")
    else:
        print("mode=full")

    errors = []
    if not COMPOSE_FILE.is_file():
        errors.append(fail(f"missing compose file {COMPOSE_FILE.relative_to(ROOT)}"))
    else:
        compose = load_compose()
        errors.extend(check_compose(compose))
        errors.extend(fail(error) for error in inspect_wheels(
            args.wheel_dir, allow_working_tree=args.allow_working_tree))
        if not args.static_only:
            errors.extend(run_compose_config())
    errors.extend(check_docs())
    if not args.static_only:
        errors.extend(check_module_health_without_network())

    if errors:
        for error in errors:
            print(error)
        print("VERIFY-DEPLOYMENT-PROFILE: FAILED")
        return 1
    print("VERIFY-DEPLOYMENT-PROFILE: PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
