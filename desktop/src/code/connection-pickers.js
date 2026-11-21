const opt = (v, t, s) => { const o = s.ownerDocument.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); };

export function setOptions(select, rows, label, placeholder, id = (r) => r.id) {
  const prev = select.value;
  while (select.firstChild) select.removeChild(select.firstChild);
  opt("", placeholder, select);
  const seen = new Set();
  for (const r of rows || []) {
    const v = id(r);
    if (typeof v !== "string" || !v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    opt(v, label(r), select);
  }
  if (prev && seen.has(prev)) select.value = prev;
}

export function bindCodeConnectionPickers(root, code, meetings, report) {
  const read = root.querySelector('[data-code-action="connection"]');
  const close = root.querySelector('[data-code-action="closeConnection"]');
  const prop = root.querySelector('[data-code-action="sendProposal"]');
  const search = root.querySelector("[data-code-meeting-search]");
  if (!prop) return null;
  const meetingSelect = prop.elements.namedItem("meeting_id");
  const pick = (f, n) => (f ? f.querySelector(`select[name="${n}"]`) : null);
  const connLabel = (r) => (r.proposal && r.proposal.title) || "";
  const meetingLabel = r => r.scheduled_start
    ? `${r.title} · ${new Date(r.scheduled_start).toLocaleString()}` : r.title;

  let catalog = [], connections = [], workspace = { sections: [] }, sources = [];
  let lastQuery = "";

  const apply = (fs, n, rows, lbl, ph, id) => {
    for (const f of fs) {
      const s = pick(f, n);
      if (s) setOptions(s, rows, lbl, ph, id);
    }
  };
  const versionRows = () => (workspace.sections || []).flatMap((sec) => {
    const cv = sec.current_version;
    if (!cv || !cv.version_id) return [];
    return [{ vid: cv.version_id, lbl: [sec.section_number, sec.section_heading, cv.version_label].filter(Boolean).join(" · ") }];
  });
  const syncDecision = () => {
    const idSel = pick(close, "id"), decSel = pick(close, "decision_id");
    if (!decSel) return;
    const c = connections.find((x) => String(x.id) === String(idSel && idSel.value));
    const decs = (c && c.decisions) || [];
    const latest = !c?.closeout && decs.find(d => d.input?.outcome === "adopted" && d.input.id === c.current_decision_id);
    if (latest) setOptions(decSel, [{ id: latest.input.id, text: latest.input.decision_text || "Adopted decision" }], (r) => r.text, "Select decision");
    else setOptions(decSel, [], () => "", "No adopted decision");
  };

  async function refresh() {
    try {
      const [c, w, n, s] = await Promise.allSettled([
        meetings.catalog(lastQuery, meetingSelect.value || null), code.workspace(), code.connections(), code.sources(),
      ]);
      if (c.status === "fulfilled") catalog = c.value.meetings; else report("Meeting choices are unavailable for this session.", c.reason);
      if (w.status === "fulfilled") workspace = w.value || { sections: [] }; else report && report("Could not load workspace", w.reason);
      if (n.status === "fulfilled") connections = n.value || []; else report && report("Could not load connections", n.reason);
      if (s.status === "fulfilled") sources = (s.value && s.value.sources) || []; else report && report("Could not load sources", s.reason);
      apply([prop], "meeting_id", catalog, meetingLabel, "Select meeting");
      apply([prop], "version_id", versionRows(), (r) => r.lbl, "Select version", (r) => r.vid);
      apply([read, close], "id", connections, connLabel, "Select connection");
      apply([prop], "supersedes_id", connections, connLabel, "Select connection");
      apply([close], "source_id", sources, (r) => r.name || "", "Select source", (r) => r.source_id);
      syncDecision();
    } catch (e) { report && report("Could not refresh pickers", e); }
  }

  function showConnection(id) {
    try {
      const sid = String(id);
      for (const f of [read, close]) {
        const s = pick(f, "id");
        if (s && Array.from(s.options).some((o) => o.value === sid)) s.value = sid;
      }
      syncDecision();
    } catch (e) { report && report("Could not show connection", e); }
  }

  if (close) {
    const idSel = pick(close, "id");
    if (idSel) idSel.addEventListener("change", syncDecision);
  }
  search?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const inp = search.querySelector('input[name="query"]');
    lastQuery = (inp && inp.value) || "";
    try {
      catalog = (await meetings.catalog(lastQuery, meetingSelect.value || null)).meetings;
      apply([prop], "meeting_id", catalog, meetingLabel, "Select meeting");
    } catch (err) { report && report("Could not search meetings", err); }
  });

  return { refresh, showConnection };
}
