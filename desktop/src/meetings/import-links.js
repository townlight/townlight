const targets = {
  boards: "Board",
  contracts: "Contract",
  procurement: "Solicitation",
  zoning: "Staff question",
  planning: "Staff analysis",
  permitting: "Permit case",
  inspections: "Inspection case",
};

export function renderImportLinks(area) {
  const target = targets[area];
  if (!target) return "";
  return `<details class="section-band" data-import-links="${area}">
    <summary>Imported meeting evidence</summary>
    <p>Link a saved meeting import to an existing staff record as supporting evidence.</p>
    <form data-import-link-search>
      <label>${target} search <input name="target_query" maxlength="255"></label>
      <label>Imported meeting search <input name="meeting_query" maxlength="255"></label>
      <button type="submit">Find records</button>
    </form>
    <form data-import-link-save>
      <label>${target} <select name="target_id" required disabled></select></label>
      <label>Imported meeting <select name="meeting_id" required disabled></select></label>
      <button type="submit" disabled>Link imported meeting</button>
    </form>
    <p role="status" data-import-link-status></p>
    <ul data-import-link-results></ul>
  </details>`;
}

export function bindImportLinks(invoke, openMeeting) {
  const root = document.querySelector("[data-import-links]");
  if (!root) return;
  const destination = root.dataset.importLinks;
  const search = root.querySelector("[data-import-link-search]");
  const form = root.querySelector("[data-import-link-save]");
  const target = form.elements.namedItem("target_id");
  const meeting = form.elements.namedItem("meeting_id");
  const save = form.querySelector("button");
  const status = root.querySelector("[data-import-link-status]");
  const list = root.querySelector("[data-import-link-results]");
  const request = (operation, fields) => invoke("meetings_domain_request", {
    request: {operation, destination, ...fields},
  });
  let pending = false;

  function paint(rows) {
    list.replaceChildren();
    for (const row of rows) {
      const line = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Open meeting";
      button.onclick = () => openMeeting(row.meeting_id);
      line.textContent = `${row.title} · ${row.connector} · ${row.source_url} `;
      line.append(button);
      list.append(line);
    }
  }

  async function run(action) {
    if (pending) return;
    pending = true;
    const searchButton = search.querySelector("button");
    searchButton.disabled = target.disabled = meeting.disabled = save.disabled = true;
    try {
      await action();
    } catch (error) {
      status.textContent = error?.message || error?.detail || String(error);
    } finally {
      pending = false;
      searchButton.disabled = false;
      target.disabled = !target.options.length;
      meeting.disabled = !meeting.options.length;
      save.disabled = !target.value || !meeting.value;
    }
  }

  async function readLinks() {
    paint(target.value ? await request("import-links", {target_id: target.value}) : []);
  }

  search.onsubmit = event => {
    event.preventDefault();
    void run(async () => {
      const payload = Object.fromEntries(new FormData(search));
      const data = await request("import-link-choices", {payload});
      target.replaceChildren(...data.targets.map(row => new Option(row.title, row.id)));
      meeting.replaceChildren(...data.imports.map(row => new Option(
        [row.title, row.meeting_date].filter(Boolean).join(" · "), row.meeting_id,
      )));
      await readLinks();
      status.textContent = `${data.targets.length} destination records and ${data.imports.length} imported meetings found.`;
    });
  };
  target.onchange = () => void run(readLinks);
  form.onsubmit = event => {
    event.preventDefault();
    if (!target.value || !meeting.value) return;
    void run(async () => {
      paint(await request("link-import", {target_id: target.value, payload: {meeting_id: meeting.value}}));
      status.textContent = "Imported meeting evidence is linked.";
    });
  };
}
