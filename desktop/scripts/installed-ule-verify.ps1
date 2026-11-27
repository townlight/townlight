function Stop-UleUnattendedVerificationService {
    if ($null -eq $script:UleStaffHostCleanup) { return }
    $cleanup = $script:UleStaffHostCleanup
    $script:UleStaffHostCleanup = $null
    & $cleanup
}

function Invoke-UleUnattendedVerification {
    $stopService = {
        Invoke-InstalledForegroundProcess -FilePath $exe -ArgumentList @('--townlight-staff-host','stop') -Label 'ULE staff host stop' -Stdout (Join-Path $EvidenceRoot 'ule-staff-stop.stdout.log') -Stderr (Join-Path $EvidenceRoot 'ule-staff-stop.stderr.log') -TimeoutSeconds 120
    }.GetNewClosure()
    $script:UleStaffHostCleanup = $stopService
    $script:UleUnattendedVerified = $false

    Invoke-InstalledWithCleanup -Action {
        Invoke-InstalledForegroundProcess -FilePath $exe -ArgumentList @('--townlight-staff-host','start') -Label 'ULE staff host start' -Stdout (Join-Path $EvidenceRoot 'ule-staff-start.stdout.log') -Stderr (Join-Path $EvidenceRoot 'ule-staff-start.stderr.log') -TimeoutSeconds 300

        Push-Location (Join-Path $repo 'desktop')
        try {
            & node 'tests/installed/communications-unattended.mjs' verify $EvidenceRoot $env:TOWNLIGHT_COMMUNITY_PORTAL_URL $fixture.Root | Out-Host
            if ($LASTEXITCODE -ne 0) {
                throw "Unattended verification failed with exit code $LASTEXITCODE"
            }
            $script:UleUnattendedVerified = $true
        }
        finally {
            Pop-Location
        }
    } -Cleanup {
        if (-not $script:UleUnattendedVerified) {
            Stop-UleUnattendedVerificationService
        }
    }
}