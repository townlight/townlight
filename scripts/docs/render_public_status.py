#!/usr/bin/env python3
"""Render public module status from the single machine source.

Source of truth: installer/modules.public-status.json — the verified public
status for the kept modules (grades, dates, notes, badge labels). This script:

  1. CROSS-CHECKS the status file against installer/modules.json
     (same module id set; current_version and townlight_core_requirement agree).
     Note: the status file's `arch_tier` is ARCHITECTURE.md's public taxonomy;
     modules.json's `tier` is the installer's internal grouping — deliberately
     NOT compared.
  2. CROSS-CHECKS module versions against docs/compatibility/index.md rows.
  3. EMITS the module explorer's embedded data block
     (docs/module-explorer.html, <script id="modules-data">).
  4. EMITS STATUS.md's generated module-status block (legend + table) between
     BEGIN/END GENERATED MODULE STATUS markers.

Usage:  python scripts/docs/render_public_status.py --write | --check
Same idiom as scripts/docs/render_topology.py: --write regenerates, --check
fails (exit 1) if any emitted block is stale or a cross-check fails.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STATUS_JSON = ROOT / "installer" / "modules.public-status.json"
MODULES_JSON = ROOT / "installer" / "modules.json"
EXPLORER = ROOT / "docs" / "module-explorer.html"
STATUS_MD = ROOT / "STATUS.md"
COMPAT_MD = ROOT / "docs" / "compatibility" / "index.md"

MD_BEGIN = "<!-- BEGIN GENERATED MODULE STATUS (scripts/docs/render_public_status.py) -->"
MD_END = "<!-- END GENERATED MODULE STATUS -->"
HTML_BEGIN = '<script type="application/json" id="modules-data">'
HTML_END = "</script>"


def load() -> tuple[dict, dict]:
    status = json.loads(STATUS_JSON.read_text(encoding="utf-8"))
    modules = json.loads(MODULES_JSON.read_text(encoding="utf-8-sig"))
    return status, modules


def cross_check(status: dict, modules: dict) -> list[str]:
    errors: list[str] = []
    mj = modules["modules"]
    mj_by_id = mj if isinstance(mj, dict) else {m["id"]: m for m in mj}
    st_by_id = {m["id"]: m for m in status["modules"]}

    missing = set(mj_by_id) - set(st_by_id)
    extra = set(st_by_id) - set(mj_by_id)
    if missing:
        errors.append(f"modules missing from public-status: {sorted(missing)}")
    if extra:
        errors.append(f"public-status modules not in modules.json: {sorted(extra)}")

    for mid in sorted(set(mj_by_id) & set(st_by_id)):
        mv = mj_by_id[mid].get("current_version")
        sv = st_by_id[mid].get("current_version")
        if mv is not None and sv is not None and mv != sv:
            errors.append(f"{mid}: current_version disagrees (modules.json={mv}, public-status={sv})")
        mr = mj_by_id[mid].get("townlight_core_requirement")
        sr = st_by_id[mid].get("townlight_core_requirement")
        if mr != sr:
            errors.append(f"{mid}: townlight_core_requirement disagrees (modules.json={mr}, public-status={sr})")

    # Compat matrix rows: | moduleid | repo | version | ...
    compat = COMPAT_MD.read_text(encoding="utf-8")
    for row in re.finditer(r"^\|\s*([a-z0-9_-]+)\s*\|\s*(?:Townlight|townlight)/[a-z0-9.-]+\s*\|\s*([^\s|]+)\s*\|",
                           compat, re.MULTILINE):
        mid, ver = row.group(1), row.group(2)
        if mid in st_by_id and st_by_id[mid].get("current_version") not in (None, ver):
            errors.append(f"{mid}: compat matrix says {ver}, public-status says "
                          f"{st_by_id[mid]['current_version']}")
    return errors


def explorer_payload(status: dict) -> str:
    data = {
        "grade_labels": status["grade_labels"],
        "grade_order": status["grade_order"],
        "grade_dot": status["grade_dot"],
        "tier_names": status["tier_names"],
        "modules": [
            {
                "id": m["id"], "name": m["name"], "tier": m["arch_tier"],
                "current_version": m["current_version"],
                "townlight_core_requirement": m["townlight_core_requirement"],
                "public_status": m["public_status"],
            }
            for m in status["modules"]
        ],
    }
    return json.dumps(data, indent=1, ensure_ascii=False)


def status_md_block(status: dict) -> str:
    lines = [MD_BEGIN, "",
             "## Status Legend", "",
             "Status labels below are the suite's shared status set, generated from",
             (
                 "[`installer/modules.public-status.json`](installer/modules.public-status.json)"
                 " — the same source the [module explorer](docs/module-explorer.html) renders."
             ), ""]
    for g in status["grade_order"]:
        lines.append(f"- **{status['grade_labels'][g]}:** {status['grade_desc'][g]}")
    lines += ["", f"## Module Status ({len(status['modules'])} kept modules)", "",
              "| Module | Version | Status | Released | Note |",
              "|---|---|---|---|---|"]
    for m in status["modules"]:
        ps = m["public_status"]
        ver = m["current_version"] or "—"
        rel = ps["released_date"] or "—"
        lines.append(f"| {m['name']} | {ver} | {status['grade_labels'][ps['grade']]} "
                     f"| {rel} | {ps['note']} |")
    lines += ["", MD_END]
    return "\n".join(lines)


def replace_span(text: str, begin: str, end: str, new_inner: str, label: str) -> str:
    start = text.find(begin)
    if start < 0:
        raise SystemExit(f"FAIL: {label}: begin marker not found")
    close = text.find(end, start + len(begin))
    if close < 0:
        raise SystemExit(f"FAIL: {label}: end marker not found")
    return text[: start + len(begin)] + new_inner + text[close:]


def render(status: dict) -> dict[Path, str]:
    out: dict[Path, str] = {}

    html = EXPLORER.read_text(encoding="utf-8")
    out[EXPLORER] = replace_span(html, HTML_BEGIN, HTML_END,
                                 "\n" + explorer_payload(status) + "\n", "explorer")

    md = STATUS_MD.read_text(encoding="utf-8")
    block = status_md_block(status)
    start = md.find(MD_BEGIN)
    if start < 0:
        raise SystemExit("FAIL: STATUS.md: BEGIN GENERATED MODULE STATUS marker not found")
    close = md.find(MD_END, start)
    if close < 0:
        raise SystemExit("FAIL: STATUS.md: END GENERATED MODULE STATUS marker not found")
    out[STATUS_MD] = md[:start] + block + md[close + len(MD_END):]
    return out


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--check"
    status, modules = load()

    errors = cross_check(status, modules)
    if errors:
        print("FAIL: public-status cross-checks:")
        for e in errors:
            print(f"  - {e}")
        return 1

    rendered = render(status)
    stale = [p for p, new in rendered.items()
             if p.read_text(encoding="utf-8") != new]

    if mode == "--write":
        for p, new in rendered.items():
            p.write_text(new, encoding="utf-8", newline="\n")
        print(f"OK: wrote {len(rendered)} file(s); cross-checks pass")
        return 0

    if stale:
        for p in stale:
            print(f"FAIL: {p.relative_to(ROOT)} is stale. "
                  f"Run python scripts/docs/render_public_status.py --write")
        return 1
    print("PASS: public-status blocks match installer/modules.public-status.json; cross-checks pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
