"""Load the existing pinned Redstone Valley fixture into canonical Records."""
import asyncio
import hashlib
import json
import os
from pathlib import Path
import time
import uuid

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.auth.desktop_session import validate_native_session
from app.audit.logger import write_audit_log
from app.models.request import RecordsRequest
from app.models.audit import AuditLog
from app.models.document import DataSource
from civicsuite_runtime.access_bridge import reviews
from civicsuite_runtime.records_import import normalize_record
from civicsuite_runtime.records_import_store import imports, legacy_audit, import_record
from civicsuite_runtime.native_accounts import accounts

FIXTURE_HASH = "a9c242a3f2618a69d7effb1d0d17d2df06f6744c8c351bba4065d315c94575b4"


def fixture():
    path = Path(__file__).parent / "fixtures" / "redstone-valley-records-demo-v1.json"
    data = json.loads(path.read_bytes())
    supplied = data.pop("fixture_sha256")
    actual = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    if supplied != FIXTURE_HASH or actual != FIXTURE_HASH:
        raise ValueError("Canonical demo fixture hash does not match; no demo loaded.")
    return data


async def load_demo(session, root, actor_id):
    data = fixture()
    manifest = data["manifest"]
    current = (await session.execute(sa.select(imports).with_for_update())).mappings().one()
    if current["demo_fixture"] is not None:
        marker = current["demo_fixture"]
        if marker.get("fixture_sha256") != FIXTURE_HASH or not await session.scalar(
                sa.select(RecordsRequest.id).where(RecordsRequest.desktop_id == data["requests"][0]["request_id"])):
            raise ValueError("Existing demo identity does not match; no data overwritten.")
        return marker
    if current["counts"].get("unmigrated_objects", 0):
        raise ValueError("The preserved profile contains other city work; demo loading is unavailable.")
    for table in (RecordsRequest, reviews, legacy_audit, AuditLog):
        if await session.scalar(sa.select(sa.func.count()).select_from(table)):
            raise ValueError("Demo requires an empty profile; existing work was not changed.")
    now = int(time.time())
    request = data["requests"][0]
    mark = manifest["watermark"]
    source_records = {row["record_id"]:row for row in data["records"]}
    search = []
    for index, expected in enumerate(data["expected"]["search"]):
        hits = []
        for record_id in expected["record_ids"]:
            record = source_records[record_id]
            hits.append(dict(id=record_id, title=f"{record['title']} — {mark}",
                citation=f"fixture://{manifest['fixture_id']}/{record_id}",
                summary=f"{record['content']}\n\n{mark}", status="synthetic responsive record"))
        search.append(dict(id=f"rv-search-session-{index+1:04}", query=expected["query"],
            locations=f"Embedded Core fixture {manifest['fixture_id']} v{manifest['fixture_version']}",
            reviewer="Synthetic fixture ground truth", results=hits, created_at_unix_seconds=now))
    titles = "; ".join(row["title"] for row in data["records"] if row["record_id"] in request["target_record_ids"])
    view = normalize_record(root, dict(id=request["request_id"], public_tracking_number="DEMO-REQ-0001",
        requester="Synthetic public requester", summary=f"{request['description']} {mark}",
        submitted_via=f"Townlight canonical demo fixture {manifest['fixture_id']} v{manifest['fixture_version']}",
        deadline="Pending staff deadline review", deadline_basis=f"{request['policy_basis']} — fictional demonstration policy; not legal guidance",
        status="received", search_notes=[f"Canonical fixture targets: {titles}. {mark}"],
        search_sessions=search, fee_estimate="$0.00 synthetic demonstration", citations=[f"Core fixture SHA-256 {FIXTURE_HASH}"],
        timeline=[dict(id="rv-timeline-received-0001", action="received", actor="Townlight demo loader",
            note=f"Loaded canonical synthetic request received at {request['received_at']}. {mark}", created_at_unix_seconds=now)],
        public_status_events=[dict(id="rv-public-status-received-0001", label="Request received",
            summary=f"Synthetic demonstration request only. {mark}", status="received", created_at_unix_seconds=now)],
        created_at_unix_seconds=now))
    source_id = await session.scalar(sa.select(DataSource.id).where(DataSource.name == "Townlight imported Records evidence"))
    if source_id is None:
        raise ValueError("Records import source is missing.")
    await import_record(session, root, view, actor_id, source_id)
    marker = dict(fixture_id=manifest["fixture_id"], fixture_version=manifest["fixture_version"],
        fixture_sha256=FIXTURE_HASH, municipality_name=manifest["municipality"]["name"], watermark=mark, loaded_at_unix_seconds=now)
    await session.execute(imports.update().where(imports.c.profile_id == current["profile_id"]).values(demo_fixture=marker))
    await write_audit_log(session=session, action="load-demo-town", resource_type="request", resource_id=view.request_id,
        user_id=actor_id, details={"note":f"Loaded canonical synthetic fixture {FIXTURE_HASH} after native backup. {mark}"}, commit=False)
    return marker


async def run(root, url, proof):
    from civicsuite_runtime.records_cutover import verify_activation
    if not verify_activation(root, url):
        raise ValueError("Activate Records before loading the demonstration.")
    principal = validate_native_session(proof, profile_root=root)
    if principal.role != "local-admin":
        raise PermissionError("Demo loading requires the local administrator.")
    engine = create_async_engine(url)
    try:
        async with async_sessionmaker(engine)() as session:
            async with session.begin():
                await session.execute(sa.text("SELECT pg_advisory_xact_lock(7265637)"))
                actor_id = await session.scalar(sa.select(accounts.c.user_id).where(accounts.c.email == principal.email))
                if actor_id is None:
                    raise ValueError("No mapped demo operator.")
                return await load_demo(session, root, actor_id)
    finally:
        await engine.dispose()


def main():
    from civicsuite_runtime.services import _set_local_defaults, _profile_root
    _set_local_defaults()
    try:
        asyncio.run(run(_profile_root(), os.environ["DATABASE_URL"], os.environ.pop("TOWNLIGHT_MIGRATION_PROOF", "")))
    except Exception:
        print("Demo was not loaded; existing work was preserved.", flush=True)
        return 1
    print("Canonical synthetic demo loaded or already present; no duplicate created.", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
