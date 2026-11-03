#!/usr/bin/env bash
set -euo pipefail
KIT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_PATH="${KIT_ROOT}/.venv/bin/python"

if [[ ! -x "${PYTHON_PATH}" ]]; then
  echo "TownlightCore is not installed in this kit yet. Run bash install-townlight_core.sh first." >&2
  exit 1
fi

"${PYTHON_PATH}" -c "import townlight_core; print(townlight_core.__version__)"
