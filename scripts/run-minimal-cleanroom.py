"""Run the generated minimal CivicCore kit in a disposable Linux container."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
GENERATED_KIT = ROOT / "installer" / "generated" / "minimal"
REPORT_ROOT = ROOT / "installer" / "reports"
WHEEL = ROOT.parent / "civiccore" / "dist" / "civiccore-1.0.0-py3-none-any.whl"


def make_run_id() -> str:
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    return f"minimal-cleanroom-{timestamp}-{uuid4().hex[:8]}"


def fail(message: str) -> int:
    print(f"ERROR: {message}", file=sys.stderr)
    return 2


def replace_text(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise RuntimeError(f"Expected text not found in {path}: {old}")
    path.write_text(text.replace(old, new), encoding="utf-8", newline="\n")


def prepare_cleanroom(run_root: Path) -> dict[str, Path]:
    kit_target = run_root / "kit"
    artifacts = run_root / "artifacts"
    if kit_target.exists() or artifacts.exists():
        raise RuntimeError(f"Cleanroom run root already contains prepared inputs: {run_root}")
    shutil.copytree(GENERATED_KIT, kit_target, ignore=shutil.ignore_patterns(".venv"))
    artifacts.mkdir(parents=True, exist_ok=True)
    wheel_target = artifacts / WHEEL.name
    shutil.copy2(WHEEL, wheel_target)

    container_wheel = f"/cleanroom/artifacts/{WHEEL.name}"
    install_sh = kit_target / "install-civiccore.sh"
    requirements = kit_target / "requirements.txt"
    plan = kit_target / "civiccore-install-plan.json"
    old_path = "/mnt/c/dev/Claude/civiccore/dist/civiccore-1.0.0-py3-none-any.whl"
    replace_text(install_sh, old_path, container_wheel)
    requirements.write_text(f"{container_wheel}\n", encoding="utf-8", newline="\n")
    plan_data = json.loads(plan.read_text(encoding="utf-8"))
    plan_data["civiccore"]["cleanroom_artifact"] = container_wheel
    plan_data["cleanroom"] = {
        "runner": "scripts/run-minimal-cleanroom.py",
        "container_mount": "/cleanroom",
        "mutates_host": False,
        "mutates_container": True,
    }
    plan.write_text(json.dumps(plan_data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"kit": kit_target, "artifacts": artifacts, "wheel": wheel_target}


def run_container(*, run_root: Path, image: str) -> subprocess.CompletedProcess[str]:
    command = [
        "docker",
        "run",
        "--rm",
        "-v",
        f"{run_root}:/cleanroom",
        "-w",
        "/cleanroom",
        image,
        "bash",
        "-lc",
        "bash kit/reset-civiccore.sh && bash kit/install-civiccore.sh && bash kit/verify-civiccore.sh",
    ]
    return subprocess.run(
        command,
        cwd=ROOT,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
        timeout=900,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run minimal Townlight Core installer in a cleanroom container.")
    parser.add_argument("--image", default="python:3.12-slim", help="Container image to use.")
    parser.add_argument("--run-id", default=None, help="Evidence run id.")
    args = parser.parse_args()

    if not GENERATED_KIT.is_dir():
        return fail("Generated minimal kit is missing. Run plan-installer.py --profile minimal --generate-install-kit first.")
    if not WHEEL.is_file():
        return fail(f"CivicCore wheel is missing: {WHEEL}")

    run_id = args.run_id or make_run_id()
    run_root = REPORT_ROOT / run_id / "cleanroom"
    run_root.mkdir(parents=True, exist_ok=True)
    prepared = prepare_cleanroom(run_root)
    proc = run_container(run_root=run_root, image=args.image)
    proof = {
        "run_id": run_id,
        "profile": "minimal",
        "module": "civiccore",
        "image": args.image,
        "mutates_host": False,
        "mutates_container": True,
        "generated_kit_source": str(GENERATED_KIT.relative_to(ROOT)),
        "cleanroom_root": str(run_root.relative_to(ROOT)),
        "prepared_files": {key: str(path.relative_to(ROOT)) for key, path in prepared.items()},
        "command": "bash kit/reset-civiccore.sh && bash kit/install-civiccore.sh && bash kit/verify-civiccore.sh",
        "returncode": proc.returncode,
        "stdout": proc.stdout,
        "stderr": proc.stderr,
        "status": "passed" if proc.returncode == 0 and "1.0.0" in proc.stdout else "failed",
    }
    proof_path = REPORT_ROOT / run_id / "cleanroom-proof.json"
    proof_path.write_text(json.dumps(proof, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(proof, indent=2, sort_keys=True))
    return 0 if proof["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
