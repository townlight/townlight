# {{MODULE_DISPLAY_NAME}}

{{MODULE_DISPLAY_NAME}} is a Townlight module scaffold. Replace this text with the real municipal workflow, current release status, and installation path before the first PR.

## Status

- Version: `0.1.0`
- Townlight Core pin: `{{CIVICCORE_RELEASE_WHEEL_URL}}#sha256={{CIVICCORE_SHA256}}`
- Release posture: developer preview until the full public-use gate and independent audit clear.

## Local Development

```powershell
python -m venv .venv
.\\.venv\\Scripts\\python -m pip install -e .[dev]
.\\.venv\\Scripts\\python -m pytest
```

## Release Rules

Do not tag `v1.0.0` until the module is installable through Townlight, browser-tested, documented, and independently audited.

