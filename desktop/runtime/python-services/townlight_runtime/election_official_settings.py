from __future__ import annotations

import json
import os
import re
import tempfile
import threading
import uuid
from collections.abc import Iterable
from pathlib import Path
from typing import Annotated, Any

import sqlalchemy as sa
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool
from townlight_records.auth.native_identity import mapped_native_actor
from townlight_records.database import get_async_session
from townlight_records.models.user import User

from townlight_runtime.native_accounts import accounts as native_account_links

router = APIRouter(prefix="/desktop/v1/elections", tags=["elections"])

ProofHeader = Annotated[str | None, Header(alias="X-Townlight-Session")]
Db = Annotated[AsyncSession, Depends(get_async_session)]


class ElectionSettingsError(Exception):
    pass


class ElectionSettingsInvalid(ElectionSettingsError):
    pass


class ElectionSettingsForbidden(ElectionSettingsError):
    pass


class ElectionSettingsConflict(ElectionSettingsError):
    pass


class ElectionSettingsStorage(ElectionSettingsError):
    pass


_LOCKS: dict[str, threading.RLock] = {}
_LOCKS_GUARD = threading.Lock()
_UUID_TEXT = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
    r"[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)


def _lock_for(path: Path) -> threading.RLock:
    key = os.path.normcase(os.path.abspath(os.fspath(path)))
    with _LOCKS_GUARD:
        lock = _LOCKS.get(key)
        if lock is None:
            lock = threading.RLock()
            _LOCKS[key] = lock
        return lock


def _canonical_uuid(value: Any) -> str:
    if isinstance(value, uuid.UUID):
        return str(value)
    if not isinstance(value, str) or _UUID_TEXT.fullmatch(value) is None:
        raise ValueError("invalid UUID")
    try:
        parsed = uuid.UUID(value)
    except (AttributeError, ValueError) as exc:
        raise ValueError("invalid UUID") from exc
    return str(parsed)


def _canonicalize_id_list(values: Any, error: type[Exception]) -> list[str]:
    if not isinstance(values, list):
        raise error("elections official ids must be a list")
    if len(values) > 100:
        raise error("too many elections officials")
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        try:
            canonical = _canonical_uuid(value)
        except (TypeError, ValueError):
            raise error("invalid elections official id") from None
        if canonical in seen:
            raise error("duplicate elections official id")
        seen.add(canonical)
        result.append(canonical)
    return result


def _unique_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result


class ElectionOfficialSettings:
    def __init__(self, root: str | os.PathLike[str]) -> None:
        self.root = Path(root)
        self.path = self.root / "config" / "elections-officials.json"
        self._lock = _lock_for(self.path)

    def _read_current_unlocked(self) -> tuple[int, list[str]]:
        try:
            raw = self.path.read_text(encoding="utf-8")
        except FileNotFoundError:
            return 0, []
        except OSError as exc:
            raise ElectionSettingsStorage("election settings unavailable") from exc

        try:
            data = json.loads(raw, object_pairs_hook=_unique_object)
        except (ValueError, json.JSONDecodeError) as exc:
            raise ElectionSettingsStorage("election settings malformed") from exc

        if not isinstance(data, dict) or set(data) != {
            "revision",
            "elections_official_ids",
        }:
            raise ElectionSettingsStorage("election settings malformed")

        revision = data["revision"]
        if type(revision) is not int or revision < 0:
            raise ElectionSettingsStorage("election settings malformed")

        ids = _canonicalize_id_list(
            data["elections_official_ids"],
            ElectionSettingsStorage,
        )
        return revision, ids

    def _write_atomic_unlocked(self, payload: dict[str, Any]) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
        except OSError as exc:
            raise ElectionSettingsStorage("election settings unavailable") from exc

        fd = -1
        tmp_path: Path | None = None
        try:
            fd, tmp_name = tempfile.mkstemp(
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                dir=str(self.path.parent),
            )
            tmp_path = Path(tmp_name)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                fd = -1
                json.dump(
                    payload,
                    handle,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(tmp_path, self.path)
            tmp_path = None
        except OSError as exc:
            raise ElectionSettingsStorage("election settings unavailable") from exc
        finally:
            if fd != -1:
                try:
                    os.close(fd)
                except OSError:
                    pass
            if tmp_path is not None:
                try:
                    tmp_path.unlink()
                except OSError:
                    pass

    def load(self) -> dict[str, Any]:
        with self._lock:
            revision, ids = self._read_current_unlocked()
        return {
            "revision": revision,
            "elections_official_ids": list(ids),
        }

    def save(
        self,
        expected_revision: int,
        official_ids: Any,
        actor_id: Any,
        eligible_ids: Iterable[Any],
    ) -> dict[str, Any]:
        if type(expected_revision) is not int or expected_revision < 0:
            raise ElectionSettingsInvalid(
                "expected revision must be a non-negative integer"
            )

        ids = _canonicalize_id_list(official_ids, ElectionSettingsInvalid)

        try:
            actor = _canonical_uuid(actor_id)
        except (TypeError, ValueError) as exc:
            raise ElectionSettingsStorage("invalid actor identity") from exc

        if actor in ids:
            raise ElectionSettingsForbidden(
                "administrator cannot designate their own account"
            )

        eligible: set[str] = set()
        try:
            for value in eligible_ids:
                eligible.add(_canonical_uuid(value))
        except (TypeError, ValueError) as exc:
            raise ElectionSettingsStorage("invalid eligible officials") from exc

        for official_id in ids:
            if official_id not in eligible:
                raise ElectionSettingsForbidden(
                    "selected account is not an eligible active city staff or clerk"
                )

        with self._lock:
            current_revision, _current_ids = self._read_current_unlocked()
            if current_revision != expected_revision:
                raise ElectionSettingsConflict(
                    "election settings changed; reload and retry"
                )
            next_revision = current_revision + 1
            payload = {
                "revision": next_revision,
                "elections_official_ids": ids,
            }
            self._write_atomic_unlocked(payload)

        return {
            "revision": next_revision,
            "elections_official_ids": list(ids),
        }


class ElectionOfficialSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_revision: int = Field(strict=True, ge=0)
    elections_official_ids: list[uuid.UUID] = Field(max_length=100)


async def current_actor(
    request: Request,
    session: Db,
    proof: ProofHeader = None,
) -> User:
    actor = await mapped_native_actor(
        request,
        session,
        proof,
        "townlight_elections",
    )
    if getattr(request.state, "native_role", None) != "local-admin":
        raise HTTPException(status_code=403, detail="local administrator required")
    return actor


Actor = Annotated[User, Depends(current_actor)]


def _settings_for(request: Request) -> ElectionOfficialSettings:
    root = getattr(request.app.state, "desktop_profile_root", None)
    if root is None:
        raise HTTPException(
            status_code=503,
            detail="election settings storage unavailable",
        )
    return ElectionOfficialSettings(root)


async def _eligible_candidates(
    session: AsyncSession,
    actor_id: uuid.UUID,
) -> tuple[set[str], list[dict[str, Any]]]:
    statement = (
        sa.select(User, native_account_links.c.native_role)
        .join(native_account_links, native_account_links.c.user_id == User.id)
        .where(
            User.is_active.is_(True),
            native_account_links.c.native_role.in_(("city-staff", "clerk")),
            User.id != actor_id,
        )
        .order_by(User.email.asc(), User.id.asc())
    )
    rows = (await session.execute(statement)).all()

    eligible: set[str] = set()
    candidates: list[dict[str, Any]] = []
    for user, native_role in rows:
        user_id = str(user.id)
        eligible.add(user_id)
        candidates.append(
            {
                "id": user_id,
                "name": user.full_name,
                "email": user.email,
                "native_role": native_role,
            }
        )
    return eligible, candidates


@router.get("/settings")
async def get_election_settings(
    request: Request,
    session: Db,
    actor: Actor,
) -> dict[str, Any]:
    settings = _settings_for(request)
    try:
        current = await run_in_threadpool(settings.load)
    except ElectionSettingsStorage as exc:
        raise HTTPException(
            status_code=503,
            detail="election settings storage unavailable",
        ) from exc

    try:
        _eligible, candidates = await _eligible_candidates(session, actor.id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="election settings storage unavailable",
        ) from exc

    return {
        "revision": current["revision"],
        "elections_official_ids": current["elections_official_ids"],
        "candidates": candidates,
    }


@router.post("/settings")
async def update_election_settings(
    body: ElectionOfficialSettingsUpdate,
    request: Request,
    session: Db,
    actor: Actor,
) -> dict[str, Any]:
    settings = _settings_for(request)

    try:
        eligible, _candidates = await _eligible_candidates(session, actor.id)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail="election settings storage unavailable",
        ) from exc

    try:
        saved = await run_in_threadpool(
            settings.save,
            body.expected_revision,
            list(body.elections_official_ids),
            str(actor.id),
            eligible,
        )
    except ElectionSettingsForbidden as exc:
        raise HTTPException(
            status_code=403,
            detail="not authorized to designate that account",
        ) from exc
    except ElectionSettingsConflict as exc:
        raise HTTPException(
            status_code=409,
            detail="stale election settings revision",
        ) from exc
    except ElectionSettingsInvalid as exc:
        raise HTTPException(
            status_code=422,
            detail="invalid election official settings",
        ) from exc
    except ElectionSettingsStorage as exc:
        raise HTTPException(
            status_code=503,
            detail="election settings storage unavailable",
        ) from exc

    officials = frozenset(saved["elections_official_ids"])
    request.app.state.desktop_elections_officials = officials

    desktop_elections = getattr(request.app.state, "desktop_elections", None)
    if desktop_elections is not None:
        desktop_elections.designated_officials = officials

    return {
        "revision": saved["revision"],
        "elections_official_ids": saved["elections_official_ids"],
    }
