"""Local document storage service entry point for Townlight desktop."""

from __future__ import annotations

import os
import signal
import time
from pathlib import Path


def storage_root() -> Path:
    configured = os.environ.get("CIVICSUITE_FILE_STORAGE_DIR")
    if configured:
        return Path(configured)
    data_dir = os.environ.get("CIVICSUITE_DATA_DIR")
    if data_dir:
        return Path(data_dir) / "files"
    return Path.home() / "AppData" / "Local" / "CivicSuite" / "Data" / "files"


def main() -> int:
    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    running = True

    def stop(_signum: int, _frame: object) -> None:
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    print(f"Townlight local file storage ready at {root}", flush=True)
    while running:
        time.sleep(1.0)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
