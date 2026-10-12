"""Single loopback host for the real Townlight domain app and runtime health."""

from __future__ import annotations

import importlib
import os
import secrets
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from sqlalchemy import create_engine, text

from civicsuite_runtime import __version__

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 15480
PRODUCT_PROFILE_ENV = "TOWNLIGHT_PRODUCT_PROFILE"
RECORDS_BETA_MODULE_IMPORTS = [
    ("civiccore", "civiccore"),
    ("civicrecords-ai", "app.main"),
    ("civicnotice", "civicnotice.main"),
    ("civicaccess", "civicaccess.main"),
]
CITY_CORE_EXTRA_MODULE_IMPORTS = [
    ("civicclerk", "civicclerk.main"),
    ("civiccode", "civiccode.main"),
]


def _product_profile() -> str:
    profile = os.environ.get(PRODUCT_PROFILE_ENV, "records-beta")
    if profile not in {"records-beta", "city-core"}:
        raise RuntimeError(f"Unsupported Townlight product profile: {profile}")
    return profile


def _required_module_imports(profile: str) -> list[tuple[str, str]]:
    imports = list(RECORDS_BETA_MODULE_IMPORTS)
    if profile == "city-core":
        imports.extend(CITY_CORE_EXTRA_MODULE_IMPORTS)
    return imports


def _profile_root() -> Path:
    data_dir = os.environ.get("CIVICSUITE_DATA_DIR")
    if data_dir:
        return Path(data_dir).parent
    local_app_data = os.environ.get("LOCALAPPDATA")
    if local_app_data:
        return Path(local_app_data) / "CivicSuite"
    return Path.home() / "AppData" / "Local" / "CivicSuite"


def _ensure_secret_file(file_name: str, value_factory: Any) -> Path:
    secret_dir = _profile_root() / "config" / "secrets"
    secret_dir.mkdir(parents=True, exist_ok=True)
    path = secret_dir / file_name
    if not path.exists():
        path.write_text(value_factory(), encoding="utf-8")
    return path


def _fernet_key() -> str:
    import base64

    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")


def _set_local_secrets() -> None:
    jwt_path = _ensure_secret_file("jwt_secret.txt", lambda: secrets.token_urlsafe(48))
    admin_path = _ensure_secret_file(
        "first_admin_password.txt",
        lambda: f"CivicSuite-{secrets.token_urlsafe(24)}!1",
    )
    encryption_path = _ensure_secret_file("encryption_key.txt", _fernet_key)
    os.environ.setdefault("JWT_SECRET_FILE", str(jwt_path))
    os.environ.setdefault("FIRST_ADMIN_PASSWORD_FILE", str(admin_path))
    os.environ.setdefault("ENCRYPTION_KEY", encryption_path.read_text(encoding="utf-8").strip())


def _set_local_defaults() -> None:
    os.environ.setdefault(PRODUCT_PROFILE_ENV, "records-beta")
    os.environ.setdefault("PORTAL_MODE", "private")
    os.environ.setdefault("OLLAMA_BASE_URL", "http://127.0.0.1:15434")
    os.environ.setdefault("CIVICCLERK_OLLAMA_BASE_URL", "http://127.0.0.1:15434")
    os.environ.setdefault("CIVICCORE_LLM_PROVIDER", "ollama")
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+asyncpg://civicsuite:civicsuite@127.0.0.1:15432/civicsuite",
    )
    if not os.environ.get("TESTING"):
        _set_local_secrets()


def _module_status(module_id: str, import_name: str) -> dict[str, Any]:
    try:
        module = importlib.import_module(import_name)
    except Exception as exc:  # noqa: BLE001  # pragma: no cover - surfaced through /health
        return {
            "id": module_id,
            "ok": False,
            "import": import_name,
            "error": f"{type(exc).__name__}: {exc}",
        }
    version = getattr(module, "__version__", None)
    package_name = import_name.split(".", 1)[0]
    package = importlib.import_module(package_name)
    return {
        "id": module_id,
        "ok": True,
        "import": import_name,
        "version": version or getattr(package, "__version__", "unknown"),
    }


def _sync_database_url(url: str) -> str:
    return (
        url.replace("postgresql+asyncpg", "postgresql+psycopg2")
        .replace("postgres+asyncpg", "postgresql+psycopg2")
        .replace("postgresql://", "postgresql+psycopg2://", 1)
        .replace("postgres://", "postgresql+psycopg2://", 1)
    )


def _database_status() -> dict[str, Any]:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return {
            "ok": False,
            "status": "missing",
            "message": "DATABASE_URL is not configured for the local runtime.",
        }
    engine = create_engine(_sync_database_url(database_url), pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            task_table = connection.execute(
                text("SELECT to_regclass('public.civiccore_local_tasks')")
            ).scalar()
    except Exception as exc:  # noqa: BLE001  # pragma: no cover - surfaced through /health
        return {
            "ok": False,
            "status": "unavailable",
            "message": f"{type(exc).__name__}: {exc}",
        }
    finally:
        engine.dispose()
    return {
        "ok": task_table == "civiccore_local_tasks",
        "status": "ready" if task_table == "civiccore_local_tasks" else "migrations-needed",
        "message": (
            "Local database and task queue schema are ready."
            if task_table == "civiccore_local_tasks"
            else "Local database is reachable but task queue migrations are not applied."
        ),
    }


def health_payload() -> dict[str, Any]:
    _set_local_defaults()
    profile = _product_profile()
    modules = [
        _module_status(module_id, import_name)
        for module_id, import_name in _required_module_imports(profile)
    ]
    database = _database_status()
    return {
        "status": "ok" if all(item["ok"] for item in modules) and database["ok"] else "degraded",
        "service": "townlight-runtime",
        "version": __version__,
        "product_profile": profile,
        "modules": modules,
        "database": database,
        "local_only": True,
    }


def _domain_database_status() -> dict[str, Any]:
    """A domain schema probe, not merely process/import/TCP health."""
    from app.models.audit import AuditLog
    from app.models.fees import FeeLineItem, FeeWaiver
    from app.models.notifications import NotificationLog
    from app.models.records_evidence import RequestEvidenceNote, RequestExemptionDecision
    from app.models.request import RecordsRequest
    from app.models.request_workflow import RequestMessage, RequestPublicStatus, RequestTimeline
    from app.models.search import SearchQuery, SearchResult, SearchSession
    from sqlalchemy import select

    database = create_engine(_sync_database_url(os.environ["DATABASE_URL"]), pool_pre_ping=True)
    try:
        with database.connect() as connection:
            for model in (RecordsRequest, RequestTimeline, RequestPublicStatus, RequestMessage,
                          RequestEvidenceNote, RequestExemptionDecision, SearchSession, SearchQuery,
                          SearchResult, FeeLineItem, FeeWaiver, NotificationLog, AuditLog):
                connection.execute(select(model).limit(0))
        return {"ok": True, "reason": "domain-schema-ready"}
    except Exception:  # Connection details/secrets do not belong in readiness responses.
        return {"ok": False, "reason": "domain-schema-unavailable"}
    finally:
        database.dispose()


def create_runtime_app(*, domain_enabled: bool = False):
    """Mount the existing application; packaged migrations are explicit.

    The web app's Docker-specific lifespan must NOT run on Windows. The outer
    runtime owns lifespan; Starlette does not run mounted subapp lifespans.
    Production domain writes stay inactive until validated coherent cutover.
    The explicit enabled argument is also the isolated candidate test seam.
    """
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    _set_local_defaults()
    from app.main import create_app
    from app.database import engine as domain_engine

    modules = frozenset(module_id for module_id, _ in _required_module_imports(_product_profile()))
    domain_app = create_app(
        desktop_profile_root=_profile_root(), desktop_enabled_modules=modules,
        desktop_domain_enabled=domain_enabled,
    )

    @asynccontextmanager
    async def runtime_lifespan(app):
        yield
        await domain_engine.dispose()

    app = FastAPI(title="Townlight local runtime", lifespan=runtime_lifespan)

    @app.get("/health")
    @app.get("/modules")
    def runtime_health():
        payload = health_payload()
        return JSONResponse(payload, status_code=200 if payload["status"] == "ok" else 503)

    @app.get("/ready")
    def domain_ready():
        if not domain_app.state.desktop_domain_enabled:
            return JSONResponse({"status": "not-ready", "reason": "domain-inactive"}, status_code=503)
        database = _domain_database_status()
        return JSONResponse(
            {"status": "ready" if database["ok"] else "not-ready", "reason": database["reason"]},
            status_code=200 if database["ok"] else 503,
        )

    app.mount("/", domain_app)
    return app


def main() -> int:
    host = os.environ.get("CIVICSUITE_RUNTIME_HOST", DEFAULT_HOST)
    if host != DEFAULT_HOST:
        raise RuntimeError("The Townlight native domain runtime must bind to 127.0.0.1 only.")
    port = int(os.environ.get("CIVICSUITE_RUNTIME_PORT", str(DEFAULT_PORT)))
    import uvicorn

    print(f"Townlight runtime services listening on http://{host}:{port}", flush=True)
    uvicorn.run(create_runtime_app(), host=host, port=port, access_log=False, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
