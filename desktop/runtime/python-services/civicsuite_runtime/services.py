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
    if profile not in {"records-beta", "meetings-beta", "city-core", "zoning-beta", "planning-preview"}:
        raise RuntimeError(f"Unsupported Townlight product profile: {profile}")
    return profile


def _required_module_imports(profile: str) -> list[tuple[str, str]]:
    imports = list(RECORDS_BETA_MODULE_IMPORTS)
    if profile in {"city-core", "zoning-beta", "planning-preview"}:
        imports.extend(CITY_CORE_EXTRA_MODULE_IMPORTS)
    elif profile == "meetings-beta":
        imports.append(("civicclerk", "civicclerk.main"))
    if profile in {"zoning-beta", "planning-preview"}:
        imports.append(("civiczone", "civiczone.geo_import"))
    if profile == "planning-preview":
        imports.append(("civicplan", "civicplan.workflow_store"))
    return imports


def _profile_root() -> Path:
    explicit = os.environ.get("TOWNLIGHT_PROFILE_ROOT")
    if explicit:
        if not Path(explicit).is_absolute():
            raise RuntimeError("The Townlight profile root must be absolute.")
        return Path(explicit)
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
    if _product_profile() in {"city-core", "zoning-beta", "planning-preview"}:
        if not os.environ["DATABASE_URL"].startswith("postgresql"):
            raise RuntimeError("DATABASE_URL must be a PostgreSQL URL")
        os.environ["CIVICCODE_SOURCE_REGISTRY_DB_URL"] = _sync_database_url(
            os.environ["DATABASE_URL"]
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
    from app.models.records_files import RequestFileEvidence, RequestReleaseCopy
    from app.models.records_artifacts import RequestArtifact, RequestPublication
    from app.models.document import DataSource, Document
    from app.models.request import RequestDocument
    from app.models.request import RecordsRequest
    from app.models.request_workflow import RequestMessage, RequestPublicStatus, RequestTimeline
    from app.models.search import SearchQuery, SearchResult, SearchSession
    from sqlalchemy import select

    database = create_engine(_sync_database_url(os.environ["DATABASE_URL"]), pool_pre_ping=True)
    try:
        with database.connect() as connection:
            for model in (RecordsRequest, RequestTimeline, RequestPublicStatus, RequestMessage,
                          RequestEvidenceNote, RequestExemptionDecision, SearchSession, SearchQuery,
                          SearchResult, FeeLineItem, FeeWaiver, NotificationLog, AuditLog,
                          DataSource, Document, RequestDocument, RequestFileEvidence, RequestReleaseCopy,
                          RequestArtifact, RequestPublication):
                connection.execute(select(model).limit(0))
            from civicaccess.access_review import accessibility_review_records, audit_events
            from civicsuite_runtime.access_bridge import review_advice, review_exports
            from civicsuite_runtime.records_import_store import imports, legacy_audit
            from civicsuite_runtime.native_accounts import accounts
            for table in (accessibility_review_records, audit_events, review_advice, review_exports, imports, legacy_audit, accounts):
                connection.execute(select(table).limit(0))
        return {"ok": True, "reason": "domain-schema-ready"}
    except Exception:  # Connection details/secrets do not belong in readiness responses.
        return {"ok": False, "reason": "domain-schema-unavailable"}
    finally:
        database.dispose()


def _code_database_status() -> dict[str, Any]:
    engine = None
    try:
        database_url = os.environ.get("CIVICCODE_SOURCE_REGISTRY_DB_URL", "")
        if not database_url.startswith("postgresql"):
            raise ValueError("Code requires PostgreSQL.")
        from civiccode.models import Base
        from civiccode import (
            import_connectors,
            operational_state,
            ordinance_handoff,
            plain_language,
            public_discovery,
            section_lifecycle,
            source_registry,
            staff_workbench,
        )
        from sqlalchemy import select

        keyed_tables: dict[str, Any] = {}
        for table in Base.metadata.tables.values():
            if table.schema == "civiccode":
                keyed_tables[table.fullname] = table
        for module in (
            source_registry,
            section_lifecycle,
            staff_workbench,
            plain_language,
            import_connectors,
            operational_state,
            ordinance_handoff,
            public_discovery,
        ):
            metadata = getattr(module, "metadata", None)
            if metadata is None:
                continue
            for table in metadata.tables.values():
                if table.schema == "civiccode":
                    keyed_tables[table.fullname] = table
        tables = list(keyed_tables.values())
        if not tables:
            raise RuntimeError("Code schema unavailable.")
        engine = create_engine(
            database_url,
            pool_pre_ping=True,
            connect_args={"connect_timeout": 5},
        )
        with engine.connect() as connection:
            for table in tables:
                connection.execute(select(table).limit(0))
            from civicsuite_runtime.code_meetings import connections
            connection.execute(select(connections).limit(0))
        return {"ok": True, "reason": "code-schema-ready"}
    except Exception:
        return {"ok": False, "reason": "code-schema-unavailable"}
    finally:
        if engine is not None:
            engine.dispose()


def _zoning_database_status() -> dict[str, Any]:
    engine = None
    try:
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            return {"ok": False, "reason": "zoning-schema-unavailable"}
        from civiczone.geo_import import readiness

        engine = create_engine(_sync_database_url(database_url), pool_pre_ping=True)
        result = readiness(engine)
        if isinstance(result, dict):
            return {
                "ok": bool(result.get("ok")),
                "reason": result.get("reason", "zoning-schema-ready"),
            }
        ok = bool(result)
        return {
            "ok": ok,
            "reason": "zoning-schema-ready" if ok else "zoning-schema-unavailable",
        }
    except Exception:
        return {"ok": False, "reason": "zoning-schema-unavailable"}
    finally:
        if engine is not None:
            engine.dispose()


def _planning_database_status() -> dict[str, Any]:
    """Read-only gate; migrations never run in a request or readiness check."""
    try:
        from civicplan.migrations import ready, source_engine
        engine = source_engine(_sync_database_url(os.environ["DATABASE_URL"]))
        try:
            ok = ready(engine)
        finally:
            engine.dispose()
        ok = ok and _code_database_status()["ok"] and _zoning_database_status()["ok"]
        from civicsuite_runtime.meetings_bridge import readiness
        ok = ok and readiness()
        return {"ok": bool(ok), "reason": "planning-schema-ready" if ok else "planning-schema-unavailable"}
    except Exception:
        return {"ok": False, "reason": "planning-schema-unavailable"}


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
    from civicsuite_runtime.records_cutover import verify_activation
    domain_enabled = domain_enabled or verify_activation(_profile_root(), os.environ["DATABASE_URL"])

    modules = frozenset(module_id for module_id, _ in _required_module_imports(_product_profile()))
    domain_app = create_app(
        desktop_profile_root=_profile_root(), desktop_enabled_modules=modules,
        desktop_domain_enabled=domain_enabled,
    )
    from civicsuite_runtime.access_bridge import router as access_router
    domain_app.include_router(access_router)
    from civicsuite_runtime.records_snapshot import router as snapshot_router
    domain_app.include_router(snapshot_router)
    if _product_profile() in ("meetings-beta", "city-core", "zoning-beta", "planning-preview"):
        from civicsuite_runtime.meetings_bridge import router as meetings_router
        domain_app.include_router(meetings_router)
        from civicsuite_runtime.meetings_bridge import public_router as meetings_public_router
        domain_app.include_router(meetings_public_router)
        from civicclerk.records_sources import public_documents
        from civicsuite_runtime.meetings_bridge import database_url, readiness
        def meetings_sources(query="", source_id=None):
            if not readiness():
                raise RuntimeError("Meetings schema unavailable.")
            return public_documents(database_url(), query=query, source_id=source_id)
        domain_app.state.desktop_meetings_sources = meetings_sources
    if _product_profile() in ("city-core", "zoning-beta", "planning-preview"):
        from civicsuite_runtime.code_bridge import router as code_router
        domain_app.include_router(code_router)
        from civicsuite_runtime.code_meetings_bridge import code_router as code_connections, meetings_router as meeting_connections
        domain_app.include_router(code_connections)
        domain_app.include_router(meeting_connections)
        from civicsuite_runtime.code_public import router as code_public_router
        domain_app.include_router(code_public_router)
        from civicsuite_runtime.code_records import public_documents as code_documents
        def code_sources(query="", source_id=None, as_of=None):
            if not _code_database_status()["ok"]:
                raise RuntimeError("Code source registry unavailable.")
            return code_documents(os.environ["CIVICCODE_SOURCE_REGISTRY_DB_URL"],
                                  query=query, source_id=source_id, as_of=as_of)
        domain_app.state.desktop_code_sources = code_sources
    if _product_profile() in ("zoning-beta", "planning-preview"):
        from civicsuite_runtime.zoning_bridge import public_router, router as zoning_router
        domain_app.include_router(zoning_router)
        domain_app.include_router(public_router)
        from civicsuite_runtime import zoning_records
        def zoning_sources(query="", source_id=None):
            if not (_zoning_database_status()["ok"] and _code_database_status()["ok"]):
                raise RuntimeError("Zoning sources unavailable.")
            return zoning_records.public_documents(
                _sync_database_url(os.environ["DATABASE_URL"]),
                domain_app.state.desktop_meetings_sources, query=query, source_id=source_id)
        domain_app.state.desktop_zoning_sources = zoning_sources
    if _product_profile() == "planning-preview":
        from civicsuite_runtime.planning_bridge import router as planning_router, public_router as planning_public
        from civicsuite_runtime.planning_connections import configure
        configure(domain_app, domain_app, _sync_database_url(os.environ["DATABASE_URL"]))
        domain_app.include_router(planning_router)
        domain_app.include_router(planning_public)
    async def demo_marker(session):
        from sqlalchemy import select
        from civicsuite_runtime.records_import_store import imports
        return await session.scalar(select(imports.c.demo_fixture).limit(1))
    domain_app.state.desktop_demo_marker = demo_marker
    async def sync_native_identity(session):
        from civicsuite_runtime.native_accounts import provision_accounts
        return await provision_accounts(session, _profile_root())
    domain_app.state.desktop_identity_sync = sync_native_identity

    @asynccontextmanager
    async def runtime_lifespan(app):
        yield
        await domain_engine.dispose()

    app = FastAPI(title='Townlight local runtime', lifespan=runtime_lifespan)

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
        if database["ok"] and _product_profile() in ("meetings-beta", "city-core", "zoning-beta", "planning-preview"):
            from civicsuite_runtime.meetings_bridge import readiness
            if not readiness():
                database = {"ok": False, "reason": "meetings-schema-unready"}
        if database["ok"] and _product_profile() in ("city-core", "zoning-beta", "planning-preview"):
            database = _code_database_status()
        if database["ok"] and _product_profile() in ("zoning-beta", "planning-preview"):
            database = _zoning_database_status()
        if database["ok"] and _product_profile() == "planning-preview":
            database = _planning_database_status()
            providers = getattr(domain_app.state, "planning_providers", {})
            required = {"civicplan", "civicrecords-ai", "civicclerk", "civiccode", "civiczone", "civicaccess"}
            if (set(providers) != {"meetings", "zoning"} or not all(callable(p) for p in providers.values())
                    or not required.issubset(domain_app.state.desktop_enabled_modules)):
                database = {"ok": False, "reason": "planning-providers-unavailable"}
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
