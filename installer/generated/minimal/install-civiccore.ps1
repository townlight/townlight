$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$VenvPath = Join-Path $KitRoot ".venv"
$WheelPath = "C:/dev/Codex/civiccore/dist/civiccore-1.2.0-py3-none-any.whl"

function Invoke-Step {
    param([scriptblock]$Command)
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code $LASTEXITCODE"
    }
}

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    throw "Python 3.11+ is required before installing CivicCore. Install Python, reopen this terminal, then rerun this script."
}

Invoke-Step { python -m venv $VenvPath }
Invoke-Step { & (Join-Path $VenvPath "Scripts\python.exe") -m pip install --upgrade pip }
Invoke-Step { & (Join-Path $VenvPath "Scripts\python.exe") -m pip install $WheelPath }
Invoke-Step { & (Join-Path $VenvPath "Scripts\python.exe") -c "import civiccore; print('CivicCore ' + civiccore.__version__ + ' installed')" }
