"""Verify the post-foundation local demo deployment profile.

This is a profile guard, not a production readiness certification. It verifies
that the umbrella deployment docs/compose file stay aligned with the current
bounded demo target: CivicSunshine + CivicMeetings + CivicCode + CivicZone with
local-first defaults and no cloud LLM provider enabled by default.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
from argparse import ArgumentParser
from contextlib import contextmanager
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.request import Request, urlopen
from zipfile import ZipFile

import yaml


ROOT = Path(__file__).resolve().parents[1]
WORKSPACE = ROOT.parent
COMPOSE_FILE = ROOT / "deploy" / "post-foundation-demo.compose.yml"
DOC_FILE = ROOT / "docs" / "deployment" / "local-demo-profile.md"
EXPECTED_SERVICES = {
    "postgres",
    "redis",
    "ollama",
    "civicrecords-api",
    "civicrecords-frontend",
    "civicclerk",
    "civiccode",
    "civiczone",
}
MODULE_SERVICES = {
    "civicclerk": ("civicclerk.main", "app", "1.0.0", 8010, "1.0"),
    "civiccode": ("civiccode.main", "app", "0.1.18", 8020, "0.22.0"),
    "civiczone": ("civiczone.main", "app", "0.1.1", 8030, "0.3.0"),
}
LOCAL_CIVICCORE_VERSION = "1.0.0"
FORBIDDEN_PROVIDER_VALUES = {"openai", "anthropic"}
WHEEL_METADATA_FETCH_ATTEMPTS = 3
WHEEL_METADATA_FETCH_TIMEOUT_SECONDS = 60


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

    for service_name in ("civicclerk", "civiccode", "civiczone"):
        service = services.get(service_name, {})
        if not isinstance(service, dict):
            errors.append(fail(f"{service_name} service is not a mapping"))
            continue
        command = json.dumps(service.get("command", ""))
        expected_module = MODULE_SERVICES[service_name]
        expected_release_core = expected_module[4]
        expected_service_version = expected_module[2]
        if f"civiccore-{expected_release_core}" not in command:
            errors.append(fail(f"{service_name} command does not install civiccore {expected_release_core} wheel"))
        if f"{service_name}-{expected_service_version}" not in command:
            errors.append(fail(f"{service_name} command does not install {service_name} {expected_service_version} wheel"))
        env = service.get("environment", {})
        if not isinstance(env, dict):
            errors.append(fail(f"{service_name} environment is not a mapping"))
            continue
        provider = str(env.get("CIVICCORE_LLM_PROVIDER", "")).lower()
        if provider != "ollama":
            errors.append(fail(f"{service_name} default CIVICCORE_LLM_PROVIDER is {provider!r}, expected 'ollama'"))
        if provider in FORBIDDEN_PROVIDER_VALUES:
            errors.append(fail(f"{service_name} defaults to cloud LLM provider {provider!r}"))

    records_env = services.get("civicrecords-api", {}).get("environment", {})
    if isinstance(records_env, dict):
        provider = str(records_env.get("CIVICCORE_LLM_PROVIDER", "")).lower()
        if provider != "ollama":
            errors.append(fail(f"civicrecords-api default CIVICCORE_LLM_PROVIDER is {provider!r}, expected 'ollama'"))
    else:
        errors.append(fail("civicrecords-api environment is not a mapping"))

    return errors


def civiccore_wheel_version(release_version: str) -> str:
    if release_version == "1.0":
        return "1.0.0"
    return release_version


def module_wheel_url(service_name: str, service_version: str) -> str:
    return (
        f"https://github.com/CivicSuite/{service_name}/releases/download/"
        f"v{service_version}/{service_name}-{service_version}-py3-none-any.whl"
    )


def fetch_wheel_bytes(url: str) -> bytes:
    last_error: Exception | None = None
    request = Request(url, headers={"User-Agent": "CivicSuite-deployment-profile-verifier"})
    for attempt in range(1, WHEEL_METADATA_FETCH_ATTEMPTS + 1):
        try:
            with urlopen(request, timeout=WHEEL_METADATA_FETCH_TIMEOUT_SECONDS) as response:
                return response.read()
        except Exception as exc:  # pragma: no cover - exercised by release-network failures
            last_error = exc
            if attempt < WHEEL_METADATA_FETCH_ATTEMPTS:
                time.sleep(2 * attempt)
    raise RuntimeError(
        f"could not fetch wheel after {WHEEL_METADATA_FETCH_ATTEMPTS} attempts "
        f"with {WHEEL_METADATA_FETCH_TIMEOUT_SECONDS}s timeout: {last_error}"
    )


def check_module_wheel_metadata() -> list[str]:
    errors = []
    for service_name, (_import_path, _app_name, service_version, _port, core_release_version) in MODULE_SERVICES.items():
        expected_core_version = civiccore_wheel_version(core_release_version)
        expected_fragments = (
            f"/v{core_release_version}/civiccore-{expected_core_version}-py3-none-any.whl",
            f"civiccore-{expected_core_version}",
        )
        try:
            wheel_bytes = fetch_wheel_bytes(module_wheel_url(service_name, service_version))
            with ZipFile(BytesIO(wheel_bytes)) as wheel:
                metadata_name = next(name for name in wheel.namelist() if name.endswith("METADATA"))
                metadata = wheel.read(metadata_name).decode("utf-8")
        except Exception as exc:  # pragma: no cover - exercised by release-network failures
            errors.append(fail(f"could not inspect {service_name} {service_version} wheel metadata: {exc}"))
            continue
        civiccore_requires = [
            line for line in metadata.splitlines() if line.startswith("Requires-Dist: civiccore")
        ]
        if not civiccore_requires:
            errors.append(fail(f"{service_name} {service_version} wheel metadata has no civiccore dependency"))
            continue
        requirement = civiccore_requires[0]
        direct_wheel_match = all(fragment in requirement for fragment in expected_fragments)
        exact_version_match = f"civiccore=={expected_core_version}" in requirement
        if not direct_wheel_match and not exact_version_match:
            errors.append(
                fail(
                    f"{service_name} {service_version} wheel metadata requires {requirement!r}, "
                    f"expected civiccore {expected_core_version} from v{core_release_version}"
                )
            )
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
    os.environ.setdefault("CIVICCORE_LLM_PROVIDER", "ollama")
    sys.path.insert(0, str(WORKSPACE / "civiccore"))
    for module_name in MODULE_SERVICES:
        sys.path.insert(0, str(WORKSPACE / module_name))
    with block_outbound_sockets():
        for module_name, (import_path, app_name, expected_version, _port, _release_core_version) in MODULE_SERVICES.items():
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
            civiccore_version = payload.get("civiccore_version") or payload.get("civiccore")
            if civiccore_version != LOCAL_CIVICCORE_VERSION:
                errors.append(
                    fail(
                        f"{module_name} /health civiccore version {civiccore_version!r} "
                        f"!= {LOCAL_CIVICCORE_VERSION!r}"
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
        errors.extend(check_module_wheel_metadata())
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
