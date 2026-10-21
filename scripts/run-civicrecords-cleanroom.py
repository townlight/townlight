"""Run a CivicRecords AI cleanroom service and UI proof."""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
REPORT_ROOT = ROOT / "installer" / "reports"
BUNDLED_CIVICRECORDS = ROOT / "modules" / "civicrecords-ai"
CIVICRECORDS = BUNDLED_CIVICRECORDS if BUNDLED_CIVICRECORDS.is_dir() else ROOT.parent / "civicrecords-ai"
WINDOWS_DOCKER_DESKTOP_BIN = Path("C:/Program Files/Docker/Docker/resources/bin")


def make_run_id() -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"civicrecords-cleanroom-{timestamp}-{uuid4().hex[:8]}"


def run(
    command: list[str],
    *,
    cwd: Path,
    timeout: int = 900,
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        env=cleanroom_subprocess_env(),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=timeout,
    )


def cleanroom_subprocess_env() -> dict[str, str]:
    env = os.environ.copy()
    if sys.platform.startswith("win") and WINDOWS_DOCKER_DESKTOP_BIN.is_dir():
        docker_bin = str(WINDOWS_DOCKER_DESKTOP_BIN)
        current_path = env.get("PATH", "")
        path_parts = [part for part in current_path.split(os.pathsep) if part]
        if docker_bin.lower() not in {part.lower() for part in path_parts}:
            env["PATH"] = docker_bin + os.pathsep + current_path
    return env


def docker_command() -> str:
    found = shutil.which("docker")
    if found:
        return found
    docker_exe = WINDOWS_DOCKER_DESKTOP_BIN / "docker.exe"
    if sys.platform.startswith("win") and docker_exe.is_file():
        return str(docker_exe)
    return "docker"


def ensure_secret_files(source: Path) -> None:
    secret_dir = source / "data" / "secrets"
    secret_dir.mkdir(parents=True, exist_ok=True)
    secrets_to_write = {
        "jwt_secret": secrets.token_hex(32),
        "first_admin_password": f"Cleanroom-{secrets.token_hex(16)}",
    }
    for name, value in secrets_to_write.items():
        path = secret_dir / name
        if not path.is_file():
            path.write_text(value + "\n", encoding="utf-8")
        try:
            path.chmod(0o400)
        except OSError:
            pass


def write_env(target: Path) -> dict[str, str]:
    ensure_secret_files(target.parent)
    values = {
        "DATABASE_URL": "postgresql+asyncpg://civicrecords:civicrecords@postgres:5432/civicrecords",
        "FIRST_ADMIN_EMAIL": "admin@example.gov",
        "OLLAMA_BASE_URL": "http://ollama:11434",
        "REDIS_URL": "redis://redis:6379/0",
        "AUDIT_RETENTION_DAYS": "1095",
        "CONNECTOR_HOST_ALLOWLIST": "",
        "PORTAL_MODE": "private",
        "ENCRYPTION_KEY": base64.urlsafe_b64encode(os.urandom(32)).decode(),
        "CIVICRECORDS_SECRET_DIR": "./data/secrets",
    }
    target.write_text("\n".join(f"{key}={value}" for key, value in values.items()) + "\n", encoding="utf-8")
    return values


def copy_source(target: Path) -> None:
    if target.exists():
        raise RuntimeError(f"Cleanroom source already exists: {target}")
    ignore = shutil.ignore_patterns(
        ".git",
        ".claude",
        ".ruff_cache",
        ".venv",
        ".venv*",
        ".pytest_cache",
        ".tmp-*",
        "backend-failed.log",
        "node_modules",
        "docs/playwright-report",
        "frontend/test-results",
        "frontend/playwright-report",
    )
    shutil.copytree(CIVICRECORDS, target, ignore=ignore)


def write_override(target: Path, *, api_port: int, frontend_port: int) -> Path:
    override = target / "docker-compose.cleanroom.override.yml"
    override.write_text(
        f"""services:
  api:
    ports:
      - "{api_port}:8000"
  frontend:
    ports:
      - "{frontend_port}:80"
""",
        encoding="utf-8",
        newline="\n",
    )
    return override


def normalize_compose_ports(target: Path, *, api_port: int, frontend_port: int) -> None:
    compose = target / "docker-compose.yml"
    text = compose.read_text(encoding="utf-8")
    text = text.replace('"8000:8000"', f'"{api_port}:8000"')
    text = text.replace('"8080:80"', f'"{frontend_port}:80"')
    compose.write_text(text, encoding="utf-8", newline="\n")


def compose_command(project: str, source: Path, *args: str) -> list[str]:
    return [
        docker_command(),
        "compose",
        "-p",
        project,
        "-f",
        "docker-compose.yml",
        "-f",
        "docker-compose.cleanroom.override.yml",
        *args,
    ]


def wait_for_url(url: str, *, timeout_seconds: int = 240) -> dict[str, object]:
    deadline = time.time() + timeout_seconds
    attempts = []
    while time.time() < deadline:
        proc = run(["curl", "-fsS", url], cwd=ROOT, timeout=20)
        attempts.append({"returncode": proc.returncode, "stdout": proc.stdout[:500], "stderr": proc.stderr[:500]})
        if proc.returncode == 0:
            return {"status": "passed", "attempts": attempts}
        time.sleep(5)
    return {"status": "failed", "attempts": attempts}


def write_playwright_probe(report_dir: Path, *, frontend_url: str) -> Path:
    probe = report_dir / "live-ui-smoke.mjs"
    playwright_module = (CIVICRECORDS / "frontend" / "node_modules" / "playwright" / "index.mjs").as_posix()
    probe.write_text(
        f"""import {{ chromium }} from 'file:///{playwright_module}';

const browser = await chromium.launch();
const desktop = await browser.newPage({{ viewport: {{ width: 1366, height: 900 }} }});
const consoleErrors = [];
desktop.on('console', msg => {{
  if (msg.type() === 'error') consoleErrors.push(msg.text());
}});
desktop.on('pageerror', error => consoleErrors.push(error.message));
await desktop.goto('{frontend_url}', {{ waitUntil: 'networkidle' }});
const desktopText = await desktop.locator('body').innerText();
if (!/CivicRecords|Dashboard|Login|records/i.test(desktopText)) {{
  throw new Error('Desktop page did not render expected CivicRecords text.');
}}
await desktop.screenshot({{ path: 'cleanroom-ui-desktop.png', fullPage: true }});
if (consoleErrors.length > 0) {{
  throw new Error(`Console errors: ${{consoleErrors.join(' | ')}}`);
}}

const mobile = await browser.newPage({{ viewport: {{ width: 390, height: 844 }}, isMobile: true }});
await mobile.goto('{frontend_url}', {{ waitUntil: 'networkidle' }});
const mobileText = await mobile.locator('body').innerText();
if (!/CivicRecords|Dashboard|Login|records/i.test(mobileText)) {{
  throw new Error('Mobile page did not render expected CivicRecords text.');
}}
await mobile.screenshot({{ path: 'cleanroom-ui-mobile.png', fullPage: true }});
await browser.close();
console.log(JSON.stringify({{
  status: 'passed',
  desktopTextSample: desktopText.slice(0, 500),
  mobileTextSample: mobileText.slice(0, 500),
  consoleErrors
}}, null, 2));
/*
  const consoleErrors: string[] = [];
  page.on('console', msg => {{
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  }});
  page.on('pageerror', error => consoleErrors.push(error.message));
  await page.goto('{frontend_url}', {{ waitUntil: 'networkidle' }});
  await expect(page.locator('body')).toContainText(/CivicRecords|Dashboard|Login|records/i);
  await page.screenshot({{ path: 'cleanroom-ui-desktop.png', fullPage: true }});
  expect(consoleErrors).toEqual([]);
}});

test('CivicRecords cleanroom frontend renders on mobile width', async ({{ page }}) => {{
  await page.setViewportSize({{ width: 390, height: 844 }});
  await page.goto('{frontend_url}', {{ waitUntil: 'networkidle' }});
  await expect(page.locator('body')).toContainText(/CivicRecords|Dashboard|Login|records/i);
  await page.screenshot({{ path: 'cleanroom-ui-mobile.png', fullPage: true }});
}});
*/
""",
        encoding="utf-8",
        newline="\n",
    )
    return probe


def run_playwright(report_dir: Path, *, frontend_url: str) -> subprocess.CompletedProcess[str]:
    probe = write_playwright_probe(report_dir, frontend_url=frontend_url)
    return run(["node", str(probe)], cwd=report_dir, timeout=300)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run Townlight Records cleanroom service proof.")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--api-port", type=int, default=18000)
    parser.add_argument("--frontend-port", type=int, default=18080)
    parser.add_argument("--keep-running", action="store_true")
    args = parser.parse_args()

    if not CIVICRECORDS.is_dir():
        print(f"ERROR: Townlight Records repo missing: {CIVICRECORDS}", file=sys.stderr)
        return 2

    run_id = args.run_id or make_run_id()
    project = run_id.replace("_", "-").lower()[:50]
    report_dir = REPORT_ROOT / run_id
    source = ROOT / "r" / run_id / "records" if sys.platform.startswith("win") and BUNDLED_CIVICRECORDS.is_dir() else report_dir / "source"
    report_dir.mkdir(parents=True, exist_ok=True)
    proof_path = report_dir / "service-ui-proof.json"
    proof: dict[str, object] = {
        "run_id": run_id,
        "project": project,
        "source_repo": str(CIVICRECORDS),
        "source_copy": str(source.relative_to(ROOT)),
        "api_url": f"http://127.0.0.1:{args.api_port}/health",
        "frontend_url": f"http://127.0.0.1:{args.frontend_port}/",
        "mutates_host": True,
        "host_mutation_scope": "Docker images/containers/volumes plus installer report evidence",
        "status": "failed",
        "steps": [],
    }

    try:
        copy_source(source)
        write_env(source / ".env")
        normalize_compose_ports(source, api_port=args.api_port, frontend_port=args.frontend_port)
        write_override(source, api_port=args.api_port, frontend_port=args.frontend_port)

        build = run(compose_command(project, source, "build", "api", "frontend"), cwd=source, timeout=1800)
        proof["steps"].append({"name": "compose_build", "returncode": build.returncode, "stdout": build.stdout, "stderr": build.stderr})
        if build.returncode != 0:
            return 1

        up = run(compose_command(project, source, "up", "-d", "api", "frontend"), cwd=source, timeout=900)
        proof["steps"].append({"name": "compose_up", "returncode": up.returncode, "stdout": up.stdout, "stderr": up.stderr})
        if up.returncode != 0:
            return 1

        api_health = wait_for_url(str(proof["api_url"]), timeout_seconds=300)
        proof["steps"].append({"name": "api_health", **api_health})
        frontend_health = wait_for_url(str(proof["frontend_url"]), timeout_seconds=180)
        proof["steps"].append({"name": "frontend_health", **frontend_health})

        playwright = run_playwright(report_dir, frontend_url=str(proof["frontend_url"]))
        proof["steps"].append(
            {
                "name": "playwright_live_ui",
                "returncode": playwright.returncode,
                "stdout": playwright.stdout,
                "stderr": playwright.stderr,
                "desktop_screenshot": str((report_dir / "cleanroom-ui-desktop.png").relative_to(ROOT)),
                "mobile_screenshot": str((report_dir / "cleanroom-ui-mobile.png").relative_to(ROOT)),
            }
        )

        proof["status"] = (
            "passed"
            if api_health["status"] == "passed" and frontend_health["status"] == "passed" and playwright.returncode == 0
            else "failed"
        )
        return 0 if proof["status"] == "passed" else 1
    finally:
        if not args.keep_running:
            down = None
            if source.exists():
                try:
                    down = run(compose_command(project, source, "down", "-v"), cwd=source, timeout=300)
                except OSError as exc:
                    proof["steps"].append({"name": "compose_down", "status": "failed", "error": str(exc)})
            if down is not None:
                proof["steps"].append({"name": "compose_down", "returncode": down.returncode, "stdout": down.stdout, "stderr": down.stderr})
        proof_path.write_text(json.dumps(proof, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(proof, indent=2, sort_keys=True))


if __name__ == "__main__":
    raise SystemExit(main())
