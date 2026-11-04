$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonPath = Join-Path $KitRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonPath)) {
    throw "TownlightCore is not installed in this kit yet. Run .\install-townlight_core.ps1 first."
}

& $PythonPath -c "import townlight_core; print(townlight_core.__version__)"
