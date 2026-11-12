# Shared meeting imports

## QuorumRelay source candidate

This Townlight 1.8.2 source candidate pins QuorumRelay `0.1.0.dev6` in the bundled runtime. Vendored wheel SHA-256: `ec1e6c55dc29338dcf3033a1f8bba92bec1975f0108cbb92e2e2e18a4ec19ee1`. QuorumRelay source commit `4b1c27ca571d1b781233fcd03389ce99ddf58932` is integrated in Townlight source commit `438c9bbeeeddcccf967ecea8e02b1c3a556699b3`. The compatibility baseline remains 31 provider families and 34 input-format paths; it does not certify full discovery, pagination or every operation for each provider.

The source candidate adds the profile-scoped connector workspace at authenticated native route `POST /desktop/v1/meetings/connectors/run`. Its operation contract covers provider/capability listing, source identification/configuration, bounded discovery and fetch, local search, import preview/save, evidence persistence, export, write planning/commit, and receipt/status operations. This route remains inside the Townlight runtime and existing staff authorization boundary; it is not a separate public service or an independent MCP endpoint. The source bridge and workspace are `desktop/runtime/python-services/townlight_runtime/connector_bridge.py` and `connectors.py`. See the [candidate native API schema](https://townlight.github.io/api/candidate-1.8.2/suite-openapi.json); it is generated from source composition and does not establish installed endpoint behavior.

### Bounded dev6 capabilities and limits

- **Granicus Clip metadata search:** QuorumRelay has a native same-origin ViewPublisher search route. A bounded public read against Superior returned five results on the first page and five distinct results after resume; both are `partial`. The provider supplies candidates from its observed first-expression form, and local exact matching is limited to title and meeting-date metadata. It does not establish a complete catalog, document search, transcript search or Townlight panel access to native search. The Townlight panel's **Save searchable evidence** action remains local search over captured evidence.
- **CivicClerk media preview:** captured Erie event 1277 contains the provider's exact HTTPS `.mp4` `mediaStreamPath`; preview retains that URL and exposes it as `video_url` for the Station recording handoff. This one captured URL does not establish live portal coverage, video playback or a completed Station handoff.
- **CivicPlus Select file preparation:** the bounded exporter recognizes `Agenda`, `Agenda Packet`, `Minutes`, `Notice` and `Other` PDF files plus `Media` MP4 files, using the linked filename tester as a classifier. A captured MP4 passed bounded container framing and byte/hash preservation. This is file preparation only: it does not establish codec/playability, consultant or vendor acceptance, ZIP import or FTP upload. The panel's neutral evidence exports are not the CivicPlus vendor importer.

These examples describe bounded core behavior and its current evidence, not full provider acceptance. Per-provider read/write acceptance remains separate; no authorized provider test tenant or credentials were supplied.

### Meetings panel workflow

The source candidate adds **External meeting evidence** to the Meetings workspace. The panel loads the provider and saved-format lists, plus sources and captured results for the current Townlight profile.

1. Use **Identify URL** or **Inspect provider capabilities**, select the provider/format, enter the original URL and optional body, and **Save validated source**. The live-discovery checkbox defaults on; uncheck it to configure a saved-format reader. Optional provider options are JSON and must use documented fields. Do not enter passwords or tokens. A transition to a different source identity requires a local administrator and explicit evidence-backed ID mappings; the **new source** checkbox is only for a separate source.
2. For ordinary discovery, choose inclusive from/through dates and submit **Discover / read saved response**. A selected capture can be up to 16 MiB. For a namespace-bound account read, use **Authorized account fetch** with credentials already configured server-side and only documented provider request fields; the UI does not accept credentials. Account fetch clears the ordinary date bounds because those filters do not apply to this request.
3. Inspect the result status, errors and coverage. `partial` is not complete coverage. **Reopen result** reads saved output. **Save searchable evidence** stores evidence for local search; terms and phrases are entered as exact lines, with optional date filters. **Next result page** continues the selected result's display.
4. **Preview canonical import** lists meeting selections. Review the selected source and use **Save selected canonical meeting** to save the exact selection; a new preview is required if the source changes. **Export evidence** offers ZIP, JSON, JSONL, CSV meetings, CSV items and iCalendar.
5. **Explicit provider action** is disabled unless an exact server-owned source grant and local administrator role enable it. Review the displayed plan and hash, explicitly approve that exact plan, then commit. Provider credentials are required where the provider requires them and are configured server-side; the panel never accepts credential values. Ingestion, search, import and export do not perform provider writes.

For a failed or uncertain local response, reopen saved results before retrying the same operation. This UI guide is source-candidate guidance and is not 1.8.2 installed acceptance.

### Service-admin credential and write policy

The optional policy file is `config/secrets/connectors.json` beneath the selected Townlight profile. Its top-level keys are local actor UUIDs. Each actor entry has a nonempty exact `namespaces` array; optional `credentials` maps provider IDs to provider-specific credential objects; optional `write_sources` maps configured source IDs to the exact full source object. The six source fields are `provider`, `url`, `namespace`, `body`, `input_format` and `options`; a write plan is accepted only when the configured source and namespace match the policy target exactly. No secret is entered into or returned to the Meetings UI. The policy file is limited to 1 MiB. A missing file disables account credentials and write authorization; malformed content fails closed.

**Find the native actor UUID.** Townlight Settings → Local Users shows names and emails, not UUIDs. Use the bundled runtime's `townlight_runtime.records_import.stable_id` helper with the resolved Townlight profile root and lowercase email in `config/first-admin.json` or `config/staff-users.json`. Resolve the profile root using the runtime's precedence: absolute `TOWNLIGHT_PROFILE_ROOT` when set; otherwise the parent of `TOWNLIGHT_DATA_DIR` when set; otherwise `%LOCALAPPDATA%\CivicSuite` (or `%USERPROFILE%\AppData\Local\CivicSuite` when `LOCALAPPDATA` is unset). Resolve the path before calculating the UUID:

```python
from pathlib import Path
from townlight_runtime.records_import import stable_id

profile_root = Path(r"<resolved Townlight profile root>")
native_email = "<email from Settings → Local Users>".strip().lower()
print(stable_id(profile_root, "native-user", native_email))
```

For Essential and TelVue account credentials, SDK credential objects require the exact authorized `origin` and `namespace`, plus `tenant` equal to the SHA-256 hex digest of the UTF-8 string form of the resolved profile root. Use the provider's documented credential fields and a verified account origin. Do not guess token keys or production hosts. No authorized provider test tenant or credentials were supplied, so account-read and live-write acceptance remains NOT_RUN. This is an access blocker, not evidence that a provider operation is unsupported.

Candidate completeness remains limited by the verified per-provider matrix: live discovery and paging are not complete for every tenant; captures and provider fields may be partial; per-operation statuses remain distinct. Provider actions require an exact server-owned source grant and local administrator role; provider credentials are configured server-side where required. Account-read and live-write acceptance is NOT_RUN because no authorized provider test tenant or credentials were supplied. Do not use public city data for write testing. The dev6 pin and baseline counts do not establish completion of the connector project's full acceptance plan.

This documentation describes prepared source for Townlight 1.8.2, not a signed, installed or released Windows build. Windows 1.8.1.1 remains the current public release and its links and acceptance evidence below are historical evidence for that exact release.

For the released Windows 1.8.1.1 workflow, use **Meetings → Import meeting records**. Select a
source and format, enter the original public URL, then choose **Preview import**.
For a saved response, select the file before previewing. Choose a meeting and
use **Save selected meeting**. Townlight records the source URL, format, stable
source ID and capture hash with the canonical meeting. Reopening the same
capture returns the existing meeting. A changed capture for that identity is
reported for staff review.

The source and format selector lists the supported reader pairs below. A
public URL must serve the chosen format directly. Use a saved public response
for POST-only listings, portals that require a browser session and sources
whose page does not return the required response. The importer reads what a
municipality publishes in that response. Fields and attachments vary by
municipality and by meeting.

| Source | Input to preview |
|---|---|
| Legistar | Core-format JSON export |
| PrimeGov | Core-format JSON export or public portal meeting list JSON |
| Granicus | Core-format JSON export or public ViewPublisher HTML |
| NovusAGENDA | Core-format JSON export |
| CivicPlus Agenda and Meeting Management Select | Public Events JSON |
| CivicPlus Agenda Center | Public listing HTML |
| Municode Meetings | Public meetings HTML |
| BoardBook | Public organization HTML |
| eSCRIBE | Public calendar JSON |
| Simbli | Public meeting listing HTML |
| iCompass CivicWeb | Public meeting-type listing HTML |
| iQM2 | Public meeting list HTML |
| Granicus Swagit | Public video archive HTML |
| SuiteOne Media | Public meeting archive HTML |
| Granicus Peak | Public agenda center ViewPublisher HTML |
| Utah Public Notice Website | Public notice detail HTML |
| Destiny AgendaQuick | Public meeting list HTML |
| Town Hall Streams | Public archive HTML |
| TelVue | Public playlist HTML |
| CHAMP | Public event JSON |
| Hyland OnBase | Public Agenda Online HTML |
| Laserfiche WebLink | Saved public dated document folder HTML |
| TownCloud | Saved public agenda table JSON or public agenda detail HTML |
| Digital Towpath | Public meeting detail HTML |
| ClerkBase | Public meeting document HTML |
| Municipality-published calendar | Public iCalendar feed |
| Wistia | Public media JSON |
| Boardable | Public Site meeting detail HTML |
| gWorks FrontDesk | Public city meetings JSON |
| Diligent BoardDocs | Unencrypted printed agenda PDF with numbered items |
| Tyler Meeting Manager | Saved public calendar JSON. Meeting information and item titles when present. |

## Staff handoffs

- **Core and Meetings.** Core's existing vendor formats share the same preview
  and save path as the public readers. The saved meeting and any structured
  agenda items open in the regular Meetings workflow.
- **Records.** In Meetings, load imported documents by meeting ID, choose a
  PDF and enter the destination Records request ID. The attachment retains
  the citation and file hash. An HTML viewer or a dead document link may need
  staff to obtain the PDF separately.
- **Notice and Access.** Use **Review imported text** to start a Notice draft
  or accessibility review with the source citation. Use each workspace's
  normal review and save actions.
- **Station.** In the configured Station operator page, select the saved
  meeting and stage a direct MP4. Use the private capture workflow to queue
  processing. Player-only references are visible without a staging action.
- **Code.** Use the existing ordinance proposal and adoption workflow with
  the canonical imported meeting and agenda IDs.
- **Boards, Contracts, Procurement, Zoning, Planning, Permitting and
  Inspections.** In the destination workspace use **Imported meeting
  evidence**. Select an existing staff record and the saved meeting, then
  save the citation. The destination's existing role and workflow apply.

## Shared interface

The Windows 1.8.1.1 installed Townlight Python runtime exposes a read-only CLI. CivicCast and
other local clients can consume its normalized JSON and apply their own access
and persistence rules. The source candidate's authenticated connector route and
operation boundary are described above; that source is not installed acceptance.

```powershell
python -m townlight_runtime.meeting_imports champ PUBLIC_EVENT_URL saved-event.json --format champ-event-json
```

Use `--fetch` in place of the saved file to read a supported public response.

## Interfaces and other products

The version-1 normalized JSON contract is shared by the Python function
`townlight_runtime.meeting_imports.preview_export(connector, source_url, content, input_format=...)`
and the CLI above. A saved response can also be read from stdin using `-`.
Inputs are limited to 16 MiB. Preview is read-only; the consuming application
owns persistence, staff authorization and its own data.

In released Windows 1.8.1.1, the installed native HTTP bridge exposes `GET /desktop/v1/meetings/imports/sources`,
`POST /desktop/v1/meetings/imports/preview`, `POST /desktop/v1/meetings/imports/fetch`,
`POST /desktop/v1/meetings/imports/commit`, and meeting/link/document handoff
operations in the [native API schema](https://townlight.github.io/api/suite-openapi.json).
Use the existing `X-Townlight-Session` authentication, mapped staff roles and
configured local PostgreSQL service. This is a native application interface;
there is no independent anonymous importer HTTP service or importer MCP server
in that release. The candidate connector API schema linked above is source-only.

**CivicCast (Windows 1.8.1.1 baseline):** opt in through its Townlight shared importer source setting and
`TOWNLIGHT_IMPORT_PYTHON` (the absolute Python executable), `TOWNLIGHT_IMPORT_CONNECTOR`,
`TOWNLIGHT_IMPORT_FORMAT`, `TOWNLIGHT_IMPORT_URL` and optional `TOWNLIGHT_IMPORT_CAPTURE`.
The adapter saves normalized items through the existing AgendaStore. Structured
agenda availability depends on the source response; a video listing can contain
meeting metadata without agenda items. Existing sources remain the default.

**CivicCast Brief (Windows 1.8.1.1 baseline):** its existing PrimeGov and Granicus discovery routes can opt
into the shared reader using `TOWNLIGHT_IMPORT_PYTHON`. That release did not expose all
31 sources as a new selection menu. Its existing caption/media workflow remained
the consuming path. See the current candidate's Brief client documentation for
the newer QuorumRelay integration.

**TownReporter, Describer Workbench and Textflowkit (Windows 1.8.1.1 baseline):** no shared-import adapter
was added to these products in that release. TownReporter retained its own PrimeGov path.
Describer Workbench and Textflowkit expose their existing transcription APIs/MCP
interfaces, which do not constitute meeting-import integration. The shared engine
shipped inside Townlight Runtime; a standalone library was outside that release.

## Windows acceptance and limits

Windows 1.8.1.1 adds shared meeting imports for 31 source families, with 34 supported source/format pairs. Installed Windows Sandbox checks exercised preview, save and durable readback using public captures and fixtures, plus the documented Townlight handoffs. These checks do not establish automatic discovery on every live portal or a complete retest of every module.

Windows 1.8.1.1 has fresh-install acceptance. An in-place upgrade to 1.8.1.1 was not exercised. The previous Windows 1.8.0.1 release tested upgrade from 1.7.2.1; that result applies to 1.8.0.1. Before an existing-city evaluation, back up city data and settings, close Townlight, keep the existing %LOCALAPPDATA%\CivicSuite profile, and use the same Windows account. Keep the prior installer and a restore path. Station continues to use its separately configured service.

The accepted MSI contains Townlight Runtime 0.3.1 and Meetings 1.0.6 distributions. Its health version strings still report Runtime 0.3.0 and Meetings 1.0.5. Default-branch source corrects those display strings; the signed MSI and its exact build source remain unchanged.

[Exact Windows 1.8.1.1 acceptance and limits](https://github.com/townlight/townlight/releases/download/townlight-windows-v1.8.1.1/ACCEPTANCE-Windows-1.8.1.1.md).
