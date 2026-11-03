"""Build and inspect the exact local wheels used by the bounded Compose demo."""
from __future__ import annotations

import argparse
from email.parser import BytesParser
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import tomllib
import zipfile

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

ROOT = Path(__file__).resolve().parents[1]
KEYS = ("core", "meetings", "code", "zoning")


def state():
    return json.loads((ROOT / "config/suite-state.json").read_text(encoding="utf-8"))


def wheel_name(module):
    return (module["legacy"]["package_names"][0].replace("-", "_") + "-"
            + module["versions"]["installer"] + "-py3-none-any.whl")


def components(all_products=False, manifest=None):
    manifest = state() if manifest is None else manifest
    modules = dict(manifest["modules"])
    if all_products:
        modules["runtime"] = {
            "legacy": {"package_names": ["townlight-runtime"]},
            "versions": {"installer": manifest["desktop_release"]["runtime_version"]},
            "installer": {"source_commit": manifest["desktop_release"]["commit"]},
            "repository": {"name": "townlight/townlight",
                           "manifest_path": "desktop/runtime/python-services/pyproject.toml"},
        }
    return modules


def inspect_wheels(directory, *, allow_working_tree=False, all_products=False, manifest=None):
    errors = []
    modules = components(all_products, manifest)
    if all_products and not re.fullmatch(r"[0-9a-f]{40}", modules["runtime"]["installer"]["source_commit"] or ""):
        return ["runtime source requires a bound exact umbrella commit"]
    receipt_name = "suite-wheels.json" if all_products else "demo-wheels.json"
    try:
        receipt = json.loads((directory / receipt_name).read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        return [f"cannot read demo wheel provenance: {exc}"]
    core_version = modules["core"]["versions"]["installer"]
    for key in (modules if all_products else KEYS):
        module = modules[key]
        name = wheel_name(module)
        path = directory / name
        item = receipt.get(key, {})
        try:
            if path.is_symlink() or not path.is_file():
                raise ValueError("wheel must be a regular file")
            if item.get("name") != name or item.get("repository") != module["repository"]["name"]:
                raise ValueError("receipt distribution/repository differs")
            if not allow_working_tree and (item.get("dirty") or item.get("source_commit") != module["installer"]["source_commit"]):
                raise ValueError("wheel source is not the clean canonical source pin")
            if hashlib.sha256(path.read_bytes()).hexdigest() != item.get("sha256"):
                raise ValueError("wheel hash differs from receipt")
            with zipfile.ZipFile(path) as archive:
                metadata_names = [n for n in archive.namelist() if n.endswith(".dist-info/METADATA")]
                if len(metadata_names) != 1:
                    raise ValueError("wheel must have exactly one metadata record")
                metadata = BytesParser().parsebytes(archive.read(metadata_names[0]))
                if canonicalize_name(metadata["Name"]) != canonicalize_name(module["legacy"]["package_names"][0]) or metadata["Version"] != module["versions"]["installer"]:
                    raise ValueError("wheel distribution/version differs")
                principal = module["legacy"]["package_names"][0].replace("-", "_")
                if not any(n.startswith(principal + "/") for n in archive.namelist()):
                    raise ValueError("principal import missing")
                if key == "runtime":
                    required = {
                        "townlight_runtime/townlight_records_alembic/alembic.ini",
                        "townlight_runtime/townlight_records_alembic/alembic/script.mako",
                        "townlight_runtime/townlight_records_alembic/alembic/script.py.mako",
                    }
                    if not required <= set(archive.namelist()):
                        raise ValueError("Records migration configuration/templates missing from runtime wheel")
                if key not in ("core", "station", "runtime"):
                    requirements = [Requirement(line) for line in metadata.get_all("Requires-Dist", [])]
                    requires_core = [r for r in requirements if canonicalize_name(r.name) == "townlight-core"]
                    if len(requires_core) != 1 or requires_core[0].url or str(requires_core[0].specifier) != "==" + core_version or requires_core[0].marker:
                        raise ValueError("Core dependency must be unconditional and pinned to " + core_version)
        except (OSError, ValueError, KeyError, zipfile.BadZipFile) as exc:
            errors.append(f"{key}: {exc}")
    return errors


def build(directory, workspace=None, allow_working_tree=False, all_products=False, selected_keys=None, manifest=None):
    if allow_working_tree and workspace is None:
        raise ValueError("working-tree builds require an explicit local workspace")
    modules = components(all_products, manifest)
    if all_products and not re.fullmatch(r"[0-9a-f]{40}", modules["runtime"]["installer"]["source_commit"] or ""):
        raise ValueError("runtime source requires a bound exact umbrella commit")
    directory.mkdir(parents=True, exist_ok=True)
    receipt_name = "suite-wheels.json" if all_products else "demo-wheels.json"
    receipt = (json.loads((directory / receipt_name).read_text(encoding="utf-8"))
               if selected_keys else {})
    with tempfile.TemporaryDirectory(prefix="townlight-demo-source-") as temp:
        keys = tuple(modules) if all_products else KEYS
        if selected_keys and not set(selected_keys) <= set(keys):
            raise ValueError("selected component outside this build cohort")
        for key in (selected_keys or keys):
            module = modules[key]
            repository = module["repository"]["name"]
            commit = module["installer"]["source_commit"]
            if not re.fullmatch(r"townlight/[a-z]+", repository) or not isinstance(commit, str) or not re.fullmatch(r"[0-9a-f]{40}", commit):
                raise ValueError("invalid repository/source pin")
            repo = (workspace if workspace else Path(temp)) / repository.split("/")[1]
            if workspace is None:
                subprocess.run(["git", "init", "--quiet", str(repo)], check=True)
                subprocess.run(["git", "-C", str(repo), "fetch", "--depth=1", "https://github.com/" + repository + ".git", commit], check=True)
                subprocess.run(["git", "-C", str(repo), "checkout", "--detach", "--quiet", "FETCH_HEAD"], check=True)
            actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
            dirty = bool(subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=repo))
            if not allow_working_tree and (actual != commit or dirty):
                raise ValueError(f"{key}: source must match clean canonical pin")
            manifest_path = repo / module["repository"]["manifest_path"]
            metadata = tomllib.loads(manifest_path.read_text(encoding="utf-8"))["project"]
            if metadata["name"] != module["legacy"]["package_names"][0] or metadata["version"] != module["versions"]["installer"]:
                raise ValueError(f"{key}: source distribution/version differs")
            # Setuptools creates another nested build tree. Stage a source copy
            # under the short task TEMP rather than exceeding Windows MAX_PATH
            # in a deep checkout (notably the runtime's Records migrations).
            with tempfile.TemporaryDirectory(prefix="tl-wheel-") as staging:
                source = Path(staging) / "src"
                output = Path(staging) / "out"
                shutil.copytree(manifest_path.parent, source, ignore=shutil.ignore_patterns(
                    ".git", "node_modules", "build", "dist", "*.egg-info",
                    ".venv", "__pycache__", ".pytest_cache", ".candidate-wheels"))
                subprocess.run([sys.executable, "-m", "build", "--wheel", "--outdir", str(output), str(source)], check=True)
                wheel = output / wheel_name(module)
                content = wheel.read_bytes()
                (directory / wheel.name).write_bytes(content)
                receipt[key] = dict(name=wheel.name, repository=repository, source_commit=actual,
                                    dirty=dirty, sha256=hashlib.sha256(content).hexdigest())
    (directory / receipt_name).write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
    errors = inspect_wheels(directory, allow_working_tree=allow_working_tree, all_products=all_products, manifest=manifest)
    if errors:
        raise ValueError("; ".join(errors))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".candidate-wheels")
    parser.add_argument("--workspace", type=Path)
    parser.add_argument("--allow-working-tree", action="store_true", help="Preparation only; not clean-pin/release evidence")
    parser.add_argument("--all-products", action="store_true", help="Build all eleven suite components plus the runtime bridge")
    parser.add_argument("--only", nargs="+", help="Rebuild selected components in an existing receipt; reverify the entire cohort")
    parser.add_argument("--state", type=Path, help="Externally bound exact candidate state for the full suite")
    args = parser.parse_args()
    manifest = json.loads(args.state.read_text(encoding="utf-8")) if args.state else None
    build(args.output.resolve(), args.workspace.resolve() if args.workspace else None, args.allow_working_tree, args.all_products, args.only, manifest)
