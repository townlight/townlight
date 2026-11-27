# SPDX-License-Identifier: AGPL-3.0-only
# Foreground CLI waits must not include the services that CLI starts.
function Invoke-InstalledForegroundProcess {
    param(
        [Parameter(Mandatory=$true)][string]$FilePath,
        [Parameter(Mandatory=$true)][string[]]$ArgumentList,
        [Parameter(Mandatory=$true)][string]$Label,
        [string]$Stdout,
        [string]$Stderr,
        [ValidateRange(1,600)][int]$TimeoutSeconds = 300
    )

    $startParams = @{
        FilePath     = $FilePath
        ArgumentList = $ArgumentList
        WindowStyle  = 'Hidden'
        PassThru     = $true
    }
    if ($Stdout) { $startParams['RedirectStandardOutput'] = $Stdout }
    if ($Stderr) { $startParams['RedirectStandardError']  = $Stderr }

    $process = Start-Process @startParams

    try {
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            throw "$Label timed out."
        }
        $process.Refresh()
        if ($process.ExitCode -ne 0) {
            throw "$Label failed with exit code $($process.ExitCode)."
        }
    }
    finally {
        try {
            if (-not $process.HasExited) {
                $process.Kill()
                if (-not $process.WaitForExit(5000)) {
                    throw "$Label cleanup timed out."
                }
            }
        }
        finally {
            $process.Dispose()
        }
    }
}

function Invoke-InstalledWithCleanup {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action,

        [Parameter(Mandatory = $true)]
        [scriptblock]$Cleanup
    )

    $actionError = $null
    $cleanupError = $null

    try {
        & $Action
    }
    catch {
        $actionError = $_
    }
    finally {
        try {
            & $Cleanup
        }
        catch {
            $cleanupError = $_
        }
    }

    if ($actionError -and $cleanupError) {
        throw [AggregateException]::new(
            'Installed action and cleanup failed.',
            [Exception[]]@($actionError.Exception, $cleanupError.Exception)
        )
    }
    elseif ($actionError) {
        throw $actionError
    }
    elseif ($cleanupError) {
        throw $cleanupError
    }
}
