function Get-UlePortalIdentity {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Checkout,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedCommit
    )

    if ($ExpectedCommit -cnotmatch '^[0-9a-f]{40}$') {
        throw "ExpectedCommit must be exactly 40 lowercase hexadecimal characters."
    }

    $resolved = Resolve-Path -LiteralPath $Checkout -ErrorAction Stop
    $root = $resolved.Path

    $top = & git -C $root rev-parse --show-toplevel 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "git rev-parse --show-toplevel failed for '$root' with exit code $LASTEXITCODE."
    }

    $top = [IO.Path]::GetFullPath(($top | Out-String).Trim())
    if (-not [StringComparer]::OrdinalIgnoreCase.Equals($top, $root)) {
        throw "Checkout root '$root' is not the git top-level '$top'."
    }

    $head = & git -C $root rev-parse HEAD 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "git rev-parse HEAD failed for '$root' with exit code $LASTEXITCODE."
    }

    $head = ($head | Out-String).Trim()
    if (-not ($head -ceq $ExpectedCommit)) {
        throw "HEAD '$head' does not match expected commit '$ExpectedCommit'."
    }

    $status = & git -C $root status --porcelain 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "git status --porcelain failed for '$root' with exit code $LASTEXITCODE."
    }

    if ($null -ne $status -and @($status).Count -gt 0) {
        throw "Working tree at '$root' is not clean."
    }

    return [pscustomobject]@{
        root   = $root
        commit = $head
    }
}

function Resolve-UlePortalSource {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$PortalCheckout,

        [Parameter(Mandatory = $true)]
        [string]$ExpectedPortalCommit,

        [Parameter(Mandatory = $true)]
        [string]$SignedSourceCommit
    )

    if ($SignedSourceCommit -cnotmatch '^[0-9a-f]{40}$') {
        throw "SignedSourceCommit must be exactly 40 lowercase hexadecimal characters."
    }

    $identity = Get-UlePortalIdentity -Checkout $PortalCheckout -ExpectedCommit $ExpectedPortalCommit
    $root = $identity.root
    $portalCommit = $identity.commit

    & git -C $root merge-base --is-ancestor $SignedSourceCommit $portalCommit 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "SignedSourceCommit '$SignedSourceCommit' is not an ancestor of portal commit '$portalCommit'."
    }

    $changed = & git -C $root diff --name-only $SignedSourceCommit $portalCommit 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "git diff --name-only failed for '$root' with exit code $LASTEXITCODE."
    }

    $changedPaths = @($changed | Where-Object { -not [string]::IsNullOrEmpty($_) })
    foreach ($changedPath in $changedPaths) {
        if (-not $changedPath.StartsWith('portal/', [StringComparison]::Ordinal) -and
            -not [StringComparer]::Ordinal.Equals($changedPath, '.github/workflows/portal-verify.yml')) {
            throw "Changed path '$changedPath' is outside the allowed portal/ tree or portal verification workflow."
        }
    }

    $portalRoot = [IO.Path]::GetFullPath((Join-Path $root 'portal'))
    $managePy = Join-Path $portalRoot 'manage.py'
    $communications = Join-Path $portalRoot 'website/communications_content.py'

    if (-not (Test-Path -LiteralPath $managePy -PathType Leaf)) {
        throw "Required portal file '$managePy' is missing or not a leaf."
    }

    if (-not (Test-Path -LiteralPath $communications -PathType Leaf)) {
        throw "Required portal file '$communications' is missing or not a leaf."
    }

    $validatorSha256 = (Get-FileHash -LiteralPath $communications -Algorithm SHA256).Hash.ToLowerInvariant()

    return [pscustomobject]@{
        portal_root          = $portalRoot
        portal_checkout      = $root
        portal_commit        = $portalCommit
        signed_source_commit = $SignedSourceCommit
        validator_sha256     = $validatorSha256
        changed_paths        = $changedPaths
    }
}