const names = {
  boards: "Boards & Commissions",
  contracts: "Contracts",
  procurement: "Procurement",
};

const fields = {
  board_name: "Board name", liaison: "Staff liaison", seat_name: "Seat name",
  member_name: "Member name (leave blank for vacancy)", term_start: "Term start",
  term_end: "Term end", title: "Title", vendor_name: "Vendor", owner: "Staff owner",
  start_date: "Start date", expiration_date: "Expiration date", renewal_due: "Renewal deadline",
  procurement_type: "Procurement type", city_need: "City need", summary: "Proposal summary",
  staff_score: "Staff score (0–100)", staff_exceptions: "Staff exceptions",
  decision_reference: "Decision reference", decision_note: "Decision note",
};

export function createMunicipalView(invoke, escape, openLinkedRecord) {
  const html = (value) => escape(String(value ?? ""));
  const option = (id, label) => `<option value="${html(id)}">${html(label)}</option>`;
  const input = (name, type = "text", required = true, value = "") =>
    `<label>${fields[name]} <input name="${name}" type="${type}" value="${html(value)}"
      ${required ? "required" : ""} ${type === "number" ? 'min="0" max="100" step="1"' : ""}></label>`;
  const notes = (name, required = true) =>
    `<label>${fields[name]} <textarea name="${name}" maxlength="8000" ${required ? "required" : ""}></textarea></label>`;
  const select = (name, label, options) =>
    `<label>${label} <select name="${name}" required><option value="">Choose…</option>${options}</select></label>`;
  const link = (area, id, label) =>
    `<button type="button" data-municipal-link="${area}" data-id="${html(id)}">${label}</button>`;
  const form = (operation, label, body, id = "") =>
    `<form class="workflow-editor" data-municipal-form="${operation}" data-id="${html(id)}">
      <h3>${label}</h3>${body}<button type="submit">${label}</button></form>`;
  const section = (title, body) => `<section class="section-band"><h3>${title}</h3>${body}</section>`;

  function boards(data) {
    const boardOptions = data.boards.map(board => option(board.board_id, board.board_name)).join("");
    const memberOptions = data.seats.filter(seat => seat.member_name)
      .map(seat => option(seat.id, `${seat.member_name} — ${seat.seat_name}`)).join("");
    const meetingTitles = new Map(data.meetings.map(meeting => [meeting.id, meeting.title]));
    return form("create-board", "Create board", input("board_name") + input("liaison"))
      + (data.boards.length ? form("save-seat", "Record seat or appointment",
        select("board_id", "Board", boardOptions) + input("seat_name") + input("member_name", "text", false)
        + input("term_start", "date", false) + input("term_end", "date", false)) : "")
      + section("Board rosters", data.boards.map(board =>
        `<article><h4>${html(board.board_name)}</h4><p>Staff liaison: ${html(board.liaison)}</p><ul>${
          data.seats.filter(seat => seat.board_id === board.board_id).map(seat =>
            `<li>${html(seat.seat_name)} · ${html(seat.member_name)} · ${html(seat.status)}
              ${seat.term_end ? ` · Ends ${html(seat.term_end)}` : ""}</li>`).join("")}</ul></article>`).join("")
        || "<p>No boards recorded.</p>")
      + (memberOptions && data.meetings.length ? form("save-attendance", "Record attendance",
        select("seat_id", "Board member", memberOptions)
        + select("meeting_id", "Existing meeting", data.meetings.map(meeting => option(meeting.id, meeting.title)).join(""))
        + '<label>Attendance <select name="present"><option value="true">Present</option><option value="false">Absent</option></select></label>')
        : "<p>Add a board member and an existing Townlight meeting to record attendance.</p>")
      + section("Attendance history", data.attendance.map(entry =>
        `<p>${html(entry.member_name)} · ${entry.present ? "Present" : "Absent"} · ${html(meetingTitles.get(entry.meeting_id))}
          ${link("meetings", entry.meeting_id, "Open linked meeting")}</p>`).join("") || "<p>No attendance recorded.</p>");
  }

  function contractFields(record = {}) {
    return input("title", "text", true, record.title) + input("vendor_name", "text", true, record.vendor_name)
      + input("owner", "text", true, record.owner) + input("start_date", "date")
      + input("expiration_date", "date") + input("renewal_due", "date")
      + '<label>Signed agreement PDF (up to 8 MB) <input name="document" type="file" accept=".pdf,application/pdf" required></label>';
  }

  const contractKeywords = record => html([record.title, record.vendor_name, record.owner, record.status].join(" ").toLowerCase());

  function contracts(data, selected) {
    return form("register-contract", "Register signed agreement", contractFields())
      + section("Contract register", '<label>Search contracts and renewals by title, vendor, owner, or status <input type="search" data-contract-filter></label>'
        + (data.map(record => `<article data-contract-record="${html(record.id)}"
          data-keywords="${contractKeywords(record)}">
          <h4>${html(record.title)}</h4><p>${html(record.vendor_name)} · ${html(record.owner)} · ${record.status === "signed" ? "Signed" : "Draft"}</p>
          ${record.procurement_id ? link("procurement", record.procurement_id, "Open source procurement") : ""}
          ${record.status === "signed" ? `<p>Signed PDF: ${html(record.document_name)}</p>
            <button type="button" data-contract-document="${html(record.id)}">Download signed PDF</button>`
            : `<details ${record.id === selected ? "open" : ""}><summary>Record signed agreement for this draft</summary>
                ${form("sign-contract", "Save signed agreement", contractFields(record), record.id)}</details>`}</article>`).join("")
          || "<p>No contracts recorded.</p>"))
      + section("Renewal queue", data.filter(record => record.status === "signed")
        .map(record => `<p data-keywords="${contractKeywords(record)}">${html(record.renewal_due)} · ${html(record.title)} · ${html(record.owner)}</p>`).join("")
        || "<p>No signed agreements in the queue.</p>");
  }

  function procurement(data, selected, isAdmin) {
    const current = data.drafts.find(draft => draft.draft_id === selected) ?? data.drafts[0];
    const chooser = data.drafts.length ? select("draft_id", "Saved solicitation",
      data.drafts.map(draft => `<option value="${html(draft.draft_id)}" ${draft === current ? "selected" : ""}>${html(draft.procurement_title)}</option>`).join("")) : "";
    const create = form("save-rfp", "Save RFP draft", input("title") + input("procurement_type") + notes("city_need"));
    if (!current) return create + "<p>No saved RFP drafts.</p>";
    const id = current.draft_id;
    const proposals = data.proposals.filter(proposal => proposal.solicitation_id === id);
    const award = data.awards.find(item => item.solicitation_id === id);
    const contract = data.contracts.find(record => record.procurement_id === id);
    const awarded = proposals.find(proposal => proposal.id === award?.proposal_id);
    return create + chooser
      + section("RFP outline", `<ol>${current.sections.map(text => `<li>${html(text)}</li>`).join("")}</ol>`)
      + section("Compare proposals", proposals.map(item => `<article><h4>${html(item.vendor_name)}</h4>
        <p>${html(item.summary)}</p><p>Staff score: ${html(item.staff_score)} / 100</p>
        <p>Staff exceptions: ${html(item.staff_exceptions || "None entered")}</p>
        <ul>${item.advisory_flags.map(flag => `<li>${html(flag)}</li>`).join("")}</ul></article>`).join("")
        || "<p>No proposals entered.</p>")
      + (award ? section("Recorded award decision", `<p>${html(awarded?.vendor_name)} · ${html(award.decision_reference)}</p>
          <p>${html(award.decision_note)}</p>${contract ? link("contracts", contract.id, "Open linked contract")
            : isAdmin ? form("create-draft-contract", "Create draft contract", "", id) : ""}`)
        : form("save-proposal", "Record proposal and staff score", input("vendor_name") + notes("summary")
          + input("staff_score", "number") + notes("staff_exceptions", false), id)
          + (isAdmin && proposals.length ? form("record-award", "Record completed award decision",
            select("proposal_id", "Awarded proposal", proposals.map(item => option(item.id, item.vendor_name)).join(""))
            + input("decision_reference") + notes("decision_note"), id)
            : "<p>A Townlight administrator records the completed award decision.</p>"));
  }

  async function payload(form) {
    const values = Object.fromEntries(new FormData(form));
    if (values.staff_score !== undefined) values.staff_score = Number(values.staff_score);
    if (values.present !== undefined) values.present = values.present === "true";
    for (const key of ["member_name", "term_start", "term_end"]) {
      if (values[key] === "") values[key] = null;
    }
    if (values.document) {
      const file = values.document;
      if (file.size > 8 * 1024 * 1024) throw new Error("Choose a PDF of 8 MB or less.");
      const reader = new FileReader();
      values.document_content = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1]);
        reader.onerror = () => reject(new Error("Could not read the PDF."));
        reader.readAsDataURL(file);
      });
      values.document_name = file.name;
      delete values.document;
    }
    return values;
  }

  const send = (operation, args = {}) => invoke("municipal_staff_request", { request: { operation, ...args } });
  const explain = error => error?.message || error?.detail || (typeof error === "string" ? error : "The local operation failed.");

  return {
    render: (area) => `<section data-municipal-workspace><h2>${names[area]}</h2>
      <p data-municipal-message role="status" aria-live="polite">Loading local staff work…</p>
      <div data-municipal-content></div></section>`,
    async bind(area, isAdmin, selected) {
      const workspace = document.querySelector("[data-municipal-workspace]");
      if (!workspace) return;
      const message = workspace.querySelector("[data-municipal-message]");
      const content = workspace.querySelector("[data-municipal-content]");
      const renderer = { boards, contracts, procurement }[area];
      const refresh = async (status = "") => {
        const data = await send(area);
        if (!workspace.isConnected) return;
        content.innerHTML = renderer(data, selected, isAdmin);
        message.textContent = status;
      };
      workspace.addEventListener("change", async event => {
        if (event.target.name !== "draft_id") return;
        selected = event.target.value;
        try { await refresh(); } catch (error) { message.textContent = explain(error); }
      });
      workspace.addEventListener("input", event => {
        if (!event.target.matches("[data-contract-filter]")) return;
        const query = event.target.value.trim().toLowerCase();
        for (const record of content.querySelectorAll("[data-keywords]")) {
          record.hidden = !record.dataset.keywords.includes(query);
        }
      });
      workspace.addEventListener("submit", async event => {
        const form = event.target;
        if (!form.dataset.municipalForm) return;
        event.preventDefault();
        const button = form.querySelector("button[type=submit]");
        if (button.disabled) return;
        button.disabled = true;
        try {
          const operation = form.dataset.municipalForm;
          const args = operation === "create-draft-contract" ? {} : { payload: await payload(form) };
          if (form.dataset.id) args.id = form.dataset.id;
          if (!workspace.isConnected) return;
          const result = await send(operation, args);
          if (operation === "save-rfp") selected = result.id;
          await refresh("Saved.");
        } catch (error) {
          message.textContent = explain(error);
        } finally {
          button.disabled = false;
        }
      });
      workspace.addEventListener("click", async event => {
        const { municipalLink, id, contractDocument } = event.target.dataset;
        if (municipalLink) return openLinkedRecord(municipalLink, id);
        if (!contractDocument) return;
        try {
          const result = await send("contract-document", { id: contractDocument });
          if (!workspace.isConnected) return;
          const bytes = Uint8Array.from(atob(result.content), char => char.charCodeAt(0));
          const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
            byte => byte.toString(16).padStart(2, "0")).join("");
          if (digest !== result.sha256) throw new Error("The PDF did not pass verification.");
          if (!workspace.isConnected) return;
          const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
          const link = document.createElement("a");
          link.href = url;
          link.download = result.name;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 10000);
        } catch (error) {
          message.textContent = explain(error);
        }
      });
      try { await refresh(); } catch (error) { message.textContent = explain(error); }
    },
  };
}
