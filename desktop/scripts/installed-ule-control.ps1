# Test-harness control only. Product IPC and signing controls remain unchanged.
function Read-UleLibraryRequest {
    param([string]$ControlRoot, [string]$Nonce)
    $path = Join-Path $ControlRoot 'request.json'
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { return $null }
    $request = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
    if ($request.schema_version -ne 1 -or $request.nonce -cne $Nonce -or $request.action -cne 'library-postexit') {
        throw 'Invalid ULE control request envelope.'
    }
    $null = [guid]::Parse([string]$request.id)
    $null = [guid]::Parse([string]$request.pending.id)
    if ([DateTimeOffset]::Parse([string]$request.pending.due_at) -le [DateTimeOffset]::UtcNow) {
        throw 'Library schedule is no longer in the future.'
    }
    return $request
}

function Complete-UleLibraryRequest {
    param([string]$ControlRoot, [string]$Nonce, [object]$Request, [scriptblock]$OnLibraryPostExit)
    $response = @{ schema_version = 1; nonce = $Nonce; id = $Request.id; ok = $false }
    try {
        $response.result = & $OnLibraryPostExit $Request.pending
        $response.ok = $true
    } catch {
        $response.error = 'LibraryPostExitFailed'
        throw
    } finally {
        $temporary = Join-Path $ControlRoot 'response.tmp'
        $response | ConvertTo-Json -Depth 30 -Compress | Set-Content -LiteralPath $temporary -Encoding utf8
        Move-Item -LiteralPath $temporary -Destination (Join-Path $ControlRoot 'response.json') -Force
    }
}

function Invoke-UleInstalledNode {
    param(
        [string]$RepositoryRoot, [string]$EvidenceRoot,
        [ValidateSet('ule', 'ule-upgrade')][string]$Phase,
        [scriptblock]$OnLibraryPostExit, [int]$TimeoutSeconds = 1800
    )
    if ($env:GITHUB_ACTIONS -cne 'true' -or $env:RUNNER_OS -cne 'Windows' -or $env:RUNNER_ENVIRONMENT -cne 'github-hosted') {
        throw 'ULE installer controller requires the existing disposable hosted Windows runner.'
    }
    if (-not $OnLibraryPostExit -or $TimeoutSeconds -lt 1) { throw 'Missing callback or invalid timeout.' }
    $RepositoryRoot = [IO.Path]::GetFullPath($RepositoryRoot)
    $EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)
    $controlRoot = Join-Path (Join-Path $EvidenceRoot 'ule-control') ([guid]::NewGuid().ToString('N'))
    $null = New-Item -ItemType Directory -Path $controlRoot
    $nonce = [guid]::NewGuid().ToString('D')
    $oldRoot = [Environment]::GetEnvironmentVariable('TOWNLIGHT_ULE_CONTROL_DIR', 'Process')
    $oldNonce = [Environment]::GetEnvironmentVariable('TOWNLIGHT_ULE_CONTROL_NONCE', 'Process')
    $ownedNode = $null
    try {
        $env:TOWNLIGHT_ULE_CONTROL_DIR = $controlRoot
        $env:TOWNLIGHT_ULE_CONTROL_NONCE = $nonce
        $node = (Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
        # EvidenceRoot is supplied by the owning wrapper, never by request.json.
        if ($EvidenceRoot.Contains('"')) { throw 'Invalid evidence path.' }
        $ownedNode = Start-Process -FilePath $node -WorkingDirectory (Join-Path $RepositoryRoot 'desktop') -WindowStyle Hidden -PassThru `
            -ArgumentList @('tests/installed/maintenance.mjs', $Phase, ('"' + $EvidenceRoot + '"')) `
            -RedirectStandardOutput (Join-Path $controlRoot 'node.stdout.log') -RedirectStandardError (Join-Path $controlRoot 'node.stderr.log')
        @{ pid = $ownedNode.Id; parent_pid = $PID; started = $ownedNode.StartTime.ToUniversalTime().ToString('o'); expected_terminal = 'Node exit 0'; next_action = 'inspect ULE outcome'; cancellation = 'kill retained ownedNode Process handle' } |
            ConvertTo-Json | Set-Content -LiteralPath (Join-Path $controlRoot 'ownership.json') -Encoding utf8
        $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
        $processed = $false
        while (-not $ownedNode.HasExited) {
            if ([DateTimeOffset]::UtcNow -ge $deadline) { throw 'ULE installed node timed out.' }
            if (-not $processed) {
                $request = Read-UleLibraryRequest -ControlRoot $controlRoot -Nonce $nonce
                if ($null -ne $request) {
                    $processed = $true
                    Complete-UleLibraryRequest -ControlRoot $controlRoot -Nonce $nonce -Request $request -OnLibraryPostExit $OnLibraryPostExit
                }
            }
            Start-Sleep -Milliseconds 250
            $ownedNode.Refresh()
        }
        $ownedNode.WaitForExit()
        if ($ownedNode.ExitCode -ne 0) { throw "ULE installed node failed; inspect $controlRoot/node.stderr.log" }
        return @{ control_root = $controlRoot; exit_code = $ownedNode.ExitCode; library_postexit_completed = $processed }
    } finally {
        try {
            if (Get-Command Stop-UleUnattendedVerificationService -ErrorAction SilentlyContinue) {
                Stop-UleUnattendedVerificationService
            }
        } finally {
            if ($null -ne $ownedNode -and -not $ownedNode.HasExited) { $ownedNode.Kill(); $ownedNode.WaitForExit() }
            [Environment]::SetEnvironmentVariable('TOWNLIGHT_ULE_CONTROL_DIR', $oldRoot, 'Process')
            [Environment]::SetEnvironmentVariable('TOWNLIGHT_ULE_CONTROL_NONCE', $oldNonce, 'Process')
        }
    }
}
