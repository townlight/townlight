param(
    [Parameter(Mandatory)][string]$InstalledExe,
    [Parameter(Mandatory)][string]$Mailbox,
    [Parameter(Mandatory)][uri]$SharedOrigin
)

$ErrorActionPreference = 'Stop'
if ($env:TOWNLIGHT_DISPOSABLE_INSTALLED_TEST -ne '1' -or $SharedOrigin.Scheme -ne 'https') {
    throw 'Use only inside a disposable Windows acceptance guest with a configured HTTPS city host.'
}
$exe = (Resolve-Path -LiteralPath $InstalledExe).Path
$mail = (Resolve-Path -LiteralPath $Mailbox).Path
if ((Get-AuthenticodeSignature -LiteralPath $exe).Status -ne 'Valid') {
    throw 'The installed Townlight executable must have a valid signature.'
}
if (Get-ChildItem -LiteralPath $mail -Force) { throw 'The acceptance mailbox must start empty.' }

function Write-Receipt([string]$Name, [string]$Payload) {
    $target = Join-Path $mail $Name
    $temporary = $target + '.tmp'
    [IO.File]::WriteAllText($temporary, $Payload, [Text.UTF8Encoding]::new($false))
    [IO.File]::Move($temporary, $target)
}

$start = [Diagnostics.ProcessStartInfo]::new()
$start.FileName = $exe
$start.Arguments = '--townlight-staff-client'
$start.UseShellExecute = $false
$start.CreateNoWindow = $true
$start.RedirectStandardInput = $true
$start.RedirectStandardOutput = $true
$start.StandardOutputEncoding = [Text.UTF8Encoding]::new($false)
if ($start.PSObject.Properties['StandardInputEncoding']) {
    $start.StandardInputEncoding = [Text.UTF8Encoding]::new($false)
}
$start.EnvironmentVariables['TOWNLIGHT_SHARED_ORIGIN'] = $SharedOrigin.AbsoluteUri.TrimEnd('/')
$start.EnvironmentVariables.Remove('TOWNLIGHT_SHARED_STAFF_HOST')
$process = [Diagnostics.Process]::Start($start)
if ($process.StandardInput.Encoding.WebName -ne 'utf-8') {
    $writer = [IO.StreamWriter]::new($process.StandardInput.BaseStream, [Text.UTF8Encoding]::new($false), 1024, $true)
} else {
    $writer = $process.StandardInput
}
try {
    Write-Receipt 'ready.json' (@{machine = [Environment]::MachineName; host = $false; process_id = $process.Id} | ConvertTo-Json -Compress)
    $idle = [Diagnostics.Stopwatch]::StartNew()
    while (-not $process.HasExited -and $idle.Elapsed.TotalMinutes -lt 15) {
        if (Test-Path -LiteralPath (Join-Path $mail 'stop.json')) { break }
        $request = Get-ChildItem -LiteralPath $mail -File -Filter 'request-*.json' |
            Where-Object Name -Match '^request-[0-9a-f-]{36}\.json$' | Select-Object -First 1
        if (-not $request) { Start-Sleep -Milliseconds 150; continue }
        $message = [IO.File]::ReadAllText($request.FullName)
        Remove-Item -LiteralPath $request.FullName
        $writer.WriteLine($message)
        $writer.Flush()
        $line = $process.StandardOutput.ReadLineAsync()
        if (-not $line.Wait([TimeSpan]::FromSeconds(120)) -or $null -eq $line.Result) {
            throw 'The installed native staff command did not return a receipt.'
        }
        $response = $request.Name -replace '^request-', 'response-'
        Write-Receipt $response $line.Result
        $idle.Restart()
    }
} finally {
    $writer.Dispose()
    $process.StandardInput.Dispose()
    if (-not $process.WaitForExit(5000)) { $process.Kill(); $process.WaitForExit() }
    $process.Dispose()
}
