import { expect, test } from "@playwright/test";

test('Z3 Records Zoning sources', async ({ page }) => {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body></body></html>',
  }));
  await page.goto('/');
  await page.evaluate(async () => {
    const mod = await import('/src/records/zoning-sources.ts');
    document.body.innerHTML = mod.renderZoningSources('record-1');
    window.__calls = [];
    window.__refreshed = false;
    await mod.bindZoningSources(async (command, args) => {
      window.__calls.push({ command, request: args.request });
      if (args.request.operation === 'search-zoning') {
        return {results: [{source_id: 'source-1', title: '<img src=x>', excerpt: 'Fictional snapshot',
          citation: 'Citation', sha256: 'a'.repeat(64)}], truncated: false};
      }
      return {};
    }, async () => { window.__refreshed = true; });
  });
  await page.locator('input[name="query"]').fill('snapshot');
  await page.getByRole('button', { name: 'Search Zoning' }).click();
  await expect(page.locator('[data-source-results] h4')).toHaveText('<img src=x>');
  await expect(page.locator('[data-source-results] img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Attach to selected Records request' }).click();
  await expect.poll(() => page.evaluate(() => window.__refreshed)).toBe(true);
  const calls = await page.evaluate(() => window.__calls);
  expect(calls).toEqual([
    { command: 'records_domain_request', request: { operation: 'search-zoning', query: 'snapshot' } },
    { command: 'records_domain_request', request: { operation: 'attach-zoning-source',
      request_id: 'record-1', source_id: 'source-1', expected_sha256: 'a'.repeat(64) } },
  ]);
});

test('Z2 Zoning component', async ({ page }) => {
  const result = {id:'z1',answer:'allowed',parcel:{address:'1 Fictional Way',zone:{code:'R2'},
    source:{source_date:'2026-10-20',version:'v1',content_sha256:'a'.repeat(64)}},
    citations:[{section_number:'20.10',version_id:'law-v1',source_id:'official',effective_start:'2026-01-01',body_text:'<img src=x onerror=alert(1)>'}]};
  const mount = async ({publicMode=false,fail=false}={}) => {
    await page.evaluate(async ({publicMode,fail,result}) => {
      const {createZoningView}=await import('/src/zoning/view.js');
      const calls=[];
      window.__calls=calls;
      const invoke=async(command,args)=>{
        calls.push({command,request:args.request});
        if(fail) throw new Error('Service unavailable');
        return result;
      };
      const view=createZoningView(invoke,publicMode);
      document.body.innerHTML=view.render();
      view.bind(document.body);
    },{publicMode,fail,result});
  };
  const callsText=()=>page.evaluate(()=>JSON.stringify(window.__calls));
  await page.route('http://127.0.0.1:5174/', r => r.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }));
  await page.goto('/');
  await mount();
  const question=page.locator('form[data-zone-action="question"]');
  await question.locator('[name="jurisdiction"]').fill('Fictionville');
  await question.locator('[name="query"]').fill('P1');
  await question.locator('[name="question"]').fill('Can I build an ADU?');
  await question.locator('[name="key"]').fill('ADU');
  await question.locator('button[type="submit"]').click();
  await expect(page.locator('body')).toContainText('law-v1');
  await expect(page.locator('body')).toContainText('2026-10-20');
  await expect(page.locator('body')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('img')).toHaveCount(0);
  await expect.poll(async()=>{const t=await callsText();return t.includes('zoning_domain_request')&&t.includes('question');}).toBe(true);
  const snapshotForm = page.locator('form[data-zone-action="snapshot"]');
  await snapshotForm.locator('[name="id"]').fill('11111111-1111-4111-8111-111111111111');
  await snapshotForm.locator('[name="visibility"]').selectOption('public');
  await snapshotForm.locator('button[type="submit"]').click();
  await expect.poll(async()=>{const t=await callsText();return t.includes('"operation":"snapshot"')&&t.includes('"meeting_event_ids":[]');}).toBe(true);
  await mount({publicMode:true});
  await expect(page.locator('form[data-zone-action="review"]')).toHaveCount(0);
  await expect(page.locator('form[data-zone-action="workspace"]')).toHaveCount(0);
  await expect(page.locator('form[data-zone-action="registerRule"]')).toHaveCount(0);
  await expect(page.locator('form[data-zone-action="searchMeetings"]')).toHaveCount(0);
  await expect(page.locator('form[data-zone-action="linkMeeting"]')).toHaveCount(0);
  const publicLookup=page.locator('form[data-zone-action="lookup"]');
  await publicLookup.locator('[name="jurisdiction"]').fill('Fictionville');
  await publicLookup.locator('[name="query"]').fill('P1');
  await publicLookup.locator('button[type="submit"]').click();
  await expect.poll(async()=>(await callsText()).includes('zoning_public_request')).toBe(true);
  await mount({fail:true});
  const failureLookup=page.locator('form[data-zone-action="lookup"]');
  await failureLookup.locator('[name="jurisdiction"]').fill('Fictionville');
  await failureLookup.locator('[name="query"]').fill('P1');
  await failureLookup.locator('button[type="submit"]').click();
  await expect(page.locator('body')).toContainText('Result not confirmed');
  await expect(failureLookup.locator('button[type="submit"]')).toBeEnabled();
});

test('Code C3 source controls', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { renderCodeSources, bindCodeSources } = await import('/src/records/code-sources.ts');
    document.body.innerHTML = renderCodeSources('a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78');
    window.__calls = [];
    bindCodeSources(async (command, args) => {
      window.__calls.push({ command, request: args.request });
      return {results: [{
        source_id: 'synthetic-code', title: 'Code <img src=x>', sha256: 'a'.repeat(64),
        excerpt: 'Four chickens', citation: 'Exact citation', as_of: args.request.as_of,
        version_context: {version_id: 'historic-2025', version_label: '2025',
          effective_start: '2025-01-01', effective_end: '2025-12-31'},
      }], truncated: false};
    }, async () => {window.__refreshed = true;});
  });
  await page.locator('[name=query]').fill('6.12.040');
  await page.locator('[name=as_of]').fill('2025-06-01');
  await page.getByRole('button', {name: 'Search Code', exact: true}).click();
  await expect(page.locator('[data-code-results]')).toContainText('historic-2025');
  await expect(page.locator('img')).toHaveCount(0);
  await page.getByRole('button', {name: 'Attach to selected Records request', exact: true}).click();
  await expect.poll(() => page.evaluate(() => window.__refreshed)).toBe(true);
  const calls = await page.evaluate(() => window.__calls);
  expect(calls[0]).toEqual({command: 'records_domain_request',
    request: {operation: 'search-code', query: '6.12.040', as_of: '2025-06-01'}});
  expect(calls[1].request).toMatchObject({operation: 'attach-code-source', source_id: 'synthetic-code',
    expected_sha256: 'a'.repeat(64), as_of: '2025-06-01',
    request_id: 'a7abf8da-7c0b-47a5-b4ab-4fc1b33aab78'});
});

test("Code C1 component renders exact citations and treats source HTML as text", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const { createCodeView } = await import("/src/code/view.js");
    const calls = [];
    const invoke = async (command, args) => {
      const request = args.request;
      calls.push({ command, request });
      if (request.operation === "lookup") return {
        section: { section_number: "1.01", section_id: "section-one", section_heading: "Synthetic" },
        version: { version_label: "v2", body: "<img src=x onerror=alert(1)> synthetic source", effective_start: "2026-01-01" }
      };
      if (request.operation === "citation") return {
        status: "ok", citation: { citation_text: "Title 1, Chapter 1, Section 1.01, version v2", source_id: "synthetic-source" }
      };
      throw new Error(`Unexpected operation: ${request.operation}`);
    };
    window.__calls = calls;
    const view = createCodeView(invoke);
    document.body.innerHTML = view.render();
    view.bind();
  });
  const output = page.locator("[data-code-output]");
  const lookupForm = page.locator('form[data-code-action="lookup"]');
  await lookupForm.locator('input[name="section"]').fill("1.01");
  await lookupForm.locator('input[name="date"]').fill("2026-02-01");
  await lookupForm.locator('button[type="submit"]').click();
  await expect(output).toContainText("version_label: v2");
  await expect(output).toContainText("effective_start: 2026-01-01");
  await expect(output).toContainText("<img src=x onerror=alert(1)> synthetic source");
  await expect(page.locator("img")).toHaveCount(0);
  const citationForm = page.locator('form[data-code-action="citation"]');
  await citationForm.locator('input[name="section"]').fill("1.01");
  await citationForm.locator('button[type="submit"]').click();
  await expect(output).toContainText("status: ok");
  await expect(output).toContainText("citation_text: Title 1, Chapter 1, Section 1.01, version v2");
  await expect(output).toContainText("source_id: synthetic-source");
  await expect(page.locator("img")).toHaveCount(0);
  const calls = await page.evaluate(() => window.__calls);
  expect(calls.map(c => c.request.operation)).toEqual(["lookup", "citation"]);
  expect(calls.every(c => c.command === "code_domain_request")).toBe(true);
  expect(calls[0].request).toMatchObject({ operation: "lookup", section_number: "1.01", as_of: "2026-02-01" });
  expect(calls[1].request).toMatchObject({ operation: "citation", section_number: "1.01", as_of: null });
});

// The three Townlight Access AI-capable actions (accessibility-review,
// civicaccess-plain-language, civicaccess-language-variant) go through the
// guided-review confirm panel before dispatching -- when the model is ready
// they can hold the global city-work write lock for a full generation call,
// so a human confirm precedes taking that lock (same as the suggest-* AI
// actions in Clerk/Records/Code).
async function runReviewAndSave(page) {
  await page.getByRole("button", { name: "Run Review & Save", exact: true }).click();
  await page.getByRole("button", { name: "Confirm Run Review & Save" }).click();
}

test("city workflow pages expose real local task controls", async ({ page }) => {
  await page.goto("/");

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: /Meetings & Notices/ }).click();
  await expect(page.getByRole("heading", { name: "Meeting Bodies" })).toBeVisible();
  await expect(page.getByLabel("Meeting body name")).toBeVisible();
  await expect(page.getByLabel("Body type")).toBeVisible();
  await expect(page.getByLabel("Body statutory basis")).toBeVisible();
  await expect(page.getByLabel("Meeting cadence")).toBeVisible();
  await expect(page.getByLabel("Default notice days")).toBeVisible();
  await expect(page.getByLabel("Quorum rule")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Meeting Body" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Member Roster" })).toBeVisible();
  await expect(page.getByLabel("Roster body")).toBeVisible();
  await expect(page.getByLabel("Member name")).toBeVisible();
  await expect(page.getByLabel("Member role")).toBeVisible();
  await expect(page.getByLabel("Term start")).toBeVisible();
  await expect(page.getByLabel("Term end")).toBeVisible();
  await expect(page.getByLabel("Member email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Member" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Agenda Intake Queue" })).toBeVisible();
  await expect(page.getByLabel("Intake title")).toBeVisible();
  await expect(page.getByLabel("Submitted by")).toBeVisible();
  await expect(page.getByLabel("Department")).toBeVisible();
  await expect(page.getByLabel("Requested meeting date")).toBeVisible();
  await expect(page.getByLabel("Intake summary")).toBeVisible();
  await expect(page.getByLabel("Source or citation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Agenda Intake" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review Agenda Intake" })).toBeVisible();
  await expect(page.getByLabel("Readiness decision")).toBeVisible();
  await expect(page.getByLabel("Clerk review note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review Agenda Intake" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Promote To Agenda" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Prepare Meeting" })).toBeVisible();
  await expect(page.getByLabel("Meeting body", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Meeting" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Meeting" })).toBeDisabled();
  await expect(page.getByLabel("Notice meeting type")).toBeVisible();
  await expect(page.getByLabel("Statutory notice basis")).toBeVisible();
  await expect(page.getByLabel("Notice lead days")).toBeVisible();
  await expect(page.getByLabel("Notice day type")).toBeVisible();
  await expect(page.getByLabel("Notice deadline")).toBeVisible();
  await expect(page.getByLabel("Notice time zone")).toBeVisible();
  await expect(page.getByLabel("Clerk has reviewed and approved the notice checklist")).toBeVisible();
  await expect(page.getByLabel("Actual posting date")).toBeVisible();
  await expect(page.getByLabel("Notice posting location")).toBeVisible();
  await expect(page.getByLabel("Notice posting method")).toBeVisible();
  await expect(page.getByLabel("Posting confirmation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Code Handoff" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate Notice Deadline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Notice Checklist" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Notice Ready" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Records Bundle" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Staff Reports" })).toBeVisible();
  await expect(page.getByLabel("Recommendation")).toBeVisible();
  await expect(page.getByLabel("Background")).toBeVisible();
  await expect(page.getByLabel("Analysis")).toBeVisible();
  await expect(page.getByLabel("Fiscal impact")).toBeVisible();
  await expect(page.getByLabel("Alternatives considered")).toBeVisible();
  await expect(page.getByLabel("Prior actions")).toBeVisible();
  await expect(page.getByLabel("Staff report prepared by")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Staff Report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Packet Attachments" })).toBeVisible();
  await expect(page.getByLabel("Attachment title")).toBeVisible();
  await expect(page.getByLabel("Attachment source file path")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose File" })).toBeVisible();
  await expect(page.getByLabel("Attachment citation")).toBeVisible();
  await expect(page.getByLabel("Packet section")).toBeVisible();
  await expect(page.getByLabel("Attachment access")).toBeVisible();
  await expect(page.getByLabel("Packet title")).toBeVisible();
  await expect(page.getByLabel("Packet prepared by")).toBeVisible();
  await expect(page.getByLabel("Packet review note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach Packet File" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finalize Packet" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Open Exports Folder" })).toBeVisible();
  await expect(page.getByLabel("Closed-session statutory basis")).toBeVisible();
  await expect(page.getByLabel("Closed-session topics")).toBeVisible();
  await expect(page.getByLabel("Closed-session attendees")).toBeVisible();
  await expect(page.getByLabel("Entered closed session")).toBeVisible();
  await expect(page.getByLabel("Exited closed session")).toBeVisible();
  await expect(page.getByLabel("Reconvene statement")).toBeVisible();
  await expect(page.getByLabel("Staff-only notes reference")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Closed Session" })).toBeVisible();
  await expect(page.getByLabel("Motion text")).toBeVisible();
  await expect(page.getByLabel("Moved by")).toBeVisible();
  await expect(page.getByLabel("Seconded by")).toBeVisible();
  await expect(page.getByLabel("Motion disposition")).toBeVisible();
  await expect(page.getByLabel("Linked vote reference")).toBeVisible();
  await expect(page.getByLabel("Roll-call motion")).toBeVisible();
  await expect(page.getByLabel("Roll-call member")).toBeVisible();
  await expect(page.getByLabel("Roll-call vote")).toBeVisible();
  await expect(page.getByLabel("Attendance member")).toBeVisible();
  await expect(page.getByLabel("Attendance status")).toBeVisible();
  await expect(page.getByLabel("Attendance recorded by")).toBeVisible();
  await expect(page.getByLabel("Attendance note")).toBeVisible();
  await expect(page.getByLabel("Quorum required count")).toBeVisible();
  await expect(page.getByLabel("Quorum review note")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Motion" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Roll Call Vote" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Record Attendance" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Save Quorum Check" })).toBeDisabled();
  await expect(page.getByLabel("Action owner")).toBeVisible();
  await expect(page.getByLabel("Action due date")).toBeVisible();
  await expect(page.getByLabel("Action status")).toBeVisible();
  await expect(page.getByLabel("Action source")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Action Item" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Resident Comment" })).toBeVisible();
  await expect(page.getByLabel("Minutes signed by")).toBeVisible();
  await expect(page.getByLabel("Signature attestation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Minutes" })).toBeVisible();
  await expect(page.getByLabel("Adopted item type")).toBeVisible();
  await expect(page.getByLabel("Adopted title")).toBeVisible();
  await expect(page.getByLabel("Adopted text")).toBeVisible();
  await expect(page.getByLabel("Effective date")).toBeVisible();
  await expect(page.getByLabel("Codification section hint")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Adopted Ordinance/Resolution" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Local AI Minutes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Minute Citations" })).toBeVisible();
  await expect(page.getByLabel("Minutes sentence or excerpt")).toBeVisible();
  await expect(page.getByLabel("Citation source type")).toBeVisible();
  await expect(page.getByLabel("Citation source reference")).toBeVisible();
  await expect(page.getByLabel("Citation note")).toBeVisible();
  await expect(page.getByLabel("Citation access")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Minute Citation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Adopt Minutes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Archive Public Record" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Public Comment Review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Reviewed" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Redact Comment" })).toBeDisabled();
  await expect(page.getByText("No local meetings have been created yet.")).toBeVisible();
  await expect(page.getByText("No agenda intake items are waiting for clerk review.")).toBeVisible();
  await expect(page.getByText("No Townlight Code handoffs are waiting for the clerk.")).toBeVisible();

  await page.getByRole("button", { name: /Records Requests/ }).click();
  await expect(page.getByRole("heading", { name: "Request Intake" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Request" })).toBeVisible();
  await expect(page.getByLabel("Deadline basis")).toBeVisible();
  await expect(page.getByLabel("Received date")).toBeVisible();
  await expect(page.getByLabel("Deadline rule")).toBeVisible();
  await expect(page.getByLabel("Deadline day count")).toBeVisible();
  await expect(page.getByLabel("Deadline day type")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Scope & Search" })).toBeVisible();
  await expect(page.getByLabel("Fee line description")).toBeVisible();
  await expect(page.getByLabel("Fee schedule or policy basis")).toBeVisible();
  await expect(page.getByLabel("Fee line amount")).toBeVisible();
  await expect(page.getByLabel("Fee waiver reason")).toBeVisible();
  await expect(page.getByLabel("Records search query")).toBeVisible();
  await expect(page.getByLabel("Searched locations")).toBeVisible();
  await expect(page.getByLabel("Search result title")).toBeVisible();
  await expect(page.getByLabel("Search result citation")).toBeVisible();
  await expect(page.getByLabel("Search result summary")).toBeVisible();
  await expect(page.getByLabel("Exemption source")).toBeVisible();
  await expect(page.getByLabel("Exemption category")).toBeVisible();
  await expect(page.getByLabel("Staff finding")).toBeVisible();
  await expect(page.getByLabel("Decision", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Decision basis")).toBeVisible();
  await expect(page.getByLabel("Exemption reviewer")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request Messages" })).toBeVisible();
  await expect(page.getByLabel("Message to requester")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Request Message" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request Documents" })).toBeVisible();
  await expect(page.getByLabel("Document title")).toBeVisible();
  await expect(page.getByLabel("Source file path")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose File" })).toHaveCount(2);
  await expect(page.getByLabel("Document citation")).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach Document" })).toBeVisible();
  await expect(page.getByLabel("Release document")).toBeVisible();
  await expect(page.getByLabel("Release copy file path")).toBeVisible();
  await expect(page.getByLabel("Release copy status")).toBeVisible();
  await expect(page.getByLabel("Release copy note")).toBeVisible();
  await expect(page.getByLabel("Release copy reviewed by")).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach Release Copy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Set Deadline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Calculate Deadline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Assign" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Request Clarification" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Search Session" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Exemption Review" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Exemption Decision" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Estimate Fee" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add Fee Line" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Waive Fee" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Response & Release" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Local AI Draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Response" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Build Release Package" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Response" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Fulfilled" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close Request" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Exports Folder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notification Outbox" })).toBeVisible();
  await expect(page.getByText("No local records notifications have been created yet.")).toBeVisible();
  await page.getByRole("button", { name: "Choose File" }).first().click();
  await expect(page.getByText("Native file selection is available in the Windows desktop app")).toBeVisible();

  await page.getByRole("button", { name: /Code & Ordinances/ }).click();
  await expect(page.getByRole("heading", { name: "Import Code Source" })).toBeVisible();
  await expect(page.getByText("Selected code source for actions:")).toBeVisible();
  await expect(page.getByLabel("Source title")).toBeVisible();
  await expect(page.getByLabel("Citation")).toBeVisible();
  await expect(page.getByLabel("Source file path")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose File" })).toBeVisible();
  await expect(page.getByLabel("Imported by")).toBeVisible();
  await expect(page.getByLabel("Source text")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import Source" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Publish Source", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unpublish Source", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Exports Folder" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Codifier Sync" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Sync", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Record Sync Failure" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry Sync" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mark Stale" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guidance & Summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generate Local AI Guidance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save Guidance Draft" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve Guidance" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Clerk Handoff" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask Code Question" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Answer Code Question" })).toBeVisible();

  await page.getByRole("button", { name: /Search City Knowledge/ }).click();
  await expect(page.getByRole("heading", { name: "Local Search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search Local Data" })).toBeVisible();
  await expect(page.getByText("No local search results yet.")).toBeVisible();
  await expect(page.locator("main").getByText("Scaffold")).toHaveCount(0);
});

test("resident public surface hides staff workflow controls", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("tab", { name: "Resident/Public" }).click();

  await page.getByRole("button", { name: /Meetings & Notices/ }).click();
  await expect(page.getByRole("heading", { name: "Public Meeting Materials" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submit Public Comment" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Public Comment" })).toBeDisabled();
  await expect(page.getByText("No posted public meeting is open for comment")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prepare Meeting" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Agenda Intake Queue" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review Agenda Intake" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Submit Agenda Intake" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review Agenda Intake" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Promote To Agenda" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Public Comment Review" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redact Comment" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Meeting Body" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Meeting" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Code Handoff" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calculate Notice Deadline" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Attach Packet File" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Finalize Packet" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record Motion" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record Attendance" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save Quorum Check" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add Minute Citation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Archive Public Record" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Exports Folder" })).toHaveCount(0);

  await page.getByRole("button", { name: /Records Requests/ }).click();
  await expect(page.getByRole("heading", { name: "Public Records Requests" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Submit Public Records Request" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Submit Records Request" })).toBeVisible();
  await expect(page.getByLabel("Request number")).toBeVisible();
  await expect(page.getByLabel("Submitted contact")).toBeVisible();
  await expect(page.getByLabel("Message to records staff")).toBeVisible();
  await expect(page.getByRole("button", { name: "Check Request Status" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Request Message" })).toBeVisible();
  await expect(page.getByText("Pending public intake appears only after the request number and submitted contact match.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Request Intake" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Request" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Calculate Deadline" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve Response" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Attach Release Copy" })).toHaveCount(0);
  await expect(page.getByLabel("Release copy file path")).toHaveCount(0);
  await expect(page.getByLabel("Release copy status")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Export Response" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Mark Fulfilled" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Exports Folder" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Notification Outbox" })).toHaveCount(0);
  await page.getByLabel("Your name").fill("Morgan Lee");
  await page.getByLabel("Email or phone").fill("morgan@example.gov");
  await page.getByLabel("Records requested").fill("Emails and invoices about the river trail grant");
  await page.getByRole("button", { name: "Submit Records Request" }).click();
  await expect(page.getByText("Desktop app required")).toBeVisible();

  await page.getByRole("button", { name: /Code & Ordinances/ }).click();
  await expect(page.getByRole("heading", { name: "Municipal Code Search" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask the Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Answer Code Question" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Import Code Source" })).toHaveCount(0);
  await expect(page.getByLabel("Source file path")).toHaveCount(0);
  await expect(page.getByLabel("Imported by")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import Source" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Publish Source", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unpublish Source", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Record Sync", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Approve Guidance" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create Clerk Handoff" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Exports Folder" })).toHaveCount(0);

  await page.getByRole("button", { name: /Search City Knowledge/ }).click();
  await expect(page.getByRole("heading", { name: "Public Search" })).toBeVisible();
  await expect(page.getByText("No public search results yet.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Search" })).toHaveCount(0);
  await expect(page.getByText("No local search results yet.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Search Local Data" })).toHaveCount(0);
});

test("risky city workflow actions require guided review before mutation", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /Meetings & Notices/ }).click();
  await page.getByRole("button", { name: "Archive Public Record" }).click();
  await expect(page.locator('[data-guided-review="work"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Review Before Archiving Public Record" })).toBeVisible();
  await expect(page.getByText("What will change")).toBeVisible();
  await expect(page.getByText("Who can see it")).toBeVisible();
  await expect(page.getByText("Sources and evidence")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Archive Public Record" })).toBeVisible();
  await expect(page.getByText("Desktop app required")).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel Review" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Archiving Public Record" })).toHaveCount(0);

  await page.getByRole("button", { name: "Generate Local AI Minutes" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Generating Minutes Draft" })).toBeVisible();
  await expect(page.getByText("Uses the verified local AI model to draft internal meeting minutes")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Attach Packet File" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Attaching Packet File" })).toBeVisible();
  await expect(page.getByText("Attachment title is required.")).toBeVisible();
  await expect(page.getByText("Attachment source file path is required.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Attach Packet File" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Add Minute Citation" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Adding Minute Citation" })).toBeVisible();
  await expect(page.getByText("Minutes sentence or excerpt is required.")).toBeVisible();
  await expect(page.getByText("Source reference is required.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Add Minute Citation" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Approve Notice Checklist" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Approving Notice Checklist" })).toBeVisible();
  await expect(page.getByText("Statutory notice basis is required.")).toBeVisible();
  await expect(page.getByText("Clerk approval is required.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Calculate Notice Deadline" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Calculating Notice Deadline" })).toBeVisible();
  await expect(page.getByText("The desktop app will require a meeting before saving.")).toBeVisible();
  await expect(page.getByText("Statutory notice basis is required.")).toBeVisible();
  await expect(page.getByText("Clerk approval is required.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Mark Notice Ready" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Posting Notice" })).toBeVisible();
  await expect(page.getByText("Approved notice checklist is required.")).toBeVisible();
  await expect(page.getByText("Actual posting date is required.")).toBeVisible();
  await expect(page.getByText("Posting confirmation evidence is required.")).toBeVisible();
  await page.getByRole("button", { name: "Confirm Mark Notice Ready" }).click();
  await expect(page.getByText("Desktop app required")).toBeVisible();

  await page.addInitScript(() => {
    const cityCoreModules = [
      {
        id: "civiccore",
        display_name: "Townlight Core",
        role: "core platform",
        required: true,
        selectable: false,
        installed: true,
        enabled: true,
        contract_ready: true
      },
      {
        id: "civicrecords-ai",
        display_name: "Townlight Records",
        role: "records workflow",
        required: false,
        selectable: true,
        installed: true,
        enabled: true,
        contract_ready: true
      },
      {
        id: "civicclerk",
        display_name: "Townlight Meetings",
        role: "clerk workflow",
        required: false,
        selectable: true,
        installed: true,
        enabled: true,
        contract_ready: true
      },
      {
        id: "civiccode",
        display_name: "Townlight Code",
        role: "municipal code",
        required: false,
        selectable: true,
        installed: true,
        enabled: true,
        contract_ready: true
      }
    ];
    const civicnotice = {
      id: "civicnotice",
      display_name: "Townlight Notice",
      role: "public notice workflow",
      version: "0.2.0",
      civiccore_requirement: "1.2.0",
      required: false,
      selectable: true,
      installed: true,
      enabled: true,
      contract_ready: true,
      blocked_reason: null,
      dependencies: ["civiccore", "civicclerk"],
      route_count: 2,
      service_count: 2,
      task_count: 4,
      backup_restore_hooks: ["Data/workflows/notice", "Data/exports/notice", "Data/files/notice"],
      model_required: false,
      lifecycle_install: "profile-selected",
      lifecycle_update: "manifest-versioned",
      lifecycle_disable: "allowed-after-backup",
      lifecycle_uninstall: "backup-first-module-data-removal"
    };
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "get_app_state") {
          return {
            ...window.__appStateForTest,
            modules: [
              ...cityCoreModules,
              civicnotice
            ],
            module_selection: {
              ...(window.__appStateForTest?.module_selection || {}),
              profile_id: "custom",
              profile_label: "Custom",
              installed_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice"],
              enabled_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice"]
            }
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });
  await page.reload();
  await page.getByRole("button", { name: /Public Notices/ }).click();
  await page.getByLabel("Statutory notice basis").fill("Open meetings \"notice\" basis");
  await page.getByLabel("Posting confirmation").fill("</textarea><strong>DIR-NOTICE-XSS</strong>");
  await expect(page.getByLabel("Statutory notice basis")).toHaveValue("Open meetings \"notice\" basis");
  await expect(page.getByLabel("Posting confirmation")).toHaveValue("</textarea><strong>DIR-NOTICE-XSS</strong>");
  await page.getByRole("button", { name: "Calculate Deadline" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Calculating Notice Deadline" })).toBeVisible();
  await expect(page.getByText("Townlight Notice", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Calculate Deadline" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Save Checklist" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Saving Notice Checklist" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Save Checklist" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Record Posting Proof" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Recording Posting Proof" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Record Posting Proof" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Build Archive Packet" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Building Notice Archive Packet" })).toBeVisible();
  await expect(page.getByText("Saved notice checklist is required.")).toBeVisible();
  await expect(page.getByText("Posting proof is required.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Build Archive Packet" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: /Records Requests/ }).click();
  await page.getByRole("button", { name: "Set Deadline" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Setting Records Deadline" })).toBeVisible();
  await expect(page.getByText("Deadline basis is required.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Calculate Deadline" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Calculating Records Deadline" })).toBeVisible();
  await expect(page.getByText("Received date is required.")).toBeVisible();
  await expect(page.getByText("Deadline basis is required.")).toBeVisible();
  await expect(page.getByText("The desktop app will require a request before saving.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Add Request Message" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Adding Request Message" })).toBeVisible();
  await expect(page.getByText("Request message is required.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Add Fee Line" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Adding Records Fee Line" })).toBeVisible();
  await expect(page.getByText("Fee line description is required.")).toBeVisible();
  await expect(page.getByText("Fee schedule or policy basis is required.")).toBeVisible();
  await expect(page.getByText("Fee line amount is required.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Waive Fee" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Waiving Records Fee" })).toBeVisible();
  await expect(page.getByText("Fee waiver reason is required.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Generate Local AI Draft" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Generating Records Draft" })).toBeVisible();
  await expect(page.getByText("Uses the verified local AI model to draft an internal response")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Approve Response" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Approving Records Response" })).toBeVisible();
  await expect(page.getByText("Internal staff status changes to human-approved")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Attach Release Copy" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Attaching Release Copy" })).toBeVisible();
  await expect(page.getByText("Release copy file path or typed reference is required.")).toBeVisible();
  await expect(page.getByText("Release copy status is required.")).toHaveCount(0);
  await expect(page.getByText("The desktop app will require an attached request document before saving.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: /Code & Ordinances/ }).click();
  await page.getByRole("button", { name: "Import Source" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Importing Code Source" })).toBeVisible();
  await expect(page.getByText("Citation is required.")).toBeVisible();
  await expect(page.getByText("Source text is required for search, questions, and publication.")).toBeVisible();
  await expect(page.getByText("Optional source file path or typed reference has not been entered.")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Publish Source", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review Before Publishing Code Source" })).toBeVisible();
  await expect(page.getByText("Creates Townlight Code audit and Townlight Core publication-gate entries.")).toBeVisible();
});

test("browser preview refuses persistent city workflow mutations", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Meetings & Notices/ }).click();
  await page.getByRole("button", { name: "Save Meeting Body" }).click();
  await expect(page.getByRole("heading", { name: "Review Before Saving Meeting Body" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Save Meeting Body" }).click();

  await expect(page.getByText("Desktop app required")).toBeVisible();
  await expect(page.getByText("City workflow changes are saved by the Windows desktop app, not the browser preview.")).toBeVisible();
});

test("desktop workflow actions select freshly added records over restored stale records", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [],
      meeting_members: [],
      agenda_intakes: [],
      meetings: [],
      records_requests: [],
      code_sources: [],
      code_handoffs: [],
      adopted_legislation: [],
      notification_events: [],
      code_answers: []
    });
    const body = {
      id: "body-001",
      name: "City Council",
      statutory_basis: "Municipal charter",
      type: "council"
    };
    const meeting = (id, title) => ({
      id,
      body_id: body.id,
      body_name: body.name,
      title,
      meeting_date: "2026-06-18",
      status: "draft",
      summary: "Budget workflow",
      notice_status: "draft",
      agenda_items: [],
      staff_reports: [],
      attachments: [],
      packet_assemblies: [],
      export_bundles: [],
      closed_sessions: [],
      attendance_records: [],
      quorum_checks: [],
      minute_citations: [],
      motions: [],
      member_votes: [],
      votes: [],
      adopted_legislation: [],
      action_records: [],
      action_items: [],
      resident_comments: [],
      public_comments: [],
      exports: []
    });
    const source = (id, title) => ({
      id,
      title,
      citation: `${title} citation`,
      body: `${title} body`,
      status: "internal draft",
      public_status: "internal draft",
      codifier_sync_status: "not synced",
      public_exports: []
    });
    const oldMeeting = meeting("meeting-999", "Restored meeting DIR091");
    const freshMeeting = meeting("meeting-100", "Fresh meeting DIR094");
    const oldSource = source("source-999", "Noise ordinance DIR091");
    const freshSource = source("source-100", "Fresh source DIR094");
    window.__cityWorkState = emptyWork();
    window.__cityWorkCalls = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "city_work_action") {
          window.__cityWorkCalls.push({ action: args.action, payload: args.payload });
          if (args.action === "create-meeting-body") {
            window.__cityWorkState = { ...window.__cityWorkState, meeting_bodies: [body] };
          } else if (args.action === "create-meeting") {
            const meetings = window.__cityWorkState.meetings.length === 0
              ? [oldMeeting]
              : [oldMeeting, freshMeeting];
            window.__cityWorkState = { ...window.__cityWorkState, meetings };
          } else if (args.action === "import-code-source") {
            const codeSources = window.__cityWorkState.code_sources.length === 0
              ? [oldSource]
              : [oldSource, freshSource];
            window.__cityWorkState = { ...window.__cityWorkState, code_sources: codeSources };
          }
          return {
            accepted: true,
            status: "Saved",
            message: `${args.action} saved`,
            next_action: "Continue the workflow.",
            state: window.__cityWorkState,
            search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("button", { name: /Meetings & Notices/ }).click();
  await page.getByRole("button", { name: "Save Meeting Body" }).click();
  await page.getByRole("button", { name: "Confirm Save Meeting Body" }).click();

  await page.getByRole("button", { name: "Create Meeting" }).click();
  await page.getByRole("button", { name: "Create Meeting" }).click();

  await expect(page.locator(".workflow-record").filter({ hasText: "Fresh meeting DIR094" }).getByText("Selected for actions")).toBeVisible();
  await page.getByRole("button", { name: "Add Minute Citation" }).click();
  await page.getByRole("button", { name: "Confirm Add Minute Citation" }).click();

  await page.getByRole("button", { name: /Code & Ordinances/ }).click();
  await page.getByRole("button", { name: "Import Source" }).click();
  await page.getByRole("button", { name: "Confirm Import Source" }).click();
  await page.getByRole("button", { name: "Import Source" }).click();
  await page.getByRole("button", { name: "Confirm Import Source" }).click();

  await expect(page.locator(".workflow-record").filter({ hasText: "Fresh source DIR094" }).getByText("Selected for actions")).toBeVisible();
  await page.getByRole("button", { name: "Save Guidance Draft" }).click();

  const calls = await page.evaluate(() => window.__cityWorkCalls);
  expect(calls.find((call) => call.action === "add-minute-citation")?.payload.meetingId).toBe("meeting-100");
  expect(calls.find((call) => call.action === "draft-code-guidance")?.payload.codeSourceId).toBe("source-100");
});

test("audit drawer uses local workflow audit language instead of placeholder text", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Audit Trail" }).click();

  await expect(page.getByRole("heading", { name: "Audit Trail" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publication Gates" })).toBeVisible();
  await expect(page.getByText("No human-approved public records have been published yet.")).toBeVisible();
  await expect(page.getByText("No local workflow actions have been recorded yet.")).toBeVisible();
  await expect(page.getByText("Scaffold")).toHaveCount(0);
});

test("module manager presents the installed city-core package", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Settings/ }).click();

  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "City Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "First Admin" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Users" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Local Folders" })).toBeVisible();
  await expect(page.getByLabel("App install folder")).toBeVisible();
  await expect(page.getByLabel("City data folder")).toBeVisible();
  await expect(page.getByLabel("Backup folder")).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Folder" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Save Local Folders" })).toBeVisible();
  await page.getByRole("button", { name: "Choose Folder" }).first().click();
  await expect(page.getByText("Native folder selection is available in the Windows desktop app")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save City Profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save First Admin" })).toBeVisible();
  await expect(page.getByLabel("Townlight passcode", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Staff name")).toBeVisible();
  await expect(page.getByLabel("Staff email")).toBeVisible();
  await expect(page.getByLabel("Role")).toBeVisible();
  await expect(page.getByLabel("Temporary local passcode")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Staff User" })).toBeVisible();
  await page.getByRole("button", { name: "Create Staff User" }).click();
  await expect(page.getByText("Local access is managed by the Windows desktop app")).toBeVisible();
  await expect(page.getByText("sign in or manage local users")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Modules" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose Product Modules" })).toBeVisible();
  await expect(page.getByLabel(/City Core/)).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicrecords-ai"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicclerk"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civiccode"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civicaccess"]')).toBeChecked();
  await expect(page.locator('[data-module-toggle="civiczone"]')).toBeDisabled();
  const civiczoneChoice = page.locator('label.module-choice').filter({ has: page.locator('[data-module-toggle="civiczone"]') });
  await expect(civiczoneChoice.locator('[data-module-toggle="civiczone"]')).not.toBeChecked();
  await expect(civiczoneChoice).toContainText("Ready for Windows Local 1.0");
  await page.getByLabel(/Custom/).check();
  await expect(page.getByText("Custom selection will install Townlight Core plus 5 selected product modules.")).toBeVisible();
  await page.locator('[data-module-toggle="civicrecords-ai"]').uncheck();
  await expect(page.getByText("Custom selection will install Townlight Core plus 4 selected product modules.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply Module Selection" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Installed Product Profile" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Package Profiles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Module Catalog" })).toBeVisible();
  await expect(page.getByText("Selected profile: City Core. Installed modules: 6. Enabled modules: 6.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Core" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Records" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Meetings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Code" })).toBeVisible();
  // Townlight Access's contract line carries the model_required badge (its AI
  // features run on the pinned local model); Townlight Meetings's must NOT -- its
  // registry entry is required:false and this mirror previously drifted.
  const civicaccessRow = page.locator(".module-row").filter({ has: page.getByRole("heading", { name: "Townlight Access" }) });
  await expect(civicaccessRow.getByText("local AI required")).toBeVisible();
  const civicclerkRow = page.locator(".module-row").filter({ has: page.getByRole("heading", { name: "Townlight Meetings" }) });
  await expect(civicclerkRow.getByText("local AI required")).toHaveCount(0);
  await expect(page.getByText("Backup includes: code workflow history, code exports, code files")).toBeVisible();
  await expect(page.getByRole("button", { name: "Disable Townlight Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open Exports Townlight Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check Update Townlight Code" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove From Profile Townlight Code" })).toBeVisible();
  await page.getByRole("button", { name: "Remove From Profile Townlight Code" }).click();
  const removeReview = page.locator(".guided-review").filter({ hasText: "Review Before Removing Townlight Code From Profile" });
  await expect(removeReview.getByText("Creates a verified local profile backup")).toBeVisible();
  await expect(removeReview.getByText("Writes a backup manifest before updating the local module-selection record")).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Disable Townlight Code" }).click();
  await expect(page.locator('[data-guided-review="module"]')).toBeVisible();
  const moduleReview = page.locator(".guided-review").filter({ hasText: "Review Before Disabling Townlight Code" });
  await expect(moduleReview.getByRole("heading", { name: "Review Before Disabling Townlight Code" })).toBeVisible();
  await expect(moduleReview.getByText("Existing module data remains installed.")).toBeVisible();
  await expect(moduleReview.getByText("Audit trail", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm Disable Module" })).toBeVisible();
  await expect(page.getByText("Module actions are handled by the Windows desktop app")).toHaveCount(0);
  await page.getByRole("button", { name: "Confirm Disable Module" }).click();
  await expect(page.getByText("Module actions are handled by the Windows desktop app")).toBeVisible();
  await expect(page.getByText("install, update, enable, disable, remove modules, or open local module exports")).toBeVisible();
  await expect(page.getByText("Installed by selected package profile").first()).toBeVisible();
  await expect(page.getByText("Updated through the versioned module manifest").first()).toBeVisible();
  await expect(page.getByText("Allowed after a backup is created").first()).toBeVisible();
  await expect(page.getByText("Removed only after module data backup").first()).toBeVisible();
  await expect(page.getByText("backup-first-module-data-removal")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Full Suite" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Townlight Notice" })).toBeVisible();
  await expect(page.getByText("Backup includes: notice workflow history, notice exports, notice proof files")).toBeVisible();
  await expect(page.getByRole("button", { name: "Disable Townlight Notice" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "CivicZone" })).toBeVisible();
  await expect(page.getByText("Package waiting")).toBeVisible();
  await expect(page.getByText("Scaffold")).toHaveCount(0);
});

test("civicaccess accessibility tab renders the seven workflow forms and refuses persistence from preview", async ({ page }) => {
  await page.goto("/");
  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: /Accessibility/ }).click();

  // Page heading + the seven civicaccess workflow forms render.
  await expect(page.getByRole("heading", { name: "Accessibility", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accessibility Review (WCAG sample)" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plain-Language Rewrite" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Multilingual Variant", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Accessible Form Plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Publishing Workflow Checklist" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ADA Title II Review-Support Plan" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tagged-PDF Expectation Plan" })).toBeVisible();

  // Form fields accept input + are escaped properly (XSS payload kept as text).
  await page.getByLabel("Document title").fill("Water main \"repair\" notice");
  await page.getByLabel("Public text").fill("Pursuant to municipal code, residents must remit payment prior to the deadline.");
  await expect(page.getByLabel("Document title")).toHaveValue("Water main \"repair\" notice");

  // R3-WALK-03: the 3 fields that are genuinely hard-required server-side (not
  // just "becomes a finding") carry a visible * and aria-required, and the
  // shared help line accurately describes the mixed hard/soft behavior.
  await expect(page.getByLabel("Text to rewrite *")).toHaveAttribute("aria-required", "true");
  await expect(page.getByLabel("Source text *")).toHaveAttribute("aria-required", "true");
  await expect(page.getByLabel("Target language *")).toHaveAttribute("aria-required", "true");
  await expect(page.getByText(/Fields marked \* are required/)).toBeVisible();

  // Empty title + non-English language are findings, not errors — but in browser
  // preview, persistence routes correctly refuse (no Tauri bridge). The review
  // action now goes through the guided-review confirm panel first (it can run a
  // local AI analysis when the engine is ready), so assert the panel renders
  // before confirming through to the preview refusal.
  await page.getByRole("button", { name: "Run Review & Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review Before Running Accessibility Review" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Run Review & Save" }).click();
  await expect(page.getByText("Desktop app required")).toBeVisible();
  await expect(page.getByText("To save local city work, switch to the Townlight desktop app")).toBeVisible();

  // Empty list message until reviews land.
  await expect(page.getByText("No accessibility reviews saved yet")).toBeVisible();

  // The canonical advisory disclaimer is pinned at the top of the workflow editor
  // (UX-5) and repeated in the empty state and per saved review (TW-4) — same
  // wording everywhere, so it legitimately appears more than once on the page.
  await expect(page.getByRole("note").getByText(/advisory clerk support, not a certified accessibility audit/i)).toBeVisible();

  // The browser-preview fallback state carries no ready model, so the tab shows
  // the explicit AI-engine state banner with its guided path to model setup.
  await expect(page.getByText(/AI engine not ready/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Open model setup" })).toBeVisible();

  // TEST-8: every other form-submit button is also wired to a real action and
  // refuses persistence the same way in preview mode (previously only "Run
  // Review & Save" was click-tested; the other six were render-asserted only).
  // The two AI-capable drafting tools confirm through their guided panels.
  const guidedFormButtons = [
    ["Draft Plain-Language Rewrite", "Confirm Draft Rewrite"],
    ["Draft Translation Variant", "Confirm Draft Variant"]
  ];
  for (const [buttonName, confirmName] of guidedFormButtons) {
    await page.getByRole("button", { name: buttonName }).click();
    await page.getByRole("button", { name: confirmName }).click();
    await expect(page.getByText("Desktop app required")).toBeVisible();
  }
  const otherFormButtons = [
    "Plan Accessible Form",
    "Build Publishing Plan",
    "Build ADA Review Plan",
    "Plan Tagged-PDF Expectations"
  ];
  for (const buttonName of otherFormButtons) {
    await page.getByRole("button", { name: buttonName }).click();
    await expect(page.getByText("Desktop app required")).toBeVisible();
  }

  // TEST-8 (cargo-test half, adapted to JS): the data-action-payload JSON.parse
  // fallback is JS-side click-handler logic, not a Rust path, so it's exercised
  // here. Corrupt the static export-folder button's payload to invalid JSON and
  // confirm the click still falls through to the built-in payload instead of
  // throwing — the silent-fallback contract main.js documents at the parse catch.
  await page.evaluate(() => {
    const button = document.querySelector('[data-work-action="open-exports-folder"]');
    button.dataset.actionPayload = '{not valid json';
  });
  await page.getByRole("button", { name: "Open Access Exports Folder" }).click();
  await expect(page.getByText("Desktop app required")).toBeVisible();
});

test("civicaccess delete-review guided-review panel renders, retargets, and deletes the confirmed review", async ({ page }) => {
  // Regression test for GauntletGate round-3 ENG-1/QA3-1/UX3-1: renderAccessibilityWorkflow()
  // was missing the renderGuidedWorkReview() call every other GUIDED_WORK_ACTIONS page has,
  // making civicaccess-delete-review a 100% silent no-op. Also covers TEST-3's cross-contamination
  // scenario (click Delete on review A, then review B without confirming, then Confirm) and
  // Cancel's safety, using the mocked Tauri-bridge pattern already established at line 553.
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [], audit_events: [] }
    });
    window.__cityWorkState = emptyWork();
    window.__cityWorkCalls = [];
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "city_work_action") {
          window.__cityWorkCalls.push({ action: args.action, payload: args.payload });
          if (args.action === "accessibility-review") {
            const review = {
              review_id: `review-${window.__cityWorkState.access.reviews.length + 1}`,
              title: args.payload.title,
              body: args.payload.body,
              has_alt_text: Boolean(args.payload.hasAltText),
              language: args.payload.language || "en",
              status: "passes-sample-checks",
              findings: [],
              disclaimer: "Persisted reviews are advisory clerk support, not a certified accessibility audit.",
              created_at_unix_seconds: 1700000000 + window.__cityWorkState.access.reviews.length
            };
            window.__cityWorkState = {
              ...window.__cityWorkState,
              access: { ...window.__cityWorkState.access, reviews: [...window.__cityWorkState.access.reviews, review] }
            };
          } else if (args.action === "civicaccess-delete-review") {
            const reviews = window.__cityWorkState.access.reviews.filter((r) => r.review_id !== args.payload.reviewId);
            window.__cityWorkState = { ...window.__cityWorkState, access: { ...window.__cityWorkState.access, reviews } };
          }
          return {
            accepted: true,
            status: "Saved",
            message: `${args.action} saved`,
            next_action: "Continue the workflow.",
            state: window.__cityWorkState,
            search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  const primaryNav = page.getByRole("navigation", { name: "Primary" });
  await primaryNav.getByRole("button", { name: /Accessibility/ }).click();

  // Seed two real saved reviews through the actual form + Tauri bridge, not by
  // pre-injecting state (loadAppState() only runs once, before the mock exists).
  const reviewList = page.locator("section.workflow-list");
  await page.getByLabel("Document title *").fill("Review A");
  await page.getByLabel("Public text *").fill("Review A body text.");
  await runReviewAndSave(page);
  await expect(reviewList.getByRole("heading", { name: "Review A" })).toBeVisible();

  await page.getByLabel("Document title *").fill("Review B");
  await page.getByLabel("Public text *").fill("Review B body text.");
  await runReviewAndSave(page);
  await expect(reviewList.getByRole("heading", { name: "Review B" })).toBeVisible();

  // Click Delete on Review A: the guided-review panel must actually render.
  const reviewARow = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review A" }) });
  const reviewBRow = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review B" }) });
  await reviewARow.getByRole("button", { name: "Delete Review" }).click();
  const guidedPanel = page.locator('[data-guided-review="work"]');
  await expect(guidedPanel).toBeVisible();
  await expect(guidedPanel).toContainText("Review A");

  // TEST-4: only Review A's own Delete button is busy-disabled while its
  // confirmation is pending; Review B's Delete and Export buttons, and Review
  // A's own Export button, stay clickable (per-row, per-action busy keying).
  await expect(reviewARow.getByRole("button", { name: "Delete Review" })).toBeDisabled();
  await expect(reviewARow.getByRole("button", { name: "Generate Records-Ready Export" })).toBeEnabled();
  await expect(reviewBRow.getByRole("button", { name: "Delete Review" })).toBeEnabled();

  // Click Delete on Review B without confirming: the panel must retarget, not
  // stack or ignore the second click (TEST-3's cross-contamination scenario).
  await reviewBRow.getByRole("button", { name: "Delete Review" }).click();
  await expect(guidedPanel).toContainText("Review B");
  await expect(guidedPanel).not.toContainText("Review A");
  await expect(reviewARow.getByRole("button", { name: "Delete Review" })).toBeEnabled();
  await expect(reviewBRow.getByRole("button", { name: "Delete Review" })).toBeDisabled();

  // Confirm: only Review B is deleted, and the backend call targets B, not A.
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await expect(reviewList.getByRole("heading", { name: "Review B" })).not.toBeVisible();
  await expect(reviewList.getByRole("heading", { name: "Review A" })).toBeVisible();
  const deleteCalls = await page.evaluate(() => window.__cityWorkCalls.filter((c) => c.action === "civicaccess-delete-review"));
  expect(deleteCalls).toHaveLength(1);
  expect(deleteCalls[0].payload.reviewId).toBe("review-2");

  // Cancel is also safe: clicking Delete then Cancel leaves the review intact.
  await reviewARow.getByRole("button", { name: "Delete Review" }).click();
  await expect(guidedPanel).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await expect(guidedPanel).not.toBeVisible();
  await expect(reviewList.getByRole("heading", { name: "Review A" })).toBeVisible();

  // TEST4-1: Delete -> Cancel -> Delete on the SAME review re-arms cleanly
  // (accessDeleteReviewId, cleared on Cancel, is correctly re-set by the
  // second click rather than staying stale/empty).
  await reviewARow.getByRole("button", { name: "Delete Review" }).click();
  await expect(guidedPanel).toBeVisible();
  await expect(guidedPanel).toContainText("Review A");
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await expect(reviewList.getByRole("heading", { name: "Review A" })).not.toBeVisible();
  const finalDeleteCalls = await page.evaluate(() => window.__cityWorkCalls.filter((c) => c.action === "civicaccess-delete-review"));
  expect(finalDeleteCalls).toHaveLength(2);
  expect(finalDeleteCalls[1].payload.reviewId).toBe("review-1");
});

test("civicaccess delete-review survives an overlapping second delete and a mid-confirm error", async ({ page }) => {
  // Regression test for GauntletGate round-4 ENG-R4-1/QA4-1: handleCityWorkAction's
  // finally block used to unconditionally clear state.workSelection.accessDeleteReviewId
  // whenever any civicaccess-delete-review call settled -- so confirming a delete on
  // review A while review B's confirm panel was already open (retargeted, per-row busy
  // isolation allows this) would wipe B's target out from under it the moment A's
  // slower request resolved, silently failing B's delete. Fixed by only clearing the id
  // if it still matches the id the completing call actually processed.
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [], audit_events: [] }
    });
    window.__cityWorkState = emptyWork();
    window.__cityWorkCalls = [];
    window.__cityWorkFailNext = false;
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "city_work_action") {
          window.__cityWorkCalls.push({ action: args.action, payload: args.payload });
          if (args.action === "accessibility-review") {
            const review = {
              review_id: `review-${window.__cityWorkState.access.reviews.length + 1}`,
              title: args.payload.title,
              body: args.payload.body,
              has_alt_text: Boolean(args.payload.hasAltText),
              language: args.payload.language || "en",
              status: "passes-sample-checks",
              findings: [],
              disclaimer: "Persisted reviews are advisory clerk support, not a certified accessibility audit.",
              created_at_unix_seconds: 1700000000 + window.__cityWorkState.access.reviews.length
            };
            window.__cityWorkState = {
              ...window.__cityWorkState,
              access: { ...window.__cityWorkState.access, reviews: [...window.__cityWorkState.access.reviews, review] }
            };
          } else if (args.action === "civicaccess-delete-review") {
            if (window.__cityWorkFailNext) {
              window.__cityWorkFailNext = false;
              throw new Error("Simulated network error");
            }
            // Review A's delete is deliberately slow, to open a window where
            // review B's confirm panel can be opened (and retarget the shared
            // accessDeleteReviewId) before A's request actually resolves.
            if (args.payload.reviewId === "review-1") {
              await new Promise((resolve) => setTimeout(resolve, 300));
            }
            const reviews = window.__cityWorkState.access.reviews.filter((r) => r.review_id !== args.payload.reviewId);
            window.__cityWorkState = { ...window.__cityWorkState, access: { ...window.__cityWorkState.access, reviews } };
          }
          return {
            accepted: true,
            status: "Saved",
            message: `${args.action} saved`,
            next_action: "Continue the workflow.",
            state: window.__cityWorkState,
            search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  const reviewList = page.locator("section.workflow-list");
  await page.getByLabel("Document title *").fill("Slow Review");
  await page.getByLabel("Public text *").fill("Slow review body text.");
  await runReviewAndSave(page);
  await page.getByLabel("Document title *").fill("Fast Review");
  await page.getByLabel("Public text *").fill("Fast review body text.");
  await runReviewAndSave(page);

  const slowRow = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Slow Review" }) });
  const fastRow = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Fast Review" }) });
  const guidedPanel = page.locator('[data-guided-review="work"]');

  // Confirm the slow review's delete (its backend call takes 300ms) without
  // awaiting the UI to settle, then immediately open the fast review's delete
  // panel while the slow one is still in flight.
  await slowRow.getByRole("button", { name: "Delete Review" }).click();
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await fastRow.getByRole("button", { name: "Delete Review" }).click();
  await expect(guidedPanel).toContainText("Fast Review");

  // Wait past the slow request's resolution: the fast review's panel must
  // still show its own correct target, not "Review no longer found."
  await page.waitForTimeout(500);
  await expect(guidedPanel).toContainText("Fast Review");
  await expect(guidedPanel).not.toContainText("Review no longer found");

  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await expect(reviewList.getByRole("heading", { name: "Fast Review" })).not.toBeVisible();
  await expect(reviewList.getByRole("heading", { name: "Slow Review" })).not.toBeVisible();
  const deleteCalls = await page.evaluate(() => window.__cityWorkCalls.filter((c) => c.action === "civicaccess-delete-review"));
  expect(deleteCalls.map((c) => c.payload.reviewId).sort()).toEqual(["review-1", "review-2"]);

  // A mid-confirm backend error doesn't leave the row's Delete button stuck
  // disabled -- a fresh Delete click on the same (still-existing) review works.
  await page.getByLabel("Document title *").fill("Error Review");
  await page.getByLabel("Public text *").fill("Error review body text.");
  await runReviewAndSave(page);
  const errorRow = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Error Review" }) });
  await page.evaluate(() => { window.__cityWorkFailNext = true; });
  await errorRow.getByRole("button", { name: "Delete Review" }).click();
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await expect(reviewList.getByRole("heading", { name: "Error Review" })).toBeVisible();
  await expect(errorRow.getByRole("button", { name: "Delete Review" })).toBeEnabled();
  await errorRow.getByRole("button", { name: "Delete Review" }).click();
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await expect(reviewList.getByRole("heading", { name: "Error Review" })).not.toBeVisible();
});

test("civicaccess an earlier request resolving does not clear a later request's own busy indicator", async ({ page }) => {
  // Regression test for GauntletGate round-5 ENG-R5-1/UX-R5-1: state.workActionInFlight
  // had the same unguarded-clear shape round 4 fixed for accessDeleteReviewId, but for
  // the per-row busy/disabled indicator instead of the confirm-panel target. Confirm
  // review A (fast backend response) first, then confirm review B (slow response)
  // while A is still in flight -- B's confirm becomes the most-recently-set tag. When
  // A resolves shortly after, its completion must not clear B's still-pending busy
  // indicator. Note: this two-request case is what the one-line mirrored guard fixes;
  // a third simultaneous request would still only track the most-recently-started
  // action (a deeper, accepted architectural limit of a single shared scalar, not
  // attempted here -- see the ponytail comment in handleCityWorkAction).
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [], audit_events: [] }
    });
    window.__cityWorkState = emptyWork();
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "city_work_action") {
          if (args.action === "accessibility-review") {
            const review = {
              review_id: `review-${window.__cityWorkState.access.reviews.length + 1}`,
              title: args.payload.title,
              body: args.payload.body,
              has_alt_text: Boolean(args.payload.hasAltText),
              language: args.payload.language || "en",
              status: "passes-sample-checks",
              findings: [],
              disclaimer: "Persisted reviews are advisory clerk support, not a certified accessibility audit.",
              created_at_unix_seconds: 1700000000 + window.__cityWorkState.access.reviews.length
            };
            window.__cityWorkState = {
              ...window.__cityWorkState,
              access: { ...window.__cityWorkState.access, reviews: [...window.__cityWorkState.access.reviews, review] }
            };
          } else if (args.action === "civicaccess-delete-review") {
            // Review A (review-1) is fast and confirmed first; Review B
            // (review-2) is slow and confirmed second, so A resolves first
            // while B (the most-recently-confirmed) is still genuinely pending.
            const delayMs = args.payload.reviewId === "review-1" ? 300 : 1500;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            const reviews = window.__cityWorkState.access.reviews.filter((r) => r.review_id !== args.payload.reviewId);
            window.__cityWorkState = { ...window.__cityWorkState, access: { ...window.__cityWorkState.access, reviews } };
          }
          return {
            accepted: true,
            status: "Saved",
            message: `${args.action} saved`,
            next_action: "Continue the workflow.",
            state: window.__cityWorkState,
            search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  const reviewList = page.locator("section.workflow-list");
  await page.getByLabel("Document title *").fill("Review A");
  await page.getByLabel("Public text *").fill("Review A body text.");
  await runReviewAndSave(page);
  await page.getByLabel("Document title *").fill("Review B");
  await page.getByLabel("Public text *").fill("Review B body text.");
  await runReviewAndSave(page);

  const rowA = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review A" }) });
  const rowB = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review B" }) });

  // Confirm A (300ms) then, without waiting, confirm B (1500ms) -- B's confirm
  // is now the most-recently-set in-flight tag, while both requests are
  // genuinely in flight simultaneously.
  await rowA.getByRole("button", { name: "Delete Review" }).click();
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  await rowB.getByRole("button", { name: "Delete Review" }).click();
  await page.getByRole("button", { name: "Confirm Delete Review" }).click();

  // Wait past A's resolution (300ms) but well before B's (1500ms): B's own
  // row must still be reported busy -- A resolving first must not clear it.
  await expect(reviewList.getByRole("heading", { name: "Review A" })).not.toBeVisible({ timeout: 2000 });
  await expect(reviewList.getByRole("heading", { name: "Review B" })).toBeVisible();
  await expect(rowB.getByRole("button", { name: "Delete Review" })).toBeDisabled();

  // Once B also resolves, its row disappears entirely (nothing left to check).
  await expect(reviewList.getByRole("heading", { name: "Review B" })).not.toBeVisible({ timeout: 3000 });
});

test("civicaccess three simultaneously in-flight deletes each keep their own busy indicator", async ({ page }) => {
  // Regression test for GauntletGate round-7 W-3: state.workActionInFlight was a
  // single shared scalar, so confirming a THIRD row's delete while two others were
  // already in flight would immediately flip the scalar to the third tag alone --
  // making the first two rows' Delete buttons incorrectly re-enable right away,
  // even though their backend requests were still genuinely pending. The round-4/5
  // guards fixed ordering-dependent clearing on resolution but never fixed this:
  // a single scalar can only ever hold one tag no matter how many actions are
  // really in flight. state.workActionInFlightTags (a Set) fixes this structurally
  // -- each row's tag is independently tracked regardless of how many others exist.
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [], audit_events: [] }
    });
    window.__cityWorkState = emptyWork();
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "city_work_action") {
          if (args.action === "accessibility-review") {
            const review = {
              review_id: `review-${window.__cityWorkState.access.reviews.length + 1}`,
              title: args.payload.title,
              body: args.payload.body,
              has_alt_text: Boolean(args.payload.hasAltText),
              language: args.payload.language || "en",
              status: "passes-sample-checks",
              findings: [],
              disclaimer: "Persisted reviews are advisory clerk support, not a certified accessibility audit.",
              created_at_unix_seconds: 1700000000 + window.__cityWorkState.access.reviews.length
            };
            window.__cityWorkState = {
              ...window.__cityWorkState,
              access: { ...window.__cityWorkState.access, reviews: [...window.__cityWorkState.access.reviews, review] }
            };
          } else if (args.action === "civicaccess-delete-review") {
            // All three reviews share the same delay -- confirming all three in
            // quick succession puts all three genuinely in flight at once.
            await new Promise((resolve) => setTimeout(resolve, 1500));
            const reviews = window.__cityWorkState.access.reviews.filter((r) => r.review_id !== args.payload.reviewId);
            window.__cityWorkState = { ...window.__cityWorkState, access: { ...window.__cityWorkState.access, reviews } };
          }
          return {
            accepted: true,
            status: "Saved",
            message: `${args.action} saved`,
            next_action: "Continue the workflow.",
            state: window.__cityWorkState,
            search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  const reviewList = page.locator("section.workflow-list");
  for (const title of ["Review A", "Review B", "Review C"]) {
    await page.getByLabel("Document title *").fill(title);
    await page.getByLabel("Public text *").fill(`${title} body text.`);
    await runReviewAndSave(page);
  }

  const rowA = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review A" }) });
  const rowB = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review B" }) });
  const rowC = reviewList.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review C" }) });

  // Confirm all three deletes back-to-back, before any of them resolve.
  for (const row of [rowA, rowB, rowC]) {
    await row.getByRole("button", { name: "Delete Review" }).click();
    await page.getByRole("button", { name: "Confirm Delete Review" }).click();
  }

  // With the old single-scalar design, confirming C would already have wiped A's
  // and B's busy indicators at this exact moment (before anything resolves) --
  // assert all three are still correctly disabled while genuinely in flight.
  await expect(rowA.getByRole("button", { name: "Delete Review" })).toBeDisabled();
  await expect(rowB.getByRole("button", { name: "Delete Review" })).toBeDisabled();
  await expect(rowC.getByRole("button", { name: "Delete Review" })).toBeDisabled();

  // Once all three resolve, all three rows disappear.
  await expect(reviewList.getByRole("heading", { name: "Review A" })).not.toBeVisible({ timeout: 3000 });
  await expect(reviewList.getByRole("heading", { name: "Review B" })).not.toBeVisible({ timeout: 3000 });
  await expect(reviewList.getByRole("heading", { name: "Review C" })).not.toBeVisible({ timeout: 3000 });
});

test("civicaccess Delete Review is visually distinct from safe secondary actions", async ({ page }) => {
  // Regression test for GauntletGate round-7 W-2: Delete Review previously shared
  // the same .secondary-action class (and therefore the same look) as every
  // non-destructive button in the app. It now carries its own .destructive-action
  // class, distinct from the sibling Generate Records-Ready Export button.
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [], audit_events: [] }
    });
    window.__cityWorkState = emptyWork();
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd, args = {}) => {
        if (cmd === "city_work_action") {
          if (args.action === "accessibility-review") {
            const review = {
              review_id: `review-${window.__cityWorkState.access.reviews.length + 1}`,
              title: args.payload.title,
              body: args.payload.body,
              has_alt_text: Boolean(args.payload.hasAltText),
              language: args.payload.language || "en",
              status: "passes-sample-checks",
              findings: [],
              disclaimer: "Persisted reviews are advisory clerk support, not a certified accessibility audit.",
              created_at_unix_seconds: 1700000000 + window.__cityWorkState.access.reviews.length
            };
            window.__cityWorkState = {
              ...window.__cityWorkState,
              access: { ...window.__cityWorkState.access, reviews: [...window.__cityWorkState.access.reviews, review] }
            };
          }
          return {
            accepted: true,
            status: "Saved",
            message: `${args.action} saved`,
            next_action: "Continue the workflow.",
            state: window.__cityWorkState,
            search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  await page.getByLabel("Document title *").fill("Review A");
  await page.getByLabel("Public text *").fill("Review A body text.");
  await runReviewAndSave(page);

  const row = page.locator(".workflow-record", { has: page.getByRole("heading", { name: "Review A" }) });
  const deleteButton = row.getByRole("button", { name: "Delete Review" });
  const exportButton = row.getByRole("button", { name: "Generate Records-Ready Export" });

  await expect(deleteButton).toHaveClass(/destructive-action/);
  await expect(deleteButton).not.toHaveClass(/secondary-action/);
  await expect(exportButton).toHaveClass(/secondary-action/);
  await expect(exportButton).not.toHaveClass(/destructive-action/);

  // GauntletGate round-7 W7-1: a className-only check passes even if the CSS rule
  // for that class is empty. Also assert the computed box model so a future
  // regression that leaves .destructive-action out of the shared button styling
  // (border/radius/cursor) fails here instead of shipping unstyled.
  const [deleteBoxModel, exportBoxModel] = await Promise.all([
    deleteButton.evaluate((el) => {
      const s = getComputedStyle(el);
      return { borderStyle: s.borderStyle, borderRadius: s.borderRadius, cursor: s.cursor };
    }),
    exportButton.evaluate((el) => {
      const s = getComputedStyle(el);
      return { borderStyle: s.borderStyle, borderRadius: s.borderRadius, cursor: s.cursor };
    })
  ]);
  expect(deleteBoxModel).toEqual(exportBoxModel);
  expect(deleteBoxModel.borderStyle).toBe("solid");
  expect(deleteBoxModel.borderRadius).not.toBe("0px");
  expect(deleteBoxModel.cursor).toBe("pointer");
});

test("focus returns to main content after a workflow action, across modules", async ({ page }) => {
  // Regression test for GauntletGate round-7 W-1: render() replaces #app's entire
  // subtree on every action, which drops document.activeElement to <body> as a
  // side effect of the DOM swap -- app-wide, not just in civicaccess. Check the
  // fix holds in at least two different modules, not just the one it was found in.
  await page.goto("/");
  await page.evaluate(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async () => ({ accepted: true, status: "Saved", message: "", next_action: "", state: window.__cityWorkState, search_results: [] })
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.getElementById("main-content"))).toBe(true);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Meetings & Notices/ }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.getElementById("main-content"))).toBe(true);

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Records Requests/ }).click();
  await expect.poll(() => page.evaluate(() => document.activeElement === document.getElementById("main-content"))).toBe(true);
});

test("focus returns to main content after a non-nav workflow action (form submit)", async ({ page }) => {
  // Regression test for GauntletGate round-7 W7-3: the nav-click test above only
  // exercises render() calls triggered by clicking a nav button. That call site is
  // not a representative stand-in for the other ~34 render() call sites the fix's
  // own comment claims to cover -- confirm the generic fallback also holds for a
  // render() triggered by something other than a nav click, e.g. a form submission.
  await page.goto("/");
  await page.evaluate(() => {
    const emptyWork = () => ({
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [], audit_events: [] }
    });
    window.__cityWorkState = emptyWork();
    window.__TAURI_INTERNALS__ = {
      invoke: async () => ({ accepted: true, status: "Saved", message: "", next_action: "", state: window.__cityWorkState, search_results: [] })
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  await page.getByLabel("Document title *").fill("Focus check");
  await page.getByLabel("Public text *").fill("Focus check body.");
  await runReviewAndSave(page);

  await expect.poll(() => page.evaluate(() => document.activeElement === document.getElementById("main-content"))).toBe(true);
});

test("focus lands on Retry when the saved-state load itself fails", async ({ page }) => {
  // Regression test for GauntletGate round-7 W7-4: state.appLoadError is its own
  // render() branch that returns before the generic #main-content fallback used to
  // run, so a load-time failure left focus stuck on <body>. render() now shares one
  // fallback tail across both branches; on this branch the natural landing target is
  // the Retry button (there is no #main-content on this screen).
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "get_app_state") {
          throw new Error("corrupt JSON at line 1");
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });
  await page.goto("/");

  const retryButton = page.getByRole("button", { name: "Retry" });
  await expect(retryButton).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const retry = document.querySelector("[data-action='retry-load-state']");
    return document.activeElement === retry;
  })).toBe(true);
});

test("civicaccess shows the explicit AI-engine-not-ready state with a guided path to model setup", async ({ page }) => {
  // The browser-preview fallback state ships model.ready = false, which is the
  // same shape a broken post-install machine reports (weights deleted, dead
  // runtime). The tab must present a guided state -- banner + sample-mode form
  // copy + a working route to the model-setup panel -- never a dead end.
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();

  const banner = page.locator('[aria-label="Local AI engine status"]');
  await expect(banner).toBeVisible();
  await expect(banner.getByText(/AI engine not ready/)).toBeVisible();
  await expect(banner.getByText(/deterministic sample mode/)).toBeVisible();
  // Note: regex matching does not normalize whitespace, so keep the asserted
  // fragment inside one source line of the banner template.
  await expect(banner.getByText(/checklist tools work normally/)).toBeVisible();

  // Sample-mode helper copy on the AI-capable forms.
  await expect(page.getByText(/jargon swap/)).toBeVisible();
  await expect(page.getByText(/canned sample for es \/ vi/)).toBeVisible();

  // Not-ready guided panels are honest: "what will change" describes the
  // deterministic fallback, not an AI draft (gate round-1 UX-1/TW-3).
  await page.getByRole("button", { name: "Draft Plain-Language Rewrite" }).click();
  const notReadyPanel = page.locator('[data-guided-review="work"]');
  await expect(notReadyPanel.getByText(/Runs the deterministic jargon-map sample pass/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
  await page.getByRole("button", { name: "Draft Translation Variant" }).click();
  await expect(notReadyPanel.getByText(/Returns the canned es\/vi sample or an explicit placeholder/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  // The banner's button is a real route to the model readiness panel.
  await banner.getByRole("button", { name: "Open model setup" }).click();
  await expect(page.getByRole("heading", { name: "System Health" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Gemma 4 12B QAT Q4_0" })).toBeVisible();
});

test("civicaccess shows AI-ready framing when the local model reports ready", async ({ page }) => {
  // Mirror of the not-ready test: with model.ready = true from the (mocked)
  // desktop bridge, the banner disappears and the AI-capable forms describe
  // the local engine instead of sample mode.
  await page.addInitScript(() => {
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "get_app_state") {
          return {
            model: {
              profile: "windows-local-1.0",
              local_only: true,
              ready: true,
              status: "Ready",
              display_name: "Gemma 4 12B QAT Q4_0",
              model_id: "gemma-4-12b-it-qat-q4_0",
              provider: "Google",
              runtime: "ollama",
              ollama_model: "hf.co/google/gemma-4-12B-it-qat-q4_0-gguf:Q4_0",
              runtime_model: "civicsuite-gemma4-12b-qat:q4_0",
              download_size_bytes: 6975877728,
              download_policy: "Explicit model setup only",
              source_repo: "google/gemma-4-12B-it-qat-q4_0-gguf",
              artifact: {
                file_name: "gemma-4-12b-it-qat-q4_0.gguf",
                local_path: "(test)",
                expected_size_bytes: 6975877728,
                expected_sha256: "faff1a63667fac17ac5e777f47114688fcefea96e220e211aaa8d62c2c4561f1",
                checksum_required: true,
                checksum_source: "(test)",
                etag_blob_id: "(test)"
              },
              download_state: null,
              checks: []
            },
            // Navigation filters areas by module enablement and the Home
            // screen maps over modules, so the mocked state must carry both
            // (same shape the Townlight Notice test uses) or nothing renders.
            modules: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"].map((id) => ({
              id,
              display_name: id,
              role: "test module",
              required: id === "civiccore",
              selectable: id !== "civiccore",
              installed: true,
              enabled: true,
              contract_ready: true
            })),
            module_selection: {
              profile_id: "city-core",
              profile_label: "City Core",
              installed_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"],
              enabled_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"]
            }
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();

  await expect(page.locator('[aria-label="Local AI engine status"]')).toHaveCount(0);
  await expect(page.getByText(/Drafts a plain-language rewrite on the local AI engine/)).toBeVisible();
  await expect(page.getByText(/Drafts a translation of your text into any target language/)).toBeVisible();
  await expect(page.getByText(/advisory AI remediation analysis/)).toBeVisible();

  // The guided confirm panels carry the AI framing for all three actions:
  // review, rewrite, and variant each state the ready-mode behavior honestly.
  await page.getByRole("button", { name: "Run Review & Save", exact: true }).click();
  const panel = page.locator('[data-guided-review="work"]');
  await expect(panel.getByRole("heading", { name: "Review Before Running Accessibility Review" })).toBeVisible();
  await expect(panel.getByText(/Local AI engine ready/)).toBeVisible();
  await expect(panel.getByText(/never adds, removes, or reclassifies a finding/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Draft Plain-Language Rewrite" }).click();
  await expect(panel.getByText(/Uses the verified local AI model to draft a plain-language rewrite/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();

  await page.getByRole("button", { name: "Draft Translation Variant" }).click();
  await expect(panel.getByText(/Uses the verified local AI model to draft a translation/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel Review" }).click();
});

test("civicaccess stored AI analysis renders labeled, escaped, wrapped, and with line breaks preserved", async ({ page }) => {
  // Permanent re-land of the gate round-1 QA probe: the saved-review AI
  // analysis block is the suite's first surface persisting multi-line model
  // output into a rendered record. It must (a) stay inert under a hostile
  // analysis/model string, (b) preserve the model's paragraph breaks
  // (white-space: pre-line), and (c) contain long unbroken tokens
  // (overflow-wrap: anywhere) instead of stretching the page.
  const xssAnalysis = '"><img src=x onerror=window.__xssFired=1>\n1. Fix alt text first.\n2. ' + "verylongtoken".repeat(20);
  await page.addInitScript(({ analysis }) => {
    const review = {
      review_id: "review-xss-1",
      title: "xss probe",
      body: "body",
      has_alt_text: true,
      language: "en",
      status: "passes-sample-checks",
      findings: [],
      disclaimer: "Advisory only.",
      created_at_unix_seconds: 1700000000,
      ai_analysis: analysis,
      ai_analysis_model: "<em>evil-model</em>"
    };
    const cityWork = {
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: [review], audit_events: [] }
    };
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "get_app_state") {
          return {
            city_work: cityWork,
            modules: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"].map((id) => ({
              id, display_name: id, role: "test module",
              required: id === "civiccore", selectable: id !== "civiccore",
              installed: true, enabled: true, contract_ready: true
            })),
            module_selection: {
              profile_id: "city-core", profile_label: "City Core",
              installed_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"],
              enabled_module_ids: ["civiccore", "civicrecords-ai", "civicclerk", "civiccode", "civicnotice", "civicaccess"]
            }
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  }, { analysis: xssAnalysis });
  await page.goto("/");
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();

  const aiBlock = page.locator(".workflow-record .comment-review-item");
  await expect(aiBlock).toBeVisible();
  // Model label renders as literal text -- no <em> element materializes.
  await expect(aiBlock.getByText(/Local AI analysis \(<em>evil-model<\/em>\) — advisory/)).toBeVisible();
  expect(await aiBlock.locator("em, img, script, button").count()).toBe(0);
  expect(await page.evaluate(() => window.__xssFired)).toBeUndefined();
  // Payload text is visible as inert text.
  await expect(aiBlock.getByText(/"><img src=x onerror=/)).toBeVisible();

  // Layout contract: line breaks preserved, long tokens wrapped, no page blowout.
  const layout = await page.evaluate(() => {
    const block = document.querySelector(".workflow-record .comment-review-item");
    const analysisP = block.querySelectorAll("p")[1];
    const style = getComputedStyle(analysisP);
    return {
      whiteSpace: style.whiteSpace,
      overflowWrap: style.overflowWrap,
      titleOverflowWrap: getComputedStyle(document.querySelector(".workflow-record h3")).overflowWrap,
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
  expect(layout.whiteSpace).toBe("pre-line");
  expect(layout.overflowWrap).toBe("anywhere");
  expect(layout.titleOverflowWrap).toBe("anywhere");
  expect(layout.pageOverflowX).toBe(0);
});

test("civicaccess saved-review list paginates at 20 with a working show-all toggle", async ({ page }) => {
  // Regression test for QA-2-residual/W2R-3 (round 2) and TEST-5 (round 3):
  // only state.access.audit_events had a cap; the reviews list itself is
  // paginated client-side via state.accessReviewsShowAll + a 20-item slice.
  await page.goto("/");
  await page.evaluate(() => {
    const review = (n) => ({
      review_id: `review-${n}`,
      title: `Seeded review ${n}`,
      body: "Seeded body text.",
      has_alt_text: true,
      language: "en",
      status: "passes-sample-checks",
      findings: [],
      disclaimer: "Persisted reviews are advisory clerk support, not a certified accessibility audit.",
      created_at_unix_seconds: 1700000000 + n
    });
    window.__cityWorkState = {
      meeting_bodies: [], meeting_members: [], agenda_intakes: [], meetings: [],
      records_requests: [], code_sources: [], code_handoffs: [], adopted_legislation: [],
      notification_events: [], code_answers: [],
      access: { reviews: Array.from({ length: 21 }, (_, i) => review(i + 1)), audit_events: [] }
    };
    window.__TAURI_INTERNALS__ = {
      invoke: async (cmd) => {
        if (cmd === "city_work_action") {
          return {
            accepted: true, status: "Saved", message: "noop", next_action: "",
            state: window.__cityWorkState, search_results: []
          };
        }
        throw new Error(`Unexpected Tauri command: ${cmd}`);
      }
    };
  });

  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name: /Accessibility/ }).click();
  // Something must trigger a re-render against the seeded state: the only
  // civicaccess action reachable without a saved review is a form submit.
  await page.getByLabel("Document title *").fill("trigger");
  await page.getByLabel("Public text *").fill("trigger");
  await runReviewAndSave(page);

  const reviewList = page.locator("section.workflow-list");
  await expect(reviewList.locator(".workflow-record")).toHaveCount(20);
  const showAll = page.getByRole("button", { name: /Show all \d+ reviews/ });
  await expect(showAll).toBeVisible();

  await showAll.click();
  await expect(reviewList.locator(".workflow-record")).toHaveCount(21);
  const showFewer = page.getByRole("button", { name: "Show fewer reviews" });
  await expect(showFewer).toBeVisible();

  await showFewer.click();
  await expect(reviewList.locator(".workflow-record")).toHaveCount(20);
});
