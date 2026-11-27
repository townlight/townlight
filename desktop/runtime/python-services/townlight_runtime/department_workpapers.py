"""Authoritative staff-host initialization for Townlight department workpapers.

This module is server-only.  Callers must first enable the relevant domain and
initialize the existing 311 repository at
``app.state.desktop_service_requests``.  The helper refuses to create any
department SQLite database when that repository is absent, which prevents a
remote workstation or incomplete startup from silently creating alternate
stores.  Backups and restores are handled by the existing stop-writer
recursive process around the authoritative data directory.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path

from civicelections.publication import ElectionPublicationRepository
from civiclibrary.publication import LibraryPublicationRepository
from civicutility.workflow import UtilityWorkflowRepository

from .utilities_bridge import UtilitiesRequestBridge

_UTILITIES_DB = "utilities.sqlite3"
_LIBRARY_DB = "library.sqlite3"
_ELECTIONS_DB = "elections.sqlite3"
_DATA_ENV = "TOWNLIGHT_DATA_DIR"
_REQUESTS_STATE = "desktop_service_requests"


def _application_state(domain_app: object) -> object:
    state = getattr(domain_app, "state", None)
    if state is None:
        raise RuntimeError("Townlight application state is not available")
    return state


def _require_existing_311_repository(state: object) -> object:
    repository = getattr(state, _REQUESTS_STATE, None)
    if repository is None:
        raise RuntimeError(
            "311 service repository is not initialized; refusing to create "
            "department workpapers"
        )
    return repository


def _authoritative_data_root(
    profile_root: str | os.PathLike[str],
    data_root: str | os.PathLike[str] | None,
) -> Path:
    if data_root is not None:
        path = Path(data_root)
    else:
        configured = os.environ.get(_DATA_ENV)
        if configured:
            path = Path(configured)
        else:
            path = Path(profile_root) / "Data"

    if not path.is_absolute():
        raise ValueError("Townlight data directory must be an absolute path")

    path.mkdir(parents=True, exist_ok=True)
    return path


def _load_election_settings(profile_root: Path) -> object:
    # The settings owner supplies this module.  Import it at call time so the
    # rest of department startup remains importable while integration lands.
    from .election_official_settings import ElectionOfficialSettings

    return ElectionOfficialSettings(profile_root).load()


def _designated_official_ids(settings: object) -> frozenset[str]:
    if isinstance(settings, Mapping):
        try:
            ids = settings["elections_official_ids"]
        except KeyError as exc:
            raise RuntimeError("election official settings are invalid") from exc
    else:
        ids = getattr(settings, "elections_official_ids", None)

    if ids is None or isinstance(ids, (str, bytes)):
        raise RuntimeError("election official settings are invalid")

    try:
        official_ids = frozenset(ids)
    except TypeError as exc:
        raise RuntimeError("election official settings are invalid") from exc

    if not all(isinstance(actor_id, str) for actor_id in official_ids):
        raise RuntimeError("election official settings are invalid")
    return official_ids


def initialize_department_workpapers(
    domain_app: object,
    profile_root: str | os.PathLike[str],
    *,
    data_root: str | os.PathLike[str] | None = None,
) -> None:
    """Initialize Utilities, Library, and Elections workpaper repositories.

    ``data_root`` is the explicit authoritative server directory.  When it is
    omitted, ``TOWNLIGHT_DATA_DIR`` is honored if set, otherwise
    ``profile_root / "Data"`` is used.  The resolved directory must be
    absolute and is created if needed.
    """
    state = _application_state(domain_app)
    requests_repository = _require_existing_311_repository(state)

    profile_path = Path(profile_root)
    data_path = _authoritative_data_root(profile_path, data_root)

    election_settings = _load_election_settings(profile_path)
    official_ids = _designated_official_ids(election_settings)

    utilities_repository = UtilityWorkflowRepository(
        data_path / _UTILITIES_DB,
        UtilitiesRequestBridge(requests_repository),
    )
    library_repository = LibraryPublicationRepository(data_path / _LIBRARY_DB)
    elections_repository = ElectionPublicationRepository(
        data_path / _ELECTIONS_DB,
        official_ids,
    )

    state.desktop_utilities = utilities_repository
    state.desktop_library = library_repository
    state.desktop_elections = elections_repository
    state.desktop_elections_officials = official_ids
    state.desktop_elections_settings = election_settings


__all__ = ["initialize_department_workpapers"]
