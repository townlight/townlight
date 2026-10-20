# Townlight desktop

Release candidate: **Records + Meetings + Code 1.3.0-beta.1**; synchronized
desktop build 1.3.0-1 (MSI 1.3.0.1). The city-core payload contains all six
connected capabilities. Default Records selection and application identities
are unchanged. Final signed-byte verification is pending; local evidence below
describes earlier candidate bytes, not the final release.

Status: local Code C4 connected acceptance and bounded source retirement complete
(October 20, 2026). The published Records–Meetings `1.2.0-beta.1` baseline and its signed
assets are unchanged. The current local installer is **UNSIGNED**, retains
build metadata `1.2.0-1`, and is not approved for publication. No Code public
release/version promotion is implied.

The following Records beta.3 version notes are historical baseline context.

This working branch builds on the Records beta.2 rc.3 baseline. Unsigned local
integration acceptance passed; the final signed release bytes have a separate
publication gate.

The public candidate label is `1.1.0-beta.3`, using tag
`townlight-records-v1.1.0-beta.3`. Its synchronized desktop build
manifests use the MSI-compatible SemVer prerelease `1.1.0-3`, which Tauri maps
to WiX ProductVersion `1.1.0.3`. The numeric form is installer metadata; it does
not rename or promote the public beta candidate.

This directory contains the Tauri/WebView2 desktop application used by the
Townlight Windows installer. The first public product profile is **Townlight
Records**, comprising:

- Townlight Core — local platform, audit, storage, runtime, and lifecycle
- Townlight Records — intake, search, review, approval, export, fulfillment,
  and public status
- Townlight Notice — deterministic notice and deadline workpapers
- Townlight Access — accessibility review and records-ready exports

Fresh installations select the dependency-closed `records-beta` profile.
Existing saved module selections are preserved. Meetings and Code remain in
the catalog but are not installed by the Records beta profile.

## Product behavior

The operator path is local-first and requires no Docker, WSL, terminal, or
developer tooling. It provides Staff, Resident/Public, and IT/Admin surfaces;
human approval before a response can be released; local audit history; backup,
restore, repair, and uninstall entry points; and an explicit fictional
demo-town loader.

Successfully replacing response text, manually or through local AI, requires
fresh human approval before export. Failed generation, identical-text saves,
and unrelated request changes preserve approval. Historical notes and exports
are retained. Earlier beta.2 drafts are preserved but not accepted for publication.

The demo loader is local-admin-only, never automatic, accepts only an empty
profile, creates and verifies a backup before mutation, and imports the pinned
Redstone Valley fixture with its hashes and synthetic-data watermark.

## Current architecture boundary

### Local connected C4 installed evidence (not a published release)

The installed `city-core` candidate selects Core, Records, Meetings, Code,
Notice and Access. The supervisor must preserve the exact `city-core` runtime
profile for both migrations and API startup; defaulting it to `records-beta`
omits the Meetings/Code routes and is covered by a focused regression test.

The corrected local MSI has SHA-256
`117d031797cc98ec46d9e28ea56004464a3694a797eea8302e55ada17f580912`.
Its installed EXE is
`997dcae9ef7d9675125eaec5230bbcb28049a7c991e7203baf431032a6e359e7`.
The build-side EXE differs only by Tauri's documented UNK-to-MSI bundle marker.
Neither file is signed or authorized for distribution.

Actual installed evidence covers the Meetings lifecycle, explicit Code adoption
without mandatory motion/minutes, separate codification, and attaching the same
council's public minutes and ordinance to one Records draft with source hashes.
Connected backup/restore, repair, offline restart/readback and new offline
intake passed. Upgrade from the signed Records–Meetings `1.2.0-beta.1` MSI
passed with the exact prior Records request, full proceedings snapshot and nine
managed file hashes preserved. The new connected Code journey and source-file
hashes also passed after upgrade.

For this local upgrade, close the predecessor normally, install the C4 MSI,
select `city-core` in Settings, and use System Health's **Repair** control for
Townlight Records services to refresh the per-user cached Python payload and
run the selected profile's migrations. Merely replacing Program Files is not
proof that the cached services are current. If the maintenance guard reports an
outstanding Records/file operation, let the initial unavailable-service refresh
finish before retrying; do not bypass the guard or reset municipal data.

The final connected synthetic response/export also passed on these exact bytes:
both public Code and Meetings sources were reviewed through the installed UI,
their unchanged release copies were attached, a two-document release package
was built, and the fictional response was explicitly approved/exported under
the owner's test-only authorization. Independent guest and preserved-host
hashes match both exports and their integrity manifests; source/release-copy
hashes and version citations are retained. This was a scripted fictional clerk,
not a real municipal approval or disclosure. Evidence: `c4-response` in the
existing execution workspace.

This does not certify all historical suite requirements. Scott accepted this
candidate's independent fresh-install and upgrade proof for bounded retirement.
The subsequent local source cleanup removes the JSON municipal action handlers
and expired Rust parity adapter. The compatibility types, historical read-side
privacy projection, version/backup protections, migration lock and source
initialization remain. The old action entry point refuses without creating or
changing workflow JSON, including before activation; use **Finish Records
Migration** to activate the Python product path. No automatic JSON fallback was
introduced.

The MSI identified above is the preserved **pre-retirement** installed proof,
not a claim that its bytes contain the later source deletion. Post-retirement
native/security/schema checks are recorded separately in `CHECKS.md`. No new
installer, push, merge, signing or publication is implied by this cleanup.

### Local Code C1 integration (not a published release)

The `city-core` selection comprises Core, Records, Meetings, Code, Notice and
Access. Its Code candidate uses the existing Python Code package and the same
PostgreSQL database as the other products. The runtime checks actual canonical
and repository tables before reporting Code ready; it does not use an in-memory
Code store as a fallback.

`src/code/client.ts` and `src/code/view.js` carry imports, source/hierarchy
inspection, dated lookup, version history, exact citations, citation-grounded
search, questions and section exports through `code_domain_request`. Rust is a
fixed-loopback transport with native identity/module checks, not a second Code
implementation. The screen is selected only for activated Python authority.

Public `/civiccode` views reuse existing Code renderers and public summaries.
They do not mount the standalone application's staff endpoints or expose staff
interpretation notes. Unavailable authoritative public sources produce refusal;
explanations are reading aids, not law or legal determinations.

This C1 baseline is separate from the C2 handoff described below, Code–Records
evidence linkage and installed three-product acceptance. The delivered
Records–Meetings `1.2.0-beta.1` release and its signed artifacts remain unchanged.

Local C1 native acceptance passed October 20, 2026: the real Tauri application
imported a synthetic authoritative source, retrieved current and date-specific
text, displayed both versions and an exact source-linked citation, and retained
the same history/citation after a real Python service restart. Missing-section
citation was refused. The disposable city-core profile used genuine Records
activation and PostgreSQL; no mocked native commands or activation bypass.
This is local development acceptance, not installed MSI/upgrade or public
three-product release evidence; those remain the later C4 stage.

### Local Code–Meetings C2 connection (not a published release)

In the `city-core` candidate, Code staff can send a proposed amendment from an
existing source version to a saved meeting. The delivery creates one canonical
agenda item and a durable connection in the same PostgreSQL transaction. The
connection retains the original source text/version/hash, exact proposed text
and hash, actor, receiving meeting/agenda identity, and confirmed delivery.
Use the same stable connection key and unchanged inputs to retry. A changed
proposal uses a new key, the prior connection ID and an explicit correction
note; earlier material remains intact.

Meetings staff can read the connection and explicitly record adopted, not
adopted, deferred or withdrawn. No motion, minutes or suggested meeting stage is
required. Optional evidence references are labeled human-supplied/unverified;
absence is recorded, not treated as a prohibition. Corrections append a new
decision with a reference to the prior decision and a note, retaining both.

Code staff record codification separately, explicitly selecting the source,
new version ID, body, effective dates and whether the version is current. This
does not infer adoption or effective dates from meeting stages. An adopted
decision must actually be the one linked when describing a version as adopted
law. Differing codified text requires an explanation. Closeout retries do not
duplicate a version; subsequent correction uses a linked new proposal rather
than rewriting the accepted closeout. Earlier source versions and decision
evidence remain available. A future-effective, non-current version does not
silently replace current law. Existing date-specific conflict/refusal rules
remain in force; the connection does not silently reconcile conflicting law.

Both product screens have list/read controls and a button opening the same
connection in the other product. Permissions and native actor identity remain
enforced. Rust adds fixed transport routes only; municipal behavior remains in
Python. The new connection table is ensured during explicit city-core migration
and checked by readiness; request handlers do not create missing schema.

C2 is local integration work only: no external publication, installer upgrade
claim, Code–Records C3 work or C4 release acceptance is implied.
Local C2 acceptance passed October20,2026: actual PostgreSQL/API proposal,
explicit decisions/corrections, codification, duplicate-free retry, database/API
restart and transaction rollback; existing integration/native/static checks and
headless per-product controls passed. Headless component proof used mocked
native transport and does not substitute for installed C4 acceptance.

### Local Code–Records C3 evidence connection (not a published release)

In the connected `city-core` profile, open a Records request and use **Scope &
Search → Find Code documents**. Search a section number or authoritative text.
Leave **As of** blank for the current adopted version, or supply a date for a
historical version. Each result shows its version identity, effective dates,
selected date, authoritative-text preview and exact citation. The Meetings
source controls are also available in this connected profile.

Select **Attach to selected Records request** to preserve the complete public
records-ready Code export, not a generated summary. The managed file includes
the exact authoritative body, section/version/date context, source provenance,
citation and information-not-legal-advice boundary. Records retains its source
identity, SHA-256, native actor and audit history. A retry with identical inputs
does not create duplicate evidence. Source permissions and current bytes are
rechecked before attachment: an inactive, stale, restricted or non-official
source is not substituted, and a changed hash requires a fresh selection.
Ambiguous historical versions are not guessed. Staff interpretation notes are
not searched or exported through this connection.

The operator can use both permitted meeting snapshots and ordinance exports in
the same response. Attachment does not approve or publish anything, does not
revoke an unrelated existing response approval, and adds no meeting-stage,
motion or minutes-adoption requirement. The existing explicit human response
approval and verified-file export remain unchanged. Previously attached source
snapshots and source history are not rewritten when the source changes later.

Local C3 acceptance passed October20,2026: a real PostgreSQL/loopback-service
Records request attached current and historical Code plus public draft meeting
minutes, produced an explicitly human-approved response, and preserved its
readback across a service restart. Tests covered source permissions, changed
provenance/hash, ambiguous dates and duplicate-free retries. Headless Edge
verified the date/selection controls and inert source HTML using mocked native
transport; real API/database evidence is separate. This is not installed C4,
MSI upgrade, signing or publication evidence.

### Records authority background

The historical beta's user-facing workflows executed in Rust. This local
convergence candidate explicitly activates Python/PostgreSQL for Records and
its integrated Access/notification behavior. Typed native transport carries the
authenticated operations; Rust retains OS/file integration and supervision.
After activation, current reads and writes do not fall back to the preserved
JSON snapshot. An unavailable service produces an unavailable state, not an
empty or competing Records database.

The `records-beta` profile does not enable Meetings or Code. The connected
Records–Meetings release uses `meetings-beta`; the local Code candidate described
above adds Code under `city-core`. The bounded six-module JSON action
implementations and temporary Rust parity adapter have now retired locally;
historical data types/read-side migration support remain intentionally.

For this local convergence candidate, upgrading the MSI does not by itself
activate the new domain authority. In **System Health**, use **Repair** on
**Townlight Records services** to refresh the existing per-user runtime, then
use **Finish Records Migration** as the local administrator. The application
preserves and validates the old evidence before activation. After migration,
the old JSON is not a rollback source for newer SQL work; use the supported
database/files backup and restore controls.

Convergence to one Python/PostgreSQL domain execution path is a blocking gate
before Townlight Meetings. New domain behavior should not be added to the Rust
shell as a permanent second implementation.

## Local checks

From this directory:

```powershell
npm ci
npm test
npm run build
npm run test:browser
npm audit --audit-level=moderate
```

From `desktop/src-tauri`:

```powershell
cargo fmt --check
cargo test -- --test-threads=1
```

The MSI lifecycle is verified by
`.github/workflows/desktop-windows-msi.yml`. Pull requests produce a visibly
named unsigned internal-QA artifact. Only a manual run on `main` can use Azure
Artifact Signing and produce a publication-eligible MSI signed as
`CN=Scott Converse`.

## Compatibility identities

Public product and publisher strings use Townlight. Existing technical
identities remain intentionally stable during this beta, including the Rust
crate/npm package names, `civic*` module IDs/imports, `CIVIC*` environment
variables, database/schema names, the Tauri identifier
`org.civicsuite.desktop`, the MSI UpgradeCode, and legacy local-data discovery
under `%LOCALAPPDATA%\CivicSuite`.
