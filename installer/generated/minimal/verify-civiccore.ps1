$ErrorActionPreference = "Stop"
$KitRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$PythonPath = Join-Path $KitRoot ".venv\Scripts\python.exe"

if (-not (Test-Path $PythonPath)) {
    throw "CivicCore is not installed in this kit yet. Run .\install-civiccore.ps1 first."
}

& $PythonPath -c "import civiccore; print(civiccore.__version__)"
