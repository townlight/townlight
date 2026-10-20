#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) The CivicSuite Authors
"""Check the additive Townlight suite-state contract and legacy projections."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from suite_state import (
    INSTALLER_PATH,
    PUBLIC_STATUS_PATH,
    SCHEMA_PATH,
    STATE_PATH,
    validate_all,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", type=Path, default=STATE_PATH)
    parser.add_argument("--schema", type=Path, default=SCHEMA_PATH)
    parser.add_argument("--installer", type=Path, default=INSTALLER_PATH)
    parser.add_argument("--public-status", type=Path, default=PUBLIC_STATUS_PATH)
    parser.add_argument(
        "--json", action="store_true", help="Emit a machine-readable result."
    )
    args = parser.parse_args()

    try:
        errors = validate_all(
            state_path=args.state,
            schema_path=args.schema,
            installer_path=args.installer,
            public_status_path=args.public_status,
        )
    except (TypeError, ValueError) as exc:
        errors = [str(exc)]

    if args.json:
        print(
            json.dumps(
                {
                    "status": "pass" if not errors else "fail",
                    "module_count": 28 if not errors else None,
                    "errors": errors,
                },
                indent=2,
            )
        )
    elif errors:
        print("CHECK-SUITE-STATE: FAILED")
        for error in errors:
            print(f"- {error}")
    else:
        print("CHECK-SUITE-STATE: PASSED")
        print("- 28 canonical modules validated")
        print("- stable Townlight identities and legacy aliases are unique")
        print("- products, profiles, and dependency references resolve")
        print("- installer/modules.json matches the recorded legacy projection")
        print(
            "- installer/modules.public-status.json matches the recorded legacy projection"
        )
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
