import { createMeetingsClient, readImportFile } from "./client.ts";

function bindImport(form, client, output) {
  if (!form) return;
  const previewButton = form.querySelector("[data-import-preview]");
  const commitButton = form.querySelector("[data-import-commit]");
  const meetingSelect = form.elements.namedItem("external_id");
  const sourceSelect = form.elements.namedItem("source");
  const sourceStatus = form.querySelector("[data-import-source-status]");
  let sources = [];
  client.importSources().then(result => {
    sources = result;
    sourceSelect.replaceChildren(...sources.map((source, index) => new Option(source.label, String(index))));
    previewButton.disabled = !sources.length;
    sourceStatus.textContent = sources.length ? "" : "No import formats are available.";
  }).catch(() => {
    sourceStatus.textContent = "Could not load import formats. Reopen Meetings to retry.";
  });
  let preview = null;
  let sourceRevision = 0;
  for (const name of ["source", "source_url", "export_file"]) {
    form.elements.namedItem(name).addEventListener("input", () => {
      sourceRevision++;
      preview = null;
      meetingSelect.replaceChildren();
      commitButton.disabled = true;
    });
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (previewButton.disabled) return;
    const commit = event.submitter === commitButton;
    if (commit && !preview) return;
    previewButton.disabled = true;
    commitButton.disabled = true;
    const fields = Object.fromEntries(new FormData(form));
    const confirmed = preview;
    const expectedRevision = sourceRevision;
    try {
      if (commit) {
        const result = await client.commitImport(
          confirmed.payload, fields.external_id, confirmed.result.source.sha256,
        );
        output.textContent = JSON.stringify(result, null, 2);
      } else {
        preview = null;
        meetingSelect.replaceChildren();
        const source = sources[Number(fields.source)];
        let payload, result;
        if (fields.export_file?.size) {
          payload = await readImportFile(source, fields);
          result = await client.previewImport(payload);
        } else {
          ({payload, preview: result} = await client.fetchImport(source, fields.source_url));
        }
        if (sourceRevision !== expectedRevision) return;
        preview = {payload, result};
        for (const meeting of result.meetings) {
          const label = [meeting.title, meeting.scheduled_start || meeting.meeting_date].filter(Boolean).join(" · ");
          meetingSelect.add(new Option(label || meeting.external_id, meeting.external_id));
        }
        output.textContent = JSON.stringify(result, null, 2);
      }
    } catch (error) {
      const detail = typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error);
      output.textContent = `${commit ? "Could not confirm import" : "Could not preview the source"}.\n${detail}`;
    } finally {
      previewButton.disabled = false;
      commitButton.disabled = !preview?.result.meetings.length;
    }
  });
}

function bindRecordsHandoff(form, client, output) {
  const meeting = form.elements.namedItem("meeting_id");
  const documents = form.elements.namedItem("document_index");
  const load = form.querySelector("[data-load-import-documents]");
  const attach = form.querySelector("[data-attach-import-document]");
  let loadedMeeting = null;
  const clear = () => {
    loadedMeeting = null;
    documents.replaceChildren();
    attach.disabled = true;
  };
  meeting.addEventListener("input", clear);
  load.addEventListener("click", async () => {
    if (!meeting.reportValidity()) return;
    const id = meeting.value.trim();
    clear();
    load.disabled = true;
    try {
      const receipt = await client.getImport(id);
      if (meeting.value.trim() !== id) return;
      loadedMeeting = id;
      for (const [index, document] of (receipt.payload.documents || []).entries()) {
        documents.add(new Option(`${document.title || document.kind} · ${document.url}`, String(index)));
      }
      attach.disabled = !documents.options.length;
      output.textContent = documents.options.length ? "Choose a source document and a Records request." : "This import has no document links.";
    } catch (error) {
      output.textContent = `Could not load imported documents. ${error?.message || error || ""}`;
    } finally {
      load.disabled = false;
    }
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (attach.disabled || !loadedMeeting || !documents.value) return;
    const id = loadedMeeting;
    const request = form.elements.namedItem("request_id").value.trim();
    attach.disabled = true;
    try {
      const result = await client.attachImportDocument(id, request, Number(documents.value));
      output.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      output.textContent = `Records attachment could not be confirmed. ${error?.message || error || ""}`;
    } finally {
      if (loadedMeeting === id) attach.disabled = false;
    }
  });
}

function bindTextHandoffs(form, client, output, openImportDraft) {
  if (!form) return;
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.submitter;
    if (!button || button.disabled) return;
    const id = form.elements.namedItem("meeting_id").value.trim();
    button.disabled = true;
    try {
      const receipt = await client.getImport(id);
      if (!form.isConnected || form.elements.namedItem("meeting_id").value.trim() !== id) return;
      const payload = receipt.payload;
      const text = payload.notice?.text || payload.agenda_items?.map(item => item.title).join("\n");
      if (!text || !payload.meeting_date && !payload.scheduled_start) {
        throw new Error("The source has no dated notice or agenda text.");
      }
      openImportDraft(button.value, {
        title: payload.notice?.title || payload.title,
        text,
        date: payload.meeting_date || payload.scheduled_start.slice(0, 10),
        source: payload.url || receipt.source.url,
        meetingId: id,
      });
    } catch (error) {
      output.textContent = `Could not open the import in the selected workspace. ${error?.message || error || ""}`;
    } finally {
      button.disabled = false;
    }
  });
}

/** Integrated controls only; later workflow steps remain explicitly unavailable. */
export function createMeetingsView(invoke, navigate = () => {}, openImportDraft = () => {}) {
  const client = createMeetingsClient(invoke);
  return {
    render() {
      return `<section class="section-band"><h2>Townlight Meetings — integration candidate</h2>
        <p>Local integration candidate. Saved work uses Python/PostgreSQL. Packet delivery creates local staff files; notice checks are advisory. The local archive exposes only records you explicitly mark public. No external website upload.</p>
        <form data-meetings-import><h3>Import meeting records</h3>
          <label>Source <select name="source" required></select></label>
          <span role="status" data-import-source-status>Loading import formats…</span>
          <label>Original source URL <input name="source_url" type="url" required></label>
          <label>Saved source file (optional for public URLs) <input name="export_file" type="file" accept=".json,.html,.htm,.ics,.pdf"></label>
          <button type="submit" data-import-preview disabled>Preview import</button>
          <label>Meeting to save <select name="external_id"></select></label>
          <button type="submit" data-import-commit disabled>Save selected meeting</button></form>
        <form data-meetings-import-text><h3>Review imported text</h3>
          <label>Imported meeting ID <input name="meeting_id" required></label>
          <button type="submit" value="notice">Prepare Notice draft</button>
          <button type="submit" value="access">Open Accessibility Review</button></form>
        <form data-meetings-import-records><h3>Attach an imported document to Records</h3>
          <p>Copies a PDF from the saved source into the selected Records request for staff review.</p>
          <label>Imported meeting ID <input name="meeting_id" required></label>
          <button type="button" data-load-import-documents>Load imported documents</button>
          <label>Document <select name="document_index" required></select></label>
          <label>Records request ID <input name="request_id" required></label>
          <button type="submit" data-attach-import-document disabled>Attach PDF to Records</button></form>
        <form data-meetings-create="meeting"><h3>Schedule a meeting</h3>
          <label>Title <input name="title" required maxlength="255"></label>
          <label>Start (include time zone) <input name="scheduled_start" required placeholder="2026-10-20T18:00:00-06:00"></label>
          <label>Location <input name="location" required maxlength="255"></label>
          <label>Meeting type <select name="meeting_type"><option>regular</option><option>special</option><option>emergency</option><option>closed_session</option><option>executive</option></select></label>
          <button type="submit">Create meeting</button></form>
        <form data-meetings-action="recordMeetingStage"><h3>Record meeting stage</h3>
          <p>Records your chosen stage; sequence warnings do not block it. This does not publish notices or packets, adopt minutes, or fabricate skipped actions.</p>
          <label>Meeting ID <input name="id" required></label>
          <label>Stage <select name="to_status"><option>SCHEDULED</option><option>NOTICED</option><option>PACKET_POSTED</option><option>IN_PROGRESS</option><option>RECESSED</option><option>ADJOURNED</option><option>TRANSCRIPT_READY</option><option>MINUTES_DRAFTED</option><option>MINUTES_POSTED</option><option>MINUTES_ADOPTED</option><option>MINUTES_SIGNED</option><option>ARCHIVED</option><option>CANCELLED</option></select></label>
          <label>Statutory basis or context <textarea name="statutory_basis"></textarea></label>
          <button type="submit">Record meeting stage</button></form>
        <form data-meetings-create="agenda-item"><h3>Draft an agenda item</h3>
          <p>Record human review decisions and place the item on a meeting agenda. Sequence warnings do not prevent an authorized human from proceeding.</p>
          <label>Title <input name="title" required maxlength="500"></label>
          <label>Department <input name="department_name" required maxlength="255"></label>
          <button type="submit">Create agenda item</button></form>
        <form data-meetings-action="recordAgendaReview"><h3>Record completed agenda review</h3>
          <p>This records human work; it does not perform departmental or legal review. Departures from the suggested sequence are recorded as warnings, not blocked.</p>
          <label>Agenda item ID <input name="id" required></label>
          <label>Completed stage <select name="to_status"><option>DRAFTED</option><option>SUBMITTED</option><option>DEPT_APPROVED</option><option>LEGAL_REVIEWED</option><option>CLERK_ACCEPTED</option><option>ON_AGENDA</option><option>IN_PACKET</option><option>POSTED</option><option>HEARD</option><option>DISPOSED</option><option>ARCHIVED</option></select></label>
          <button type="submit">Record completed stage</button></form>
        <form data-meetings-action="assignAgendaMeeting"><h3>Place or move item on agenda</h3>
          <label>Agenda item ID <input name="id" required></label>
          <label>Meeting ID <input name="meeting_id" required></label>
          <button type="submit">Place on meeting agenda</button></form>
        <form data-meetings-action="capturePacket"><h3>Record packet version</h3>
          <p>Preserves agenda content and managed source copies as a new version. Delivery below creates a local staff bundle, not website publication.</p>
          <label>Meeting ID <input name="id" required></label>
          <label>Ordered agenda item IDs (separated by commas) <textarea name="agenda_item_ids"></textarea></label>
          <label>Source file paths (one per line, optional) <textarea name="source_paths"></textarea></label>
          <button type="submit">Record packet version</button></form>
        <form data-meetings-action="deliverPacket"><h3>Deliver packet files</h3>
          <label>Packet ID from saved version <input name="id" required></label>
          <p>Creates a new staff-only folder with agenda, copied sources, manifest and checksums. Earlier exports remain intact.</p>
          <button type="submit">Create local packet bundle</button></form>
        <form data-meetings-action="openExports"><button type="submit">Open Meetings export folder</button></form>
        <form data-meetings-action="checkNotice"><h3>Check notice timing</h3>
          <p>Advisory calculation using the notice interval you supply; not a legal sufficiency decision. Warnings do not prevent recording your posting proof.</p>
          <label>Meeting ID <input name="id" required></label>
          <label>Notice type <select name="notice_type"><option>regular</option><option>special</option><option>emergency</option><option>closed_session</option><option>executive</option></select></label>
          <label>Posting time (include time zone) <input name="posted_at" required></label>
          <label>Required notice hours <input name="minimum_notice_hours" type="number" min="0" value="24" required></label>
          <label>Statutory basis <textarea name="statutory_basis"></textarea></label>
          <label>Recorded reviewer, if any <input name="approved_by"></label>
          <button type="submit">Save advisory check</button></form>
        <form data-meetings-action="getNoticeTemplate"><h3>Optional notice template</h3>
          <p>Uses Townlight Notice. Suggested wording remains editable; placeholders and warnings do not block your document.</p>
          <label>Notice check ID <input name="id" required></label>
          <button type="submit">Load editable template</button></form>
        <form data-meetings-action="deliverNotice"><h3>Save and deliver notice text</h3>
          <label>Notice check ID <input name="id" required></label>
          <label>Notice text <textarea name="text" required></textarea></label>
          <p>Creates a new local document with checksums. Earlier text remains in history. It does not post to a website or mark proof complete.</p>
          <button type="submit">Create notice document</button></form>
        <form data-meetings-action="recordNoticeProof"><h3>Record notice posting proof</h3>
          <p>Records your actual posting, not an automatic website upload. Earlier proof remains in audit history.</p>
          <label>Notice check ID <input name="id" required></label>
          <label>Posting location or evidence reference <input name="location" required></label>
          <label>Proof note <textarea name="note"></textarea></label>
          <label>Document delivery ID (optional; blank leaves proof unlinked) <input name="document_delivery_id"></label>
          <button type="submit">Record posting proof</button></form>
        <form data-meetings-action="captureMotion"><h3>Capture a motion</h3>
          <label>Meeting ID <input name="id" required></label>
          <label>Motion text <textarea name="text" required></textarea></label>
          <label>Seconded by <input name="seconded_by"></label>
          <button type="submit">Capture motion</button></form>
        <form data-meetings-action="captureVote"><h3>Capture a vote</h3>
          <label>Motion ID <input name="id" required></label>
          <label>Member name <input name="voter_name" required></label>
          <label>Recorded vote <input name="vote" required></label>
          <button type="submit">Capture vote</button></form>
        <form data-meetings-action="correctMotion"><h3>Correct a captured motion</h3>
          <p>The original remains intact; a correction is appended.</p>
          <label>Original motion ID <input name="id" required></label>
          <label>Corrected text <textarea name="text" required></textarea></label>
          <label>Reason <input name="reason" required></label>
          <button type="submit">Append motion correction</button></form>
        <form data-meetings-action="correctVote"><h3>Correct a captured vote</h3>
          <p>The original remains intact; a correction is appended.</p>
          <label>Original vote ID <input name="id" required></label>
          <label>Corrected vote <input name="vote" required></label>
          <label>Reason <input name="reason" required></label>
          <button type="submit">Append vote correction</button></form>
        <form data-meetings-action="captureActionItem"><h3>Capture an action item</h3>
          <label>Meeting ID <input name="id" required></label>
          <label>Description <textarea name="description" required></textarea></label>
          <label>Assigned to <input name="assigned_to"></label>
          <label>Source motion ID (optional) <input name="source_motion_id"></label>
          <button type="submit">Save action item</button></form>
        <form data-meetings-action="captureTranscript"><h3>Capture transcript source</h3>
          <p>Staff-only source. Corrections create a new capture and retain the original. Capture does not authorize public disclosure.</p>
          <label>Meeting ID <input name="id" required></label>
          <label>Source label <input name="source_label" required></label>
          <label>Transcript text <textarea name="transcript_text" required></textarea></label>
          <label>Corrects transcript ID (optional) <input name="correction_of_id"></label>
          <button type="submit">Save transcript source</button></form>
        <form data-meetings-action="createMinutes"><h3>Save a minutes draft</h3>
          <p>Staff-written draft, not AI output or adopted minutes. Sources are optional; citation warnings are recorded without blocking your draft.</p>
          <label>Meeting ID <input name="id" required></label>
          <label>Source ID <input name="source_id"></label>
          <label>Source label <input name="label"></label>
          <label>Source text <textarea name="source_text"></textarea></label>
          <label>Draft passage <textarea name="text" required></textarea></label>
          <button type="submit">Save minutes draft</button></form>
        <form data-meetings-action="recordMinutesDecision"><h3>Record a minutes decision</h3>
          <p>Records your decision and audit history. Posting before adoption retains the draft label. Signing does not automatically adopt or post. Use the local archive action below to deliver selected text.</p>
          <label>Minutes draft ID <input name="id" required></label>
          <label>Decision <select name="action"><option value="post">Record posting</option><option value="adopt">Record adoption</option><option value="sign">Record signature</option></select></label>
          <label>Decision note or signature attestation <textarea name="note"></textarea></label>
          <button type="submit">Record my decision</button></form>
        <form data-meetings-action="archiveMeeting"><h3>Save selected text to local archive</h3>
          <p>Creates a new archive record. Public makes the selected agenda/packet text and minutes readable on this machine without staff sign-in. Raw source files and transcripts are not included. Prior records remain intact.</p>
          <label>Meeting ID <input name="id" required></label>
          <label>Visibility <select name="visibility"><option value="closed_session">Restricted staff record</option><option value="public">Public local archive</option></select></label>
          <label>Packet ID (optional) <input name="packet_id"></label>
          <label>Minutes ID (optional) <input name="minutes_id"></label>
          <label>Plain-language summary <textarea name="plain_language_summary"></textarea></label>
          <button type="submit">Save selected archive record</button></form>
        <form data-meetings-read><h3>Read saved work</h3>
          <label>Record type <select name="kind"><option value="meeting">Meeting</option><option value="agenda-item">Agenda item</option><option value="proceedings">Proceedings and drafts</option><option value="import">Meeting import receipt</option></select></label>
          <label>Saved record ID <input name="id" required></label>
          <button type="submit">Read from database</button></form>
        <h3>Code proposals and recorded decisions</h3>
        <p>Your explicit decision is recorded without requiring a motion, minutes, or a suggested meeting stage. Optional supporting references are human-supplied, not independently verified. Nothing here codifies or publishes law.</p>
        <form data-meetings-action="codeConnections"><button type="submit">List Code proposals</button></form>
        <form data-meetings-action="codeConnection"><label>Connection ID <input name="id" required></label><button type="submit">Read Code connection</button></form>
        <form data-meetings-action="recordCodeDecision">
          <label>Connection ID <input name="id" required></label>
          <label>Stable decision key <input name="decision_id" required></label>
          <label>Outcome <select name="outcome"><option value="adopted">Adopted</option><option value="not_adopted">Not adopted</option><option value="deferred">Deferred</option><option value="withdrawn">Withdrawn</option></select></label>
          <label>Decision date/time (optional; include time zone) <input name="decided_at" placeholder="2026-10-20T18:30:00-06:00"></label>
          <label>Decision text <textarea name="decision_text" required></textarea></label>
          <label>Supporting references (optional; one per line) <textarea name="supporting_references"></textarea></label>
          <label>Supersedes decision ID (optional) <input name="supersedes_decision_id"></label>
          <label>Reconciliation note <textarea name="reconciliation_note"></textarea></label>
          <button type="submit">Record Code decision</button>
        </form>
        <div data-meetings-links></div>
        <pre data-meetings-result role="status" aria-live="polite">No operation requested.</pre>
      </section>`;
    },
    bind(root = document) {
      const output = root.querySelector("[data-meetings-result]");
      if (!output) return;
      bindImport(root.querySelector("[data-meetings-import]"), client, output);
      bindTextHandoffs(root.querySelector("[data-meetings-import-text]"), client, output, openImportDraft);
      const recordsHandoff = root.querySelector("[data-meetings-import-records]");
      if (recordsHandoff) bindRecordsHandoff(recordsHandoff, client, output);
      for (const form of root.querySelectorAll("[data-meetings-create], [data-meetings-read], [data-meetings-action]")) {
        form.addEventListener("submit", async event => {
          event.preventDefault();
          const button = form.querySelector("button");
          if (button.disabled) return;
          button.disabled = true;
          output.textContent = "Waiting for the local service…";
          const data = Object.fromEntries(new FormData(form));
          try {
            const result = form.dataset.meetingsAction === 'recordCodeDecision'
              ? await client.recordCodeDecision(data.id, {
                  id: data.decision_id, outcome: data.outcome, decided_at: data.decided_at || null,
                  decision_text: data.decision_text,
                  supporting_references: (data.supporting_references || '').split('\n').map(s => s.trim()).filter(Boolean),
                  supersedes_decision_id: data.supersedes_decision_id || null,
                  reconciliation_note: data.reconciliation_note || null,
                })
              : form.hasAttribute("data-meetings-action")
              ? await client[form.dataset.meetingsAction](data.id, data)
              : form.hasAttribute("data-meetings-read")
              ? await client.read(data.kind, data.id)
              : form.dataset.meetingsCreate === "meeting"
                ? await client.createMeeting(data) : await client.createAgendaItem(data);
            output.textContent = JSON.stringify(result, null, 2);
            const links = root.querySelector('[data-meetings-links]');
            links?.replaceChildren();
            if (links && result && result.id && result.proposal) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.textContent = 'Open this connection in Code';
              btn.addEventListener('click', () => navigate('code', result.id));
              links.appendChild(btn);
            }
            if (form.dataset.meetingsAction === "getNoticeTemplate") {
              const target=root.querySelector('[data-meetings-action="deliverNotice"]');
              target.elements.namedItem("id").value=data.id;
              target.elements.namedItem("text").value=result.text;
            }
          } catch (error) {
            const detail = typeof error === "string" ? error : error instanceof Error ? error.message : JSON.stringify(error);
            output.textContent = `Operation not confirmed. No fallback was used. Read saved work before retrying a write.\n${detail}`;
          } finally { button.disabled = false; }
        });
      }
    },
  };
}
