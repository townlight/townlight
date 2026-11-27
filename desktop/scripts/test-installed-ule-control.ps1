$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installed-ule-control.ps1')
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('ule-control-test-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $testRoot
$nonce = [guid]::NewGuid().ToString('D')
function Assert-Throws([scriptblock]$Action) {
    $failed = $false
    try { & $Action | Out-Null } catch { $failed = $true }
    if (-not $failed) { throw 'Expected rejection did not occur.' }
}
function Write-Request($Request) {
    $Request | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $testRoot 'request.json') -Encoding utf8
}
try {
    if ($null -ne (Read-UleLibraryRequest $testRoot $nonce)) { throw 'Absent request was accepted.' }
    $request = @{ schema_version = 1; nonce = $nonce; action = 'library-postexit'; id = [guid]::NewGuid().ToString(); pending = @{ id = [guid]::NewGuid().ToString(); due_at = [DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o') } }
    Write-Request $request
    $validated = Read-UleLibraryRequest $testRoot $nonce
    if ($validated.id -ne $request.id) { throw 'Request identity changed.' }
    Assert-Throws { Read-UleLibraryRequest $testRoot 'wrong-nonce' }
    $request.pending.due_at = [DateTimeOffset]::UtcNow.AddMinutes(-1).ToString('o')
    Write-Request $request
    Assert-Throws { Read-UleLibraryRequest $testRoot $nonce }
    $request.pending.due_at = [DateTimeOffset]::UtcNow.AddMinutes(5).ToString('o')
    $request.action = 'arbitrary-command'
    Write-Request $request
    Assert-Throws { Read-UleLibraryRequest $testRoot $nonce }
    $request.action = 'library-postexit'
    $request.pending.id = 'invalid'
    Write-Request $request
    Assert-Throws { Read-UleLibraryRequest $testRoot $nonce }
    $request.pending.id = [guid]::NewGuid().ToString()
    Write-Request $request
    $validated = Read-UleLibraryRequest $testRoot $nonce
    Complete-UleLibraryRequest $testRoot $nonce $validated { param($pending) @{ article_id = $pending.id; stopped = @{ pid = 123; exited = $true } } }
    $response = Get-Content -LiteralPath (Join-Path $testRoot 'response.json') -Raw | ConvertFrom-Json
    if (-not $response.ok -or $response.id -ne $request.id -or $response.result.article_id -ne $request.pending.id -or $response.nonce -cne $nonce) { throw 'Successful response lost its binding.' }
    Assert-Throws { Complete-UleLibraryRequest $testRoot $nonce $validated { throw 'private error text' } }
    $responseText = Get-Content -LiteralPath (Join-Path $testRoot 'response.json') -Raw
    $response = $responseText | ConvertFrom-Json
    if ($response.ok -or $response.error -ne 'LibraryPostExitFailed' -or $responseText.Contains('private error text')) { throw 'Failure response leaked details or reported success.' }
    Write-Output 'PASS: ULE request binding, future schedule, callback response and sanitized failure.'
} finally {
    $resolved = [IO.Path]::GetFullPath($testRoot)
    if ($resolved.StartsWith([IO.Path]::GetFullPath([IO.Path]::GetTempPath()), [StringComparison]::OrdinalIgnoreCase) -and (Split-Path $resolved -Leaf).StartsWith('ule-control-test-')) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
