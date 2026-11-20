"""Exercise real ZIP extraction on both supported Windows PowerShell runtimes."""
from pathlib import Path
import shutil
import subprocess
import zipfile

import pytest

HELPER = Path(__file__).resolve().parents[1] / "desktop/scripts/expand-runtime-archive.ps1"


@pytest.mark.parametrize("shell", ["powershell", "pwsh"])
def test_runtime_archive_extracts_and_overlays_without_erasing_payload(tmp_path, shell):
    executable = shutil.which(shell)
    if not executable:
        pytest.skip(f"{shell} is not installed")
    archive = tmp_path / "voice assets.zip"
    destination = tmp_path / "embedded python"
    destination.mkdir()
    (destination / "python.exe").write_bytes(b"interpreter marker")
    (destination / "nested").mkdir()
    (destination / "nested/model.bin").write_bytes(b"old model")
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("nested/model.bin", b"new model")
        z.writestr("nested/config.json", b"{}")
    script = tmp_path / "extract.ps1"
    script.write_text(
        "$ErrorActionPreference='Stop'\n"
        "# Simulate the broken hosted Expand-Archive module; this path must not call it.\n"
        "function Expand-Archive { throw 'ExtractToDirectory overload unavailable' }\n"
        f". '{str(HELPER).replace(chr(39), chr(39)*2)}'\n"
        "Expand-TownlightRuntimeArchive -Archive $args[0] -Destination $args[1]\n",
        encoding="utf-8",
    )
    result = subprocess.run([executable, "-NoProfile", "-File", str(script), str(archive), str(destination)], capture_output=True, text=True)
    assert result.returncode == 0, result.stdout + result.stderr
    assert (destination / "nested/model.bin").read_bytes() == b"new model"
    assert (destination / "nested/config.json").read_bytes() == b"{}"
    assert (destination / "python.exe").read_bytes() == b"interpreter marker"


@pytest.mark.parametrize("shell", ["powershell", "pwsh"])
def test_runtime_archive_rejects_path_escape(tmp_path, shell):
    executable = shutil.which(shell)
    if not executable:
        pytest.skip(f"{shell} is not installed")
    archive = tmp_path / "bad.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("../escape.txt", b"outside")
    script = tmp_path / "extract.ps1"
    script.write_text(
        "$ErrorActionPreference='Stop'\n"
        f". '{str(HELPER).replace(chr(39), chr(39)*2)}'\n"
        "Expand-TownlightRuntimeArchive -Archive $args[0] -Destination $args[1]\n",
        encoding="utf-8",
    )
    result = subprocess.run([executable, "-NoProfile", "-File", str(script), str(archive), str(tmp_path / "payload")], capture_output=True, text=True)
    assert result.returncode != 0
    assert "escapes its destination" in result.stderr
    assert not (tmp_path / "escape.txt").exists()
