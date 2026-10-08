param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference = 'Stop'
$exe = Get-Item -LiteralPath $Path -ErrorAction Stop
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'vswhere is required to inspect desktop PE dependencies.' }
$inspectors = @(& $vswhere -latest -products '*' -find 'VC\Tools\MSVC\**\bin\Hostx64\x64\dumpbin.exe')
if ($LASTEXITCODE -ne 0 -or $inspectors.Count -eq 0) { throw 'No x64 dumpbin available to inspect desktop imports.' }
$imports = & $inspectors[0] /dependents $exe.FullName
if ($LASTEXITCODE -ne 0) { throw 'Desktop PE dependency inspection failed.' }
$runtimeImports = @($imports | Where-Object { $_ -match '(?i)^\s*(vcruntime\d+[^\s]*|msvcp\d+[^\s]*|concrt\d+[^\s]*)\.dll\s*$' })
if ($runtimeImports.Count -gt 0) {
    throw "Desktop EXE requires an unbundled VC++ runtime: $($runtimeImports.Trim() -join ', '). Refusing packaging/signing."
}
Write-Host 'Desktop PE import check passed: no external VC++ runtime required.'
