"""Safe staging of a communications archive into the managed Records store."""

from __future__ import annotations

import hashlib
import os
import re
from pathlib import Path
from uuid import UUID, uuid4

from townlight_records.requests import files

from townlight_runtime.service_request_records import (
    _check_components,
    _ensure_directory,
    _verify_staged,
)

_MAX_SIZE = 40 * 1024 * 1024
_DIGEST = re.compile(r"^[0-9a-f]{64}$")


def _validate(digest: str, content: bytes) -> None:
    if not isinstance(digest, str) or not _DIGEST.match(digest):
        raise ValueError("The archive digest is not a lowercase 64-character hex value.")
    if not isinstance(content, (bytes, bytearray)):
        raise ValueError("The archive content is not bytes.")  # noqa: TRY004 - ValueError preserves the HTTP 422 validation contract.
    if len(content) > _MAX_SIZE:
        raise ValueError("The archive exceeds the 40 MiB staging limit.")
    if hashlib.sha256(bytes(content)).hexdigest() != digest:
        raise ValueError("The archive content hash does not match its digest.")


def stage_archive(
    profile_root: Path,
    article_id: UUID,
    digest: str,
    content: bytes,
    *,
    namespace: str = "communications",
) -> Path:
    """Stage verified archive bytes under <namespace>/<uuid>/<digest>.zip."""
    if namespace not in ("communications", "parks"):
        raise ValueError("The archive namespace is not supported.")
    _validate(digest, content)
    root = files.managed_records_root(profile_root)
    try:
        root.mkdir(parents=True, exist_ok=True)
    except OSError:
        raise ValueError("The managed Records store could not be created.") from None
    _check_components(root, root, final_directory=True)
    directory = root / namespace / str(article_id)
    _ensure_directory(root, directory)
    target = directory / f"{digest}.zip"

    if target.is_symlink() or target.exists():
        _verify_staged(target, digest, len(content))
        return target

    temporary = directory / f".{uuid4().hex}.tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0)
    descriptor: int | None = None
    try:
        descriptor = os.open(temporary, flags, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
        _verify_staged(target, digest, len(content))
        return target
    except OSError:
        if target.is_symlink() or target.exists():
            _verify_staged(target, digest, len(content))
            return target
        raise ValueError("The archive could not be staged atomically.") from None
    finally:
        if descriptor is not None:
            try:
                os.close(descriptor)
            except OSError:
                pass
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass
        except OSError:
            pass
