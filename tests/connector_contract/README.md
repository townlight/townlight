# Connector extraction contract checks

Run these against this checkout's Runtime and the candidate's pinned Core and
Meetings packages in an isolated Python environment. No provider or application
service is contacted. Never point test configuration at a live profile/database.

```powershell
python -m pytest tests/connector_contract -q
```

From `desktop`, run `node tests/meeting-import-contract.mjs` to exercise the
TypeScript-to-native request adapter for every configured baseline case. This
does not substitute for Rust transport or installed runtime acceptance.

For all 34 original-capture cases, set `TOWNLIGHT_CONNECTOR_BASELINE` to an
absolute directory containing the retained captures and `cases.json` with
original preview hashes, namespaces and counts. The test pins that manifest's
SHA256. Without that evidence directory, those 34 cases explicitly skip, not
pass. Keep the unchanged original expectations; do not regenerate them from the
new parser.

The small checked-in JSON fixture is synthetic. Persistence tests use a fresh
temporary SQLite file and seed a released-schema row independently of the
normalizer. They check saved IDs/hashes, repeat outcomes, failure halfway through
agenda creation, retry, concurrent claims, and close/reopen state.

These checks cover application compatibility and durable SQLite behavior, not a
PostgreSQL migration, native staff authorization, complete downstream handoffs,
installed 1.8.1.1 profile migration, signed installer acceptance, or live vendor
write acceptance. Those remain separate gates.
