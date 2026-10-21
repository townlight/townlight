#!/usr/bin/env pwsh
# SPDX-License-Identifier: AGPL-3.0-only
<#
Blocks pushes when the CivicSuite stage branch is in an unsafe state.

This hook is intentionally small and deterministic. It does not replace the
required audit-lite/audit-full process; it catches the recoverability failures
that caused the May 2026 lost-work incident.
#>

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

$branch = (git branch --show-current).Trim()
if (-not $branch) {
    Write-Error "pre-push gate: unable to determine current branch."
    exit 1
}

if ($branch -eq "main" -or $branch -eq "master") {
    Write-Error "pre-push gate: direct pushes from $branch are blocked; use a stage branch and PR/merge."
    exit 1
}

$dirty = git status --porcelain
if ($dirty) {
    Write-Error "pre-push gate: working tree has uncommitted changes. Commit or remove them before pushing."
    $dirty | ForEach-Object { Write-Error "  $_" }
    exit 1
}

$head = (git rev-parse HEAD).Trim()
if ($head -notmatch "^[0-9a-f]{40}$") {
    Write-Error "pre-push gate: HEAD did not resolve to a full 40-character SHA."
    exit 1
}

$baseline = Join-Path $repoRoot "docs\process\city-core-recovery-baseline-2026-05-30.md"
if ($branch -like "stage-0-*") {
    if (-not (Test-Path -LiteralPath $baseline)) {
        Write-Error "pre-push gate: Stage 0 branches must carry the recovery baseline document at $baseline."
        exit 1
    }
}

if ($branch -match "^stage-(?<stageNumber>\d+)-") {
    $stageNumber = $Matches["stageNumber"]
    $ledger = Join-Path $repoRoot "docs\process\stages\$branch.md"
    if (-not (Test-Path -LiteralPath $ledger)) {
        Write-Error "pre-push gate: stage branches must carry a tracked stage ledger at $ledger."
        exit 1
    }

    $ledgerTracked = git ls-files --error-unmatch "docs/process/stages/$branch.md" 2>$null
    if (-not $ledgerTracked) {
        Write-Error "pre-push gate: stage ledger is not tracked by git: $ledger"
        exit 1
    }

    $auditReports = git ls-files "docs/process/audits/audit-lite-stage-$stageNumber-*.md"
    if (-not $auditReports) {
        Write-Error "pre-push gate: stage branches must carry at least one tracked audit-lite report for stage $stageNumber under docs/process/audits/."
        exit 1
    }

    $ledgerText = Get-Content -LiteralPath $ledger -Raw
    if ($ledgerText -notmatch "audit-lite-stage-$stageNumber-") {
        Write-Error "pre-push gate: stage ledger must reference at least one audit-lite report for stage $stageNumber."
        exit 1
    }
}

# Run cargo fmt --check when desktop/src-tauri/src/**/*.rs files are touched in
# the commits about to be pushed. Catches the formatting drift that wastes
# ~1hr of MSI CI per occurrence (the desktop-windows-msi workflow's step 4
# 'Check Rust formatting' fails the build the same way).
#
# Scoped to commits between the remote branch tip and HEAD so it only runs
# when the actual push contains relevant changes - not on every push.
$rustToolchain = Get-Command cargo -ErrorAction SilentlyContinue
if ($rustToolchain) {
    # Determine the range of commits being pushed. If the remote-tracking
    # branch doesn't exist yet (new branch), compare against main.
    $upstream = "origin/$branch"
    $upstreamExists = git rev-parse --verify --quiet $upstream 2>$null
    $baseRef = if ($upstreamExists) { $upstream } else { "origin/main" }
    $rustFilesTouched = git diff --name-only "$baseRef..HEAD" -- "desktop/src-tauri/src/*.rs" 2>$null
    if ($rustFilesTouched) {
        Push-Location (Join-Path $repoRoot "desktop\src-tauri")
        try {
            $fmtOutput = & cargo fmt --check 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Error "pre-push gate: cargo fmt --check FAILED for desktop/src-tauri (the MSI workflow would fail at step 4 'Check Rust formatting'). Run 'cd desktop/src-tauri && cargo fmt' to fix, re-commit, then push again."
                Write-Output $fmtOutput
                exit 1
            }
            Write-Output "pre-push gate: cargo fmt --check passed for desktop/src-tauri"
        } finally {
            Pop-Location
        }
    }
}

Write-Output "pre-push gate: passed for $branch at $head"
