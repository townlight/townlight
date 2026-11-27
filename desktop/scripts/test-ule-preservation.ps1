$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ule-preservation.ps1')
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([char[]]'\/')
$testRoot = [IO.Path]::GetFullPath((Join-Path $tempBase ('townlight-ule-preservation-' + [guid]::NewGuid().ToString('N'))))
if ([IO.Path]::GetDirectoryName($testRoot) -ne $tempBase -or [IO.Path]::GetFileName($testRoot) -notlike 'townlight-ule-preservation-*') {
  throw 'Unsafe preservation fixture target.'
}
$profile = Join-Path $testRoot 'profile'
$junction = Join-Path $profile 'Data/external'
$checks = [Collections.Generic.List[string]]::new()
function Expect-PreservationFailure([scriptblock]$Action, [string]$Name) {
  $failed = $false
  try { & $Action | Out-Null } catch { $failed = $true }
  if (-not $failed) { throw "Expected preservation rejection: $Name" }
  $checks.Add($Name)
}
try {
  foreach ($relative in @('Data/archives','Data/logs','Data/WebView','config','outside')) {
    New-Item -ItemType Directory -Path (Join-Path $profile $relative) -Force | Out-Null
  }
  foreach ($relative in @('Data/utilities.sqlite3','Data/library.sqlite3','Data/elections.sqlite3',
      'Data/archives/fixture [v1].log','Data/archives/fixture [v2].zip','config/city-profile.json')) {
    [IO.File]::WriteAllText((Join-Path $profile $relative), "Fictional preserved bytes $relative")
  }
  [IO.File]::WriteAllText((Join-Path $profile 'Data/logs/worker.log'), 'Transient log')
  [IO.File]::WriteAllText((Join-Path $profile 'Data/WebView/cache.bin'), 'Transient cache')
  $expected = Get-UlePreservationManifest -ProfileRoot $profile
  if ($expected.files.Count -ne 6) { throw 'Unexpected authoritative file set.' }
  if (@($expected.files.path) -cnotcontains 'Data/archives/fixture [v1].log') { throw 'Literal bracket or log attachment was omitted.' }
  $serialized = $expected | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  Assert-UlePreservationManifest -ProfileRoot $profile -Expected $serialized | Out-Null
  $checks.Add('unchanged-and-serialized-manifest')
  [IO.File]::WriteAllText((Join-Path $profile 'Data/logs/worker.log'), 'Changed transient log')
  Assert-UlePreservationManifest -ProfileRoot $profile -Expected $expected | Out-Null
  $checks.Add('transient-log-exclusion-and-literal-log-attachment')
  $changed = Join-Path $profile 'Data/elections.sqlite3'
  $original = [IO.File]::ReadAllBytes($changed)
  $bytes = [byte[]]$original.Clone()
  $bytes[0] = $bytes[0] -bxor 1
  [IO.File]::WriteAllBytes($changed, $bytes)
  Expect-PreservationFailure { Assert-UlePreservationManifest $profile $expected } 'same-size-content-change'
  [IO.File]::WriteAllBytes($changed, $original)
  $missing = Join-Path $profile 'Data/archives/fixture [v1].log'
  $original = [IO.File]::ReadAllBytes($missing)
  Remove-Item -LiteralPath $missing -Force
  Expect-PreservationFailure { Assert-UlePreservationManifest $profile $expected } 'missing-immutable-version'
  [IO.File]::WriteAllBytes($missing, $original)
  $extra = Join-Path $profile 'Data/extra.bin'
  [IO.File]::WriteAllText($extra, 'Extra')
  Expect-PreservationFailure { Assert-UlePreservationManifest $profile $expected } 'unexpected-extra-file'
  Remove-Item -LiteralPath $extra -Force
  $foreign = [pscustomobject]@{ profile_root = (Join-Path $testRoot 'other'); files = $expected.files }
  Expect-PreservationFailure { Assert-UlePreservationManifest $profile $foreign } 'wrong-profile-identity'
  New-Item -ItemType Junction -Path $junction -Value (Join-Path $profile 'outside') | Out-Null
  Expect-PreservationFailure { Get-UlePreservationManifest $profile } 'reparse-point'
  Remove-Item -LiteralPath $junction -Force
  Assert-UlePreservationManifest $profile $expected | Out-Null
  $checks.Add('final-readback')
  [pscustomobject]@{ passed = $true; checks = @($checks); authoritative_files = $expected.files.Count } | ConvertTo-Json -Depth 5
} finally {
  if (Test-Path -LiteralPath $junction) { Remove-Item -LiteralPath $junction -Force }
  $resolvedTarget = [IO.Path]::GetFullPath($testRoot)
  if ([IO.Path]::GetDirectoryName($resolvedTarget) -ne $tempBase -or [IO.Path]::GetFileName($resolvedTarget) -notlike 'townlight-ule-preservation-*') {
    throw 'Unsafe preservation fixture cleanup target.'
  }
  if (Test-Path -LiteralPath $resolvedTarget) { Remove-Item -LiteralPath $resolvedTarget -Recurse -Force }
}
