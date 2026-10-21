"""Database migration runner for the Townlight Windows local runtime."""

from __future__ import annotations

import importlib
import os
from pathlib import Path

from alembic import command
from alembic.config import Config

from civicsuite_runtime.services import _product_profile, _set_local_defaults


def _sync_database_url(url: str) -> str:
    sync_url = (
        url.replace("postgresql+asyncpg", "postgresql+psycopg2")
        .replace("postgres+asyncpg", "postgresql+psycopg2")
        .replace("postgresql://", "postgresql+psycopg2://", 1)
        .replace("postgres://", "postgresql+psycopg2://", 1)
    )
    return sync_url


def _package_root(package_name: str) -> Path:
    package = importlib.import_module(package_name)
    package_file = getattr(package, "__file__", None)
    if not package_file:
        raise RuntimeError(f"Could not resolve package path for {package_name}")
    return Path(package_file).resolve().parent


def _run_alembic(label: str, config_path: Path, script_location: Path, database_url: str) -> None:
    if not config_path.is_file():
        raise RuntimeError(f"{label} migration config is missing: {config_path}")
    if not script_location.is_dir():
        raise RuntimeError(f"{label} migration scripts are missing: {script_location}")
    cfg = Config(str(config_path))
    cfg.set_main_option("script_location", str(script_location))
    cfg.set_main_option("sqlalchemy.url", database_url)
    previous_database_url = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        command.upgrade(cfg, "head")
    finally:
        if previous_database_url is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous_database_url


def upgrade_all() -> None:
    _set_local_defaults()
    profile = _product_profile()
    database_url = os.environ["DATABASE_URL"]
    runtime_root = Path(__file__).resolve().parent
    core_root = _package_root("civiccore") / "migrations"
    records_root = runtime_root / "civicrecords_alembic"

    sync_url = _sync_database_url(database_url)
    _run_alembic("Townlight Core", core_root / "alembic.ini", core_root, sync_url)
    _run_alembic(
        "Townlight Records",
        records_root / "alembic.ini",
        records_root / "alembic",
        database_url,
    )
    if profile in {"city-core", "meetings-beta", "zoning-beta"}:
        clerk_root = _package_root("civicclerk") / "migrations"
        _run_alembic("Townlight Meetings", clerk_root / "alembic.ini", clerk_root, sync_url)
    if profile in {"city-core", "zoning-beta"}:
        code_root = _package_root("civiccode") / "migrations"
        _run_alembic("Townlight Code", code_root / "alembic.ini", code_root, sync_url)

    # Townlight Access is part of Records beta. Its constructor performs an idempotent
    # CREATE SCHEMA/create_all bootstrap; failure must fail the release runtime migration.
    from civicaccess.access_review import AccessibilityReviewRepository

    repository = AccessibilityReviewRepository(db_url=sync_url)
    from civicsuite_runtime.access_bridge import ensure_native_schema
    try:
        ensure_native_schema(repository.engine)
        from civicsuite_runtime.records_import_store import ensure_schema
        ensure_schema(repository.engine)
        from civicsuite_runtime.native_accounts import metadata as account_metadata
        account_metadata.create_all(repository.engine)
        if profile in {"city-core", "zoning-beta"}:
            from civicsuite_runtime.code_meetings import ensure_schema as ensure_connections
            ensure_connections(repository.engine)
    finally:
        repository.engine.dispose()
    print("Townlight Access: schema ensured (civicaccess-windows-local-state-v1)")
    if profile == "zoning-beta":
        zoning_root = _package_root("civiczone") / "migrations"
        _run_alembic("Townlight Zoning", zoning_root / "alembic.ini", zoning_root, sync_url)


def main() -> int:
    upgrade_all()
    print("Townlight product database migrations verified", flush=True)
    return 0


if __name__ == "__main__":
    os._exit(main())
