#!/usr/bin/env pwsh
# SPDX-License-Identifier: AGPL-3.0-only
<#
Installs the CivicSuite local Git hooks for this checkout.

Git does not track files inside `.git/hooks`, so each recovered or fresh clone
must run this installer once before pushing stage branches.
#>

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$hooksDir = Join-Path $repoRoot ".git\hooks"
$source = Join-Path $repoRoot "scripts\hooks\pre-push.ps1"
$target = Join-Path $hooksDir "pre-push"

if (-not (Test-Path -LiteralPath $source)) {
    Write-Error "Missing tracked pre-push source: $source"
    exit 1
}

New-Item -ItemType Directory -Force -Path $hooksDir | Out-Null

$hook = @"
#!/bin/sh
exec powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$source"
"@

Set-Content -LiteralPath $target -Value $hook -NoNewline -Encoding ascii

Write-Output "Installed CivicSuite pre-push hook at $target"
