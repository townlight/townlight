"""Pinned source and exact-artifact verification for prepared and published cohorts."""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
import re
from pathlib import Path
from html.parser import HTMLParser
import subprocess
import tomllib
import urllib.request
import zipfile
from email.parser import BytesParser

from suite_state import ROOT, load_json, validate_all


def github_json(path):
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "Townlight-candidate-verifier"}
    token = os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request("https://api.github.com/" + path, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def pinned_file(repository, commit, name, workspace, remote):
    if remote:
        item = github_json(f"repos/{repository}/contents/{name}?ref={commit}")
        return base64.b64decode(item["content"])
    repo = workspace / repository.split("/", 1)[1]
    return subprocess.check_output(["git", "show", f"{commit}:{name}"], cwd=repo, stderr=subprocess.PIPE)


def verify_pinned_metadata(state, read_file):
    """Inspect the committed provider itself; agreement between projections is insufficient."""
    errors = []
    for key, module in state["modules"].items():
        repository = module["repository"]
        commit = module["installer"]["source_commit"]
        try:
            data = tomllib.loads(read_file(repository["name"], commit, repository["manifest_path"]).decode("utf-8-sig"))["project"]
            expected = module["legacy"]["package_names"][0]
            if data["name"] != expected:
                errors.append(f"{key}: pinned distribution {data['name']!r} differs from {expected!r}")
            for field in ("development", "installer", "public_status"):
                if data["version"] != module["versions"][field]:
                    errors.append(f"{key}: pinned package version {data['version']} differs from {field} {module['versions'][field]}")
        except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
            errors.append(f"{key}: cannot inspect pinned source ({type(error).__name__})")
    desktop = state["desktop_release"]
    if desktop["commit"] is None:
        return errors + ["desktop: bind the exact clean candidate source commit before verification"]
    try:
        metadata = json.loads(read_file("townlight/townlight", desktop["commit"], "desktop/package.json"))
        native = tomllib.loads(read_file("townlight/townlight", desktop["commit"], "desktop/src-tauri/Cargo.toml").decode())
        runtime = tomllib.loads(read_file("townlight/townlight", desktop["commit"], "desktop/runtime/python-services/pyproject.toml").decode())["project"]
        if metadata["version"] != desktop["version"] or native["package"]["version"] != desktop["version"]:
            errors.append("desktop: pinned browser/native version differs from candidate")
        if runtime["name"] != "townlight-runtime" or runtime["version"] != desktop["runtime_version"]:
            errors.append("runtime: pinned distribution/version differs from candidate")
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        errors.append(f"desktop: cannot inspect pinned source ({type(error).__name__})")
    return errors


def verify_artifacts(state, receipt, directory):
    errors = []
    desktop = state["desktop_release"]
    if desktop["commit"] is None:
        return ["artifact receipt: bind the exact desktop source before verifying artifacts"]
    if receipt.get("desktop_version") != desktop["version"] or receipt.get("source_commit") != desktop["commit"]:
        errors.append("artifact receipt: candidate version/source pin differs")
    artifacts = receipt.get("artifacts", [])
    if not isinstance(artifacts, list) or not all(isinstance(item, dict) for item in artifacts):
        return errors + ["artifact receipt: artifacts must be a list of objects"]
    kinds = {item.get("kind") for item in artifacts}
    if not {"msi", "source", "acceptance"} <= kinds:
        errors.append("artifact receipt: MSI, corresponding source and acceptance evidence are required")
    seen = set()
    for item in artifacts:
        name = item.get("name", "")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._+-]*", name) or name in seen:
            errors.append("artifact receipt: unsafe or duplicate asset name")
            continue
        seen.add(name)
        path = directory / name
        if path.is_symlink():
            errors.append(f"artifact must be a regular file: {name}")
            continue
        if not path.is_file():
            errors.append(f"artifact missing: {name}")
            continue
        with path.open("rb") as stream:
            digest = hashlib.file_digest(stream, "sha256").hexdigest()
        if digest != item.get("sha256") or path.stat().st_size != item.get("size_bytes"):
            errors.append(f"artifact integrity mismatch: {name}")
    packages = [(module["legacy"]["package_names"][0], module["versions"]["installer"])
                for module in state["modules"].values()]
    packages.append(("townlight-runtime", desktop["runtime_version"]))
    for distribution, version in packages:
        matches = list(directory.glob(distribution.replace("-", "_") + "-" + version + "-*.whl"))
        if len(matches) != 1:
            errors.append(f"exact wheel missing or ambiguous: {distribution} {version}")
            continue
        if matches[0].name not in seen:
            errors.append(f"wheel missing from hashed artifact receipt: {distribution}")
        try:
            with zipfile.ZipFile(matches[0]) as wheel:
                names = [name for name in wheel.namelist() if name.endswith(".dist-info/METADATA")]
                metadata = BytesParser().parsebytes(wheel.read(names[0])) if len(names) == 1 else {}
                if metadata.get("Name") != distribution or metadata.get("Version") != version:
                    errors.append(f"wheel metadata mismatch: {distribution}")
                if not any(name.startswith(distribution.replace('-', '_') + '/') for name in wheel.namelist()):
                    errors.append(f"principal import missing from wheel: {distribution}")
        except (OSError, zipfile.BadZipFile, KeyError):
            errors.append(f"unreadable wheel: {distribution}")
    return errors


class TableRows(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.current = []

    def handle_data(self, data):
        if self.current is not None:
            self.current.append(data)

    def handle_endtag(self, tag):
        if tag == "tr" and self.current is not None:
            self.rows.append(" ".join(self.current))
            self.current = None


def verify_documentation(state, read_file):
    """Read actual built current tables, including the Meetings manual."""
    errors = []
    all_packages = [(module["legacy"]["package_names"][0], module["versions"]["installer"])
                    for module in state["modules"].values()]
    all_packages.append(("townlight-runtime", state["desktop_release"]["runtime_version"]))
    meetings = state["modules"]["meetings"]
    for name, expected in [("versions.html", all_packages), ("manuals/suite.html", all_packages),
                           ("manuals/meetings.html", [(meetings["legacy"]["package_names"][0], meetings["versions"]["installer"])])]:
        try:
            parser = TableRows()
            parser.feed(read_file(name).decode("utf-8-sig"))
            for package, version in expected:
                if not any(re.search(r"(?<![\w-])" + re.escape(package) + r"(?![\w-])", row)
                           and re.search(r"(?<![\w.+-])" + re.escape(version) + r"(?![\w.+-])", row)
                           for row in parser.rows):
                    errors.append(f"{name}: current table missing {package} {version}")
        except (OSError, ValueError, UnicodeError) as error:
            errors.append(f"{name}: cannot read built documentation ({type(error).__name__})")
    return errors


def verify_delivered(state, receipt):
    errors = []
    release = github_json("repos/townlight/townlight/releases/tags/" + state["desktop_release"]["tag"])
    if release.get("draft"):
        errors.append("release remains a draft")
    if release.get("target_commitish") != state["desktop_release"]["commit"]:
        # Resolve the tag itself; releases may retain a branch name as target_commitish.
        tag = github_json("repos/townlight/townlight/commits/" + state["desktop_release"]["tag"])
        if tag.get("sha") != state["desktop_release"]["commit"]:
            errors.append("published tag points at a different source commit")
    assets = {item["name"]: item for item in release.get("assets", [])}
    for item in receipt["artifacts"]:
        asset = assets.get(item["name"])
        if not asset:
            errors.append(f"published asset missing: {item['name']}")
            continue
        digest = hashlib.sha256()
        size = 0
        with urllib.request.urlopen(asset["browser_download_url"], timeout=60) as response:
            while chunk := response.read(1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
        if digest.hexdigest() != item["sha256"] or size != item["size_bytes"]:
            errors.append(f"published bytes differ: {item['name']}")
    def read_document(name):
        request = urllib.request.Request("https://townlight.github.io/" + name,
                                         headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.read()
    errors.extend(verify_documentation(state, read_document))
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, default=ROOT.parent)
    parser.add_argument("--remote-only", action="store_true", help="Read exact pinned commits through GitHub, never branch heads.")
    parser.add_argument("--mode", choices=("candidate", "published"), default="candidate")
    parser.add_argument("--artifacts", type=Path, help="Directory containing candidate receipt, MSI, source, evidence and wheels.")
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--docs-root", type=Path, help="Built site to check before publication.")
    parser.add_argument("--state", type=Path, default=ROOT / "config/suite-state.json")
    parser.add_argument("--bind-local-desktop", type=Path,
                        help="Verify and write a new external state receipt bound to the clean local umbrella HEAD")
    args = parser.parse_args()
    errors = validate_all(state_path=args.state)
    state = load_json(args.state)
    if args.bind_local_desktop:
        if args.remote_only or args.mode != "candidate" or args.artifacts:
            parser.error("desktop binding requires local candidate source verification before artifact verification")
        output = args.bind_local_desktop.resolve()
        umbrella = (args.workspace / "townlight").resolve()
        if output.is_relative_to(umbrella) or output.exists():
            parser.error("bound state must be a new file outside the umbrella source tree")
        if not errors:
            try:
                state = bind_local_desktop(state, umbrella)
            except (OSError, ValueError, subprocess.CalledProcessError) as error:
                errors.append(str(error))
    if not errors:
        errors.extend(verify_pinned_metadata(state, lambda repository, commit, name:
            pinned_file(repository, commit, name, args.workspace, args.remote_only)))
    receipt = None
    if args.artifacts:
        receipt = load_json(args.receipt or args.artifacts / "candidate-artifacts.json")
        errors.extend(verify_artifacts(state, receipt, args.artifacts))
        if args.docs_root is None:
            errors.append("Final candidate verification requires --docs-root for the built current site.")
    if args.docs_root:
        errors.extend(verify_documentation(state, lambda name: (args.docs_root / name).read_bytes()))
    if args.mode == "published":
        if receipt is None:
            errors.append("Published verification requires the exact candidate artifact receipt.")
        elif not errors:
            errors.extend(verify_delivered(state, receipt))
    if args.bind_local_desktop and not errors:
        with output.open("x", encoding="utf-8") as stream:
            json.dump(state, stream, indent=2)
            stream.write("\n")
    print(json.dumps({"status": "fail" if errors else "pass", "mode": args.mode,
        "source_checks": "pinned commits", "artifact_checks": bool(args.artifacts),
        "errors": errors}, indent=2))
    return bool(errors)


def bind_local_desktop(state, umbrella):
    desktop = state["desktop_release"]
    if desktop["channel"] != "candidate" or desktop["published_at"] is not None or desktop["commit"] is not None:
        raise ValueError("desktop source binding requires an unbound unpublished candidate")
    top = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], cwd=umbrella, text=True).strip()).resolve()
    if top != umbrella.resolve():
        raise ValueError("umbrella source path is not an exact Git root")
    if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=normal"], cwd=umbrella):
        raise ValueError("umbrella source must be clean before binding its build commit")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=umbrella, text=True).strip()
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("invalid umbrella source commit")
    return {**state, "desktop_release": {**desktop, "commit": commit}}
