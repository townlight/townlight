type Invoke = (command: string, args?: Record<string, unknown>) => Promise<any>;
type Stage = "draft" | "reviewed" | "awarded" | "closed";
type Grant = { id: string; title: string; stage: Stage; assigned_to?: string | null; report_completed_at?: string | null; archived_sha256?: string | null; workpapers?: unknown };
type Assignee = { id: string; full_name: string };

export function createGrantsView(invoke: Invoke) {
  let selectedId: string | null = null;
  const call = (operation: string, id?: string, payload?: unknown) =>
    invoke("municipal_staff_request", { request: { operation, ...(id ? { id } : {}), ...(payload !== undefined ? { payload } : {}) } });
  const err = (e: unknown) => e instanceof Error ? e.message : String(e);
  const hex = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, "0")).join("");

  function render() {
    return `<section class="workflow-editor grants-view" data-grants-view><h2>Municipal Grants</h2><form data-create-grant><fieldset><legend>Create grant</legend><label>Title <input name="title" required></label><label>Funding area <input name="funding_area" required></label><label>Deadline <input name="deadline" type="date" required></label><label>Project name <input name="project_name" required></label><label>City need <textarea name="city_need" required></textarea></label><label>Budget revision <select name="budget_revision_id" required><option value="">Choose adopted budget</option></select></label><label>Contract <select name="contract_id" required><option value="">Choose signed contract</option></select></label><label>Records request <select name="records_request_id" required><option value="">Choose Records request</option></select></label><button>Create grant</button></fieldset></form><p role="status" aria-live="polite" data-status></p><table><caption>Grants</caption><thead><tr><th>Title</th><th>Stage</th><th>Assigned to</th><th>Report completed</th><th>Archived</th><th>Action</th></tr></thead><tbody data-grants-list></tbody></table><section data-grant-detail aria-live="polite"></section></section>`;
  }

  async function bind() {
    const root = document.querySelector<HTMLElement>("[data-grants-view]");
    if (!root) return;
    const status = root.querySelector<HTMLElement>("[data-status]")!;
    const tbody = root.querySelector<HTMLTableSectionElement>("[data-grants-list]")!;
    const detail = root.querySelector<HTMLElement>("[data-grant-detail]")!;
    const createForm = root.querySelector<HTMLFormElement>("[data-create-grant]")!;
    const setStatus = (m: string, tone = "info") => { status.textContent = m; status.dataset.tone = tone; };
    const budgetSel = createForm.elements.namedItem("budget_revision_id") as HTMLSelectElement;
    const contractSel = createForm.elements.namedItem("contract_id") as HTMLSelectElement;
    const recordsSel = createForm.elements.namedItem("records_request_id") as HTMLSelectElement;
    try {
      const budgets = (await call("budget")) as Array<{ id: string; adopted_at?: string | null; fiscal_year?: number | string | null }>;
      for (const b of budgets) if (b.adopted_at) {
        budgetSel.add(new Option(`FY ${b.fiscal_year ?? "FY?"} — ${String(b.id).slice(0, 8)}`, b.id));
      }
    } catch (e) { setStatus(err(e), "error"); }
    try {
      const contracts = (await call("contracts")) as Array<{ id: string; status?: string; title?: string; vendor_name?: string | null }>;
      for (const c of contracts) if (c.status === "signed") {
        contractSel.add(new Option(`${c.title ?? "Contract"}${c.vendor_name ? " — " + c.vendor_name : ""}`, c.id));
      }
    } catch (e) { setStatus(err(e), "error"); }
    try {
      const rv = await invoke("records_domain_request", { request: { operation: "state" } });
      const rlist = ((rv && rv.records_requests) || []) as Array<{ request_id?: string; id?: string; public_tracking_number?: string | null }>;
      for (const r of rlist) if (r.request_id) {
        recordsSel.add(new Option(r.public_tracking_number || r.id || r.request_id, r.request_id));
      }
    } catch (e) { setStatus(err(e), "error"); }
    let assignees: Assignee[] = [];
    try { assignees = (await call("grant-assignees")) as Assignee[]; } catch { assignees = []; }
    const assigneeName = (id?: string | null) => id ? assignees.find(a => a.id === id)?.full_name ?? id : "Unassigned";

    async function loadList() {
      const grants = (await call("grants")) as Grant[];
      tbody.replaceChildren();
      for (const g of grants) {
        const tr = document.createElement("tr");
        const td = (text: string) => { const c = document.createElement("td"); c.textContent = text; tr.append(c); return c; };
        td(g.title); td(g.stage); td(assigneeName(g.assigned_to)); td(g.report_completed_at ?? "Not reported"); td(g.archived_sha256 ? "Verified archive" : "No");
        const action = document.createElement("td");
        const button = document.createElement("button");
        button.type = "button"; button.textContent = "Open"; button.dataset.open = g.id;
        action.append(button); tr.append(action); tbody.append(tr);
      }
    }

    async function mutate(operation: string, id: string | undefined, payload: unknown, message: string) {
      try { await call(operation, id, payload); setStatus(message, "success"); await loadList(); if (selectedId) await loadDetail(); }
      catch (e) { setStatus(err(e), "error"); }
    }

    function addForm(html: string, submit: (fd: FormData) => Promise<void>) {
      const f = document.createElement("form");
      f.innerHTML = `<fieldset>${html}</fieldset>`;
      f.addEventListener("submit", async e => { e.preventDefault(); try { await submit(new FormData(f)); } catch (e) { setStatus(err(e), "error"); } });
      detail.append(f);
      return f;
    }

    async function addAssign(g: Grant) {
      const f = addForm(`<legend>Reassign draft</legend><label>Assigned staff <select name="user_id" required></select></label><button>Save assignment</button>`, async fd => {
        await mutate("assign-grant", g.id, { user_id: String(fd.get("user_id") ?? "") }, "Assignment saved.");
      });
      const select = f.querySelector("select")!;
      for (const a of assignees) { const o = document.createElement("option"); o.value = a.id; o.textContent = a.full_name; select.append(o); }
      select.value = g.assigned_to ?? "";
    }

    function addReview(g: Grant) {
      addForm(`<legend>Review draft</legend><label>Review note <textarea name="note" required></textarea></label><button>Mark reviewed</button>`, async fd => {
        await mutate("review-grant", g.id, { note: String(fd.get("note") ?? "") }, "Draft reviewed.");
      });
    }

    function addAward(g: Grant) {
      addForm(`<legend>Award reviewed grant</legend><label>Award reference <input name="award_reference" required></label><label>Award amount (cents) <input name="award_amount_cents" type="number" min="0" step="1" required></label><label>Report due <input name="report_due" type="date" required></label><label>Reporting frequency <input name="reporting_frequency" required></label><button>Award grant</button>`, async fd => {
        await mutate("award-grant", g.id, { award_reference: String(fd.get("award_reference") ?? ""), award_amount_cents: Number(fd.get("award_amount_cents") ?? 0), report_due: String(fd.get("report_due") ?? ""), reporting_frequency: String(fd.get("reporting_frequency") ?? "") }, "Grant awarded.");
      });
    }

    function addReport(g: Grant) {
      addForm(`<legend>Record report</legend><label>Report note <textarea name="note" required></textarea></label><button>Save report</button>`, async fd => {
        await mutate("report-grant", g.id, { note: String(fd.get("note") ?? "") }, "Report recorded.");
      });
    }

    function addCloseout(g: Grant) {
      addForm(`<legend>Close out grant</legend><button>Close out grant</button>`, async () => {
        await mutate("closeout-grant", g.id, {}, "Grant closed out.");
      });
    }

    function addArchive(g: Grant) {
      addForm(`<legend>Archive closed grant</legend><button>Download verified archive</button>`, async () => {
        const res = (await call("archive-grant", g.id)) as { manifest: string; sha256: string };
        const digest = await hex(res.manifest);
        if (digest.toLowerCase() !== res.sha256.toLowerCase()) { setStatus("Archive hash verification failed.", "error"); return; }
        const blob = new Blob([res.manifest], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `grant-${g.id}-archive.json`;
        document.body.append(a); a.click(); a.remove(); URL.revokeObjectURL(url);
        setStatus("Archive verified and downloaded.", "success");
        await loadList(); await loadDetail();
      });
    }

    async function loadDetail() {
      detail.replaceChildren();
      if (!selectedId) return;
      const g = (await call("get-grant", selectedId)) as Grant;
      const h = document.createElement("h3"); h.textContent = g.title; detail.append(h);
      const dl = document.createElement("dl");
      const field = (label: string, value: string) => { const dt = document.createElement("dt"); dt.textContent = label; const dd = document.createElement("dd"); dd.textContent = value; dl.append(dt, dd); };
      field("Stage", g.stage); field("Assigned to", assigneeName(g.assigned_to)); field("Report completed", g.report_completed_at ?? "Not reported"); field("Archived", g.archived_sha256 ?? "No archive");
      detail.append(dl);
      if (g.workpapers) { const pre = document.createElement("pre"); pre.textContent = JSON.stringify(g.workpapers, null, 2); detail.append(pre); }
      if (g.stage === "draft") { await addAssign(g); addReview(g); }
      if (g.stage === "reviewed") addAward(g);
      if (g.stage === "awarded") { if (g.report_completed_at) addCloseout(g); else addReport(g); }
      if (g.stage === "closed") addArchive(g);
    }

    createForm.addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(createForm);
      const payload = Object.fromEntries(["title", "funding_area", "deadline", "project_name", "city_need", "budget_revision_id", "contract_id", "records_request_id"].map(k => [k, String(fd.get(k) ?? "")]));
      try { await call("create-grant", undefined, payload); createForm.reset(); selectedId = null; setStatus("Grant created.", "success"); await loadList(); detail.replaceChildren(); }
      catch (e) { setStatus(err(e), "error"); }
    });

    tbody.addEventListener("click", e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-open]");
      if (!b) return;
      selectedId = b.dataset.open ?? null;
      void loadDetail();
    });

    try { await loadList(); if (selectedId) await loadDetail(); } catch (e) { setStatus(err(e), "error"); }
  }

  return { render, bind };
}