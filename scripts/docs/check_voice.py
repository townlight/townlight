#!/usr/bin/env python3
"""Voice-standard gate for visitor-facing docs.

Enforces docs/design/civicsuite-voice-standard.md Section 6. That doc is the
source of truth for the words; this script is its enforcement. Denylist
additions land in the doc first, then here.

Scope: the visitor-facing set only (Section 6). Internal roadmap/ADR/audit docs
and the changelog keep the private vocabulary and are NOT scanned.

Exit 1 on any HARD finding; SOFT findings warn only. Run from repo root:
    python scripts/docs/check_voice.py
    python scripts/docs/check_voice.py --selftest
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# The visitor-facing set (voice-standard Section 6). Release bodies and
# discussions live off-repo and are checked at publish time, not here.
VISITOR_FILES = [
    "README.md",
    "STATUS.md",
    "FAQ.md",
    "USER-MANUAL.md",
    "ANNOUNCEMENT.md",
    "PROVENANCE.md",
    "ARCHITECTURE.md",
    "docs/compatibility/index.md",
    "docs/troubleshooting.md",
    "docs/installer/operator-walkthrough.md",
]

# --- §2 jargon denylist (HARD). Left column of the glossary. --------------
JARGON = [
    r"release cars?",
    r"demotion-truth",
    r"truth-repair demotion",
    r"no-functional-upgrade demotion",
    r"promotion package",
    r"post-starter module label",
    r"truth-reconciled",
    r"city_core_beta_ready_truth_reconciled",
    r"matching-host",
    r"recovery gates",
    r"release-recovery gates",
    r"recovery patch required",
    r"\bQA-B1\b",
    r"\b(?:YELLOW|GREEN) beta\b",
    r"the active suite integration target",
]

# --- §3 leakage denylist (HARD). Developer/agent artifacts. ---------------
LEAKAGE = [
    (r"\bScott\b", "personal name — use 'the project owner'"),
    (r"C:\\+dev\\+Claude", "local machine path"),
    (r"~/\.claude", "local machine path"),
    (r"bridge/for-scott", "internal agent path"),
    (r"\(Cowork-local\)", "internal agent artifact"),
    (r"\.agent-runs\b", "internal agent path"),
    (r"\bgauntletgate\b", "internal tool/lane name"),
    (r"CIVIC[A-Z_]*_TOKEN", "secret name must not appear"),
    (r"render_topology\.py --", "maintainer instruction — keep in an HTML comment"),
]

# --- §3 check 3 unlinked internal references (SOFT for v1). ----------------
# A bare internal ref not wrapped in a markdown link. False-positive-prone
# (link syntax detection), so it warns until proven clean.
UNLINKED_REFS = [r"PR #\d+", r"\brun \d{6,}", r"\bADR-\d"]


def read(rel: str) -> str | None:
    p = ROOT / rel
    return p.read_text(encoding="utf-8") if p.exists() else None


def strip_code_and_comments(text: str) -> str:
    """Blank out (preserving line numbers) content the writer does not control
    or that is correctly hidden: HTML comments, fenced code, and generated
    blocks (which render machine values like installer_status labels). Replace
    with same-line-count blanks so reported line numbers stay accurate."""
    def blank(m: re.Match) -> str:
        return "\n" * m.group(0).count("\n")
    # Generated blocks FIRST — their own marker comments must survive to anchor
    # this match before the HTML-comment strip removes them.
    text = re.sub(r"<!--\s*BEGIN GENERATED.*?END GENERATED[^-]*-->",
                  blank, text, flags=re.DOTALL)
    text = re.sub(r"<!--.*?-->", blank, text, flags=re.DOTALL)
    text = re.sub(r"```.*?```", blank, text, flags=re.DOTALL)
    return text


def line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def markdown_links(text: str):
    """Yield (start, end) spans covered by markdown links [text](url), so a
    reference inside a link is not counted as 'bare'."""
    return [(m.start(), m.end()) for m in re.finditer(r"\[[^\]]*\]\([^)]*\)", text)]


def scan_file(rel: str, hard: list, soft: list) -> None:
    raw = read(rel)
    if raw is None:
        return
    text = strip_code_and_comments(raw)

    for pat in JARGON:
        for m in re.finditer(pat, text, re.IGNORECASE):
            hard.append((rel, line_of(text, m.start()), f"banned jargon: '{m.group(0)}'"))

    for pat, why in LEAKAGE:
        for m in re.finditer(pat, text):
            hard.append((rel, line_of(text, m.start()), f"leakage ({why}): '{m.group(0)}'"))

    # Unlinked internal refs (§3 check 3, SOFT). Prose only — markdown table
    # rows (history/evidence tables) are reference data, not visitor prose, and
    # linking hundreds of archived run IDs is not the point.
    link_spans = markdown_links(text)
    lines = text.splitlines()
    for pat in UNLINKED_REFS:
        for m in re.finditer(pat, text):
            ln = line_of(text, m.start())
            if lines[ln - 1].lstrip().startswith("|"):
                continue
            if any(a <= m.start() < b for a, b in link_spans):
                continue
            soft.append((rel, ln,
                         f"internal ref not a link: '{m.group(0)}' (link it or cut it)"))

    # §5 version-pinned link that floats to /latest (HARD).
    for m in re.finditer(r"\[[^\]]*v\d+\.\d+\.\d+[^\]]*\]\(([^)]*)\)", text):
        if "/releases/latest" in m.group(1):
            hard.append((rel, line_of(text, m.start()),
                         "version-named link points at /latest — pin it to the tag URL"))

    # §5 dead relative links (HARD). Skip external/anchor/mailto.
    for m in re.finditer(r"\]\(([^)]+)\)", text):
        href = m.group(1).split()[0].strip()
        if href.startswith(("http://", "https://", "#", "mailto:")):
            continue
        target = href.split("#", 1)[0]
        if not target:
            continue
        if not (ROOT / (Path(rel).parent / target)).resolve().exists():
            hard.append((rel, line_of(text, m.start()), f"dead relative link: '{href}'"))


def cross_file_soft(soft: list) -> None:
    """§5 soft: same MSI size quoted with divergent values across the set."""
    sizes = {}
    for rel in VISITOR_FILES:
        raw = read(rel)
        if raw is None:
            continue
        for m in re.finditer(r"(\d\.\d{1,2})\s*GB MSI|MSI[^.]{0,40}?(\d\.\d{1,2})\s*GB", raw):
            val = m.group(1) or m.group(2)
            sizes.setdefault(val, []).append(rel)
    if len(sizes) > 1:
        soft.append(("(cross-file)", 0,
                     f"MSI size quoted as divergent values: {dict(sizes)}"))


def run() -> int:
    hard: list = []
    soft: list = []
    for rel in VISITOR_FILES:
        scan_file(rel, hard, soft)
    cross_file_soft(soft)

    if soft:
        print("Voice gate — WARNINGS (do not fail the build):")
        for rel, ln, msg in soft:
            print(f"  WARN  {rel}:{ln}  {msg}")
    if hard:
        print("Voice gate — FAILURES:")
        for rel, ln, msg in hard:
            print(f"  FAIL  {rel}:{ln}  {msg}")
        print(f"\n{len(hard)} hard finding(s). See docs/design/civicsuite-voice-standard.md.")
        return 1
    print(f"Voice gate PASS — {len(VISITOR_FILES)} visitor docs clean"
          + (f" ({len(soft)} warning(s))" if soft else "") + ".")
    return 0


def selftest() -> int:
    """Prove the denylists actually catch and the good path passes."""
    hard, soft = [], []
    # A known-bad blob run through the same detectors.
    bad = "The release car shipped; ask Scott. See PR #99 for QA-B1 details."
    text = strip_code_and_comments(bad)
    for pat in JARGON:
        for m in re.finditer(pat, text, re.IGNORECASE):
            hard.append(("x", 1, m.group(0)))
    for pat, _ in LEAKAGE:
        for m in re.finditer(pat, text):
            hard.append(("x", 1, m.group(0)))
    assert any("release car" in h[2] for h in hard), "jargon not caught"
    assert any(h[2] == "Scott" for h in hard), "name not caught"
    assert any("QA-B1" in h[2] for h in hard), "QA-B1 not caught"
    # A linked reference must NOT be flagged as a bare ref.
    good = "See [PR #99](https://github.com/townlight/townlight/pull/99)."
    spans = markdown_links(good)
    m = re.search(r"PR #\d+", good)
    assert any(a <= m.start() < b for a, b in spans), "linked ref wrongly flagged"
    print("selftest OK")
    return 0


if __name__ == "__main__":
    sys.exit(selftest() if "--selftest" in sys.argv else run())
