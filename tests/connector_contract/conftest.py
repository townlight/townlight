# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Use this checkout's real Runtime entry point, not an installed older copy."""

import sys
from pathlib import Path

RUNTIME = Path(__file__).resolve().parents[2] / "desktop/runtime/python-services"
sys.path.insert(0, str(RUNTIME))
