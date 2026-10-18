"""Fenced native migration entrypoint. No public HTTP migration endpoint."""
import asyncio
import json
import os
from pathlib import Path
import stat

# CLI imports initialize backend settings, so configure the local profile first.
if __name__ == "__main__":
    from civicsuite_runtime.services import _set_local_defaults
    _set_local_defaults()

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.auth.desktop_session import validate_native_session
from civicsuite_runtime.native_accounts import provision_accounts
from civicsuite_runtime.records_import import stable_id, unique_object
from civicsuite_runtime.records_import_store import import_snapshot, imports


def journal_path(root):
    return root / "config" / "records-authority.json"


def read_journal(root):
    path = journal_path(root)
    if not path.exists():
        return None
    value = json.loads(path.read_bytes(), object_pairs_hook=unique_object)
    if (not isinstance(value, dict) or value.get("schema_version") != 1
            or value.get("phase") not in {"importing", "active"}
            or not isinstance(value.get("source_sha256"), str)
            or len(value["source_sha256"]) != 64 or not isinstance(value.get("backup_path"), str)):
        raise ValueError("Records activation journal is invalid; no authority was selected.")
    return value


def verify_activation(root, database_url):
    journal = read_journal(root)
    if journal is None or journal["phase"] != "active":
        return False
    engine = sa.create_engine(database_url.replace("+asyncpg", "+psycopg2"))
    try:
        with engine.connect() as connection:
            fingerprint = connection.scalar(sa.select(imports.c.source_sha256).where(
                imports.c.profile_id == stable_id(root, "profile", "records")))
            if fingerprint != journal["source_sha256"]:
                raise ValueError("Records activation does not match committed import evidence.")
    finally:
        engine.dispose()
    return True


async def cutover(root, database_url, proof):
    journal = read_journal(root)
    if journal is None:
        raise ValueError("Native migration must establish its writer fence and backup first.")
    principal = validate_native_session(proof, profile_root=root)
    if principal.role != "local-admin":
        raise PermissionError("Only the configured local administrator can activate Records.")
    engine = create_async_engine(database_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            async with session.begin():
                identities = await provision_accounts(session, root)
                receipt = await import_snapshot(session, root, journal["source_sha256"],
                    Path(journal["backup_path"]), identities[principal.email])
        # Database commit precedes activation. If interrupted here, retry finds
        # the identical receipt; it never imports twice or chooses JSON again.
        if receipt["source_sha256"] != journal["source_sha256"]:
            raise ValueError("Import receipt mismatch; profile remains unavailable.")
        active = {**journal, "phase":"active"}
        path = journal_path(root)
        temporary = path.with_suffix(".pending")
        with temporary.open("w", encoding="utf-8") as output:
            json.dump(active, output, sort_keys=True)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, path)
        # Historical JSON is not a fallback or a lossless rollback after SQL writes.
        from app.requests.files import managed_records_root
        source = managed_records_root(root).parent.parent / "workflows" / "city-work.json"
        source.chmod(stat.S_IREAD)
        return receipt
    finally:
        await engine.dispose()


def main():
    from civicsuite_runtime.services import _set_local_defaults, _profile_root
    _set_local_defaults()
    try:
        asyncio.run(cutover(_profile_root(), os.environ["DATABASE_URL"], os.environ.pop("TOWNLIGHT_MIGRATION_PROOF", "")))
    except Exception:
        # Never emit exception context containing account data or a DB URL.
        print("Records migration was not activated. Original evidence remains preserved; consult the local migration state.", flush=True)
        return 1
    print("Records import committed and activation journal completed.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
