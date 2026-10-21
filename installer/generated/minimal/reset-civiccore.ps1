$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $KitRoot ".venv"

if (Test-Path $VenvPath) {
    Remove-Item -LiteralPath $VenvPath -Recurse -Force
    Write-Host "Removed kit-local CivicCore virtual environment: $VenvPath"
} else {
    Write-Host "No kit-local CivicCore virtual environment found. Nothing to reset."
}
