param(
    [long]$BuildRun,
    [long]$SigningRun,
    [ValidatePattern('^[0-9a-f]{40}$')]
    [string]$SourceCommit
)

$ErrorActionPreference = 'Stop'

$build = gh run view $BuildRun --repo townlight/townlight --json status,conclusion,headSha,workflowName,event | ConvertFrom-Json

if ($LASTEXITCODE -ne 0 -or
    $build.status -ne 'completed' -or
    $build.conclusion -ne 'success' -or
    $build.headSha -ne $SourceCommit -or
    $build.workflowName -ne 'desktop-windows-msi' -or
    $build.event -ne 'workflow_dispatch') {
    throw "Build run $BuildRun does not satisfy required build preconditions."
}

$signing = gh run view $SigningRun --repo townlight/townlight --json status,conclusion,headBranch,workflowName,event | ConvertFrom-Json

if ($LASTEXITCODE -ne 0 -or
    $signing.status -ne 'completed' -or
    $signing.conclusion -ne 'success' -or
    $signing.headBranch -ne 'main' -or
    $signing.workflowName -ne 'Sign private native payload' -or
    $signing.event -ne 'workflow_dispatch') {
    throw "Signing run $SigningRun does not satisfy required signing preconditions."
}

git merge-base --is-ancestor $SourceCommit HEAD
if ($LASTEXITCODE -ne 0) {
    throw "Source commit $SourceCommit is not an ancestor of HEAD."
}

git diff --exit-code $SourceCommit HEAD -- desktop/src desktop/src-tauri desktop/runtime config installer portal
if ($LASTEXITCODE -ne 0) {
    throw "Compiled inputs differ between $SourceCommit and HEAD."
}

[pscustomobject]@{
    source_commit = $SourceCommit
    build_run = $BuildRun
    signing_run = $SigningRun
    harness_commit = (git rev-parse HEAD)
}