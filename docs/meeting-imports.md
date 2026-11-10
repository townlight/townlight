# Shared meeting imports

Use **Meetings → Import meeting records** in the Windows candidate. Select a
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

The installed Townlight Python runtime exposes a read-only CLI. CivicCast and
other local clients can consume its normalized JSON and apply their own access
and persistence rules.

```powershell
python -m townlight_runtime.meeting_imports champ PUBLIC_EVENT_URL saved-event.json --format champ-event-json
```

Use `--fetch` in place of the saved file to read a supported public response.
