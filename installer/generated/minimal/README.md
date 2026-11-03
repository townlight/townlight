# Townlight Minimal Install Kit

Profile: `minimal`

This generated kit installs Townlight Core only. It does not install Docker, WSL,
Python, or other baseline system dependencies. It does not start services or
containers.

Run one of the platform scripts from this directory after reviewing
`townlight_core-install-plan.json`.

Windows:

```powershell
.\install-townlight_core.ps1
.\verify-townlight_core.ps1
.\reset-townlight_core.ps1
```

macOS/Linux:

```bash
bash install-townlight_core.sh
bash verify-townlight_core.sh
bash reset-townlight_core.sh
```

The install scripts create a local `.venv` inside this generated kit and install
Townlight Core from the local wheel artifact:

Windows artifact path:

`C:/dev/Codex/townlight_core/dist/townlight_core-1.2.0-py3-none-any.whl`

macOS/Linux/WSL artifact path:

`/mnt/c/dev/Codex/townlight_core/dist/townlight_core-1.2.0-py3-none-any.whl`
