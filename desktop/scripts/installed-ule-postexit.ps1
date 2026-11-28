function Stop-UleOwnedDesktop {
    param(
        [System.Diagnostics.Process]$App
    )

    if ($null -eq $App) {
        throw "App is required."
    }

    if ($App.HasExited) {
        throw "App has already exited."
    }

    $processId = $App.Id
    $App.Kill()
    $App.WaitForExit()

    if (-not $App.HasExited) {
        throw "App did not exit."
    }

    return @{
        pid    = $processId
        exited = $true
        at     = [DateTime]::UtcNow.ToString('o')
    }
}

function Invoke-UleLibraryPostExit {
    param(
        [object]$Pending
    )

    $stopped = Stop-UleOwnedDesktop -App $script:ownedApp
    if (-not ([DateTimeOffset]::Parse($stopped.at) -lt [DateTimeOffset]::Parse($Pending.due_at))) {
        throw "Stopped time must be before pending due time."
    }

    $stopped | ConvertTo-Json | Set-Content -Path (Join-Path $EvidenceRoot 'communications-app-stopped.json')
    $Pending | ConvertTo-Json -Depth 30 | Set-Content -Path (Join-Path $EvidenceRoot 'communications-unattended-pending.json')

    Invoke-UleUnattendedVerification

    $script:ownedApp = Start-UleOwnedDesktop -Exe $exe

    return @{
        stopped             = $stopped
        unattended_verified = $true
    }
}