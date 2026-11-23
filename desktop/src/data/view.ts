export function createDataView(
  invoke: (channel: string, args: { request: any }) => Promise<any>,
  escapeHtml: (value: string) => string,
) {
  const viewId = `tl-dv-${Math.random().toString(36).slice(2)}`;
  let root: HTMLElement | null = null;
  let admin = false;
  let state: DataState | null = null;
  let preview: Preview | null = null;
  const selected = new Set<string>();
  let status = "";
  let busy = false;
  let disposed = false;
  const bound = new WeakSet<HTMLElement>();
  const esc = (v: unknown) => escapeHtml(String(v ?? ""));

  interface Choice {
    id: string;
    title: string;
    vendor_name: string;
  }
  interface Revision {
    id: string;
    sha256: string;
    approved_at: string;
  }
  interface Publication {
    state: string;
    action: string;
    last_error?: string | null;
  }
  interface DataState {
    configured?: boolean;
    choices?: Choice[];
    revisions?: Revision[];
    publications?: Publication[];
  }
  interface PreviewField {
    name: string;
  }
  interface Preview {
    id: string;
    sha256: string;
    fields?: PreviewField[];
    rows?: Array<Record<string, unknown>>;
  }

  function renderBody(): string {
    const d: DataState = state ?? {};
    const choices = Array.isArray(d.choices) ? d.choices : [];
    const revisions = Array.isArray(d.revisions) ? d.revisions : [];
    const pubs = Array.isArray(d.publications) ? d.publications : [];
    const fields = preview && Array.isArray(preview.fields) ? preview.fields : [];
    const rows = preview && Array.isArray(preview.rows) ? preview.rows : [];

    let h = `<h2>Data publication</h2>`;
    h += `<div role="status" aria-live="polite" data-role="status">${esc(status)}</div>`;
    h += `<button type="button" data-action="refresh">Refresh status</button>`;
    h += `<p>Configured: ${d.configured ? "yes" : "no"}</p>`;
    h += `<fieldset><legend>Agreements</legend>`;
    for (const c of choices) {
      const checked = selected.has(c.id) ? " checked" : "";
      h += `<label><input type="checkbox" data-choice="${esc(c.id)}"${checked}${busy ? " disabled" : ""}> ${esc(c.title)} — ${esc(c.vendor_name)}</label><br>`;
    }
    h += `<button type="button" data-action="preview">Preview</button></fieldset>`;
    h += `<fieldset><legend>Revisions</legend>`;
    for (const r of revisions) h += `<div>${esc(r.id)} ${esc(r.sha256)} ${esc(r.approved_at)} <button data-action="review" data-revision="${esc(r.id)}">Review</button></div>`;
    h += `</fieldset><fieldset><legend>Publications</legend>`;
    for (const p of pubs) h += `<div>${esc(p.state)} ${esc(p.action)} ${esc(p.last_error ?? "")}</div>`;
    h += `</fieldset>`;
    if (preview) {
      h += `<fieldset><legend>Preview ${esc(preview.id)} ${esc(preview.sha256)}</legend>`;
      if (admin && d.configured) {
        h += `<label><input type="checkbox" data-role="confirm-publish"> I confirm publish</label>`;
        h += `<button type="button" data-action="publish">Publish</button>`;
      }
      h += `<table><thead><tr>`;
      for (const f of fields) h += `<th>${esc(f.name)}</th>`;
      h += `</tr></thead><tbody>`;
      for (const row of rows) {
        h += `<tr>`;
        for (const f of fields) h += `<td>${esc(row?.[f.name])}</td>`;
        h += `</tr>`;
      }
      h += `</tbody></table></fieldset>`;
    }
    if (admin && d.configured && pubs.length > 0) {
      h += `<fieldset><legend>Withdraw</legend>`;
      h += `<label><input type="checkbox" data-role="confirm-withdraw"> I confirm withdraw</label>`;
      h += `<button type="button" data-action="withdraw">Withdraw</button>`;
      h += `</fieldset>`;
    }
    return h;
  }

  function render(): string {
    return `<section class="workflow-editor" data-townlight-data-view="${viewId}"></section>`;
  }

  const alive = () => !!root && root.isConnected && !disposed;
  const paint = () => { if (alive()) root!.innerHTML = renderBody(); };

  async function refresh(): Promise<void> {
    const el = root;
    if (!el || !el.isConnected || disposed || busy) return;
    busy = true;
    status = "Loading...";
    paint();
    try {
      const res = await invoke("municipal_staff_request", { request: { operation: "data" } });
      if (disposed || root !== el || !el.isConnected) return;
      state = res as DataState;
      status = "Status loaded";
    } catch (e) {
      if (disposed || root !== el || !el.isConnected) return;
      status = `Error: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      if (!disposed && root === el && el.isConnected) {
        busy = false;
        paint();
      }
    }
  }

  function onChange(ev: Event): void {
    if (busy) return;
    const t = ev.target as HTMLInputElement | null;
    if (!t || t.type !== "checkbox" || t.dataset.choice === undefined) return;
    if (t.checked) selected.add(t.dataset.choice); else selected.delete(t.dataset.choice);
    preview = null;
    status = "Selection changed; preview cleared.";
    paint();
  }

  async function onClick(ev: MouseEvent): Promise<void> {
    const target = (ev.target as HTMLElement | null)?.closest<HTMLElement>("[data-action]");
    if (!target) return;
    const el = root;
    if (!el || !el.isConnected || disposed || busy) return;
    const action = target.dataset.action;

    if (action === "refresh") {
      await refresh();
      return;
    }

    if (action === "review") {
      busy = true; status = "Loading reviewed revision..."; paint();
      try {
        const res = await invoke("municipal_staff_request", { request: { operation: "review-data", id: target.dataset.revision } });
        if (root !== el || !el.isConnected) return;
        preview = res as Preview; status = "Saved revision ready for review.";
      } catch (error) {
        if (el.isConnected) status = String(error);
      } finally {
        busy = false;
        if (root === el) paint();
      }
      return;
    }

    if (action === "preview") {
      const ids = [...selected];
      if (ids.length < 1 || ids.length > 500) {
        status = "Select 1-500 agreements.";
        paint();
        return;
      }
      busy = true;
      status = "Previewing...";
      paint();
      try {
        const res = await invoke("municipal_staff_request", { request: { operation: "preview-data", payload: { agreement_ids: ids } } });
        if (disposed || root !== el || !el.isConnected) return;
        preview = res as Preview;
        status = "Preview ready";
      } catch (e) {
        if (disposed || root !== el || !el.isConnected) return;
        status = `Error: ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        if (!disposed && root === el && el.isConnected) {
          busy = false;
          paint();
        }
      }
      return;
    }

    if (action === "publish") {
      const confirm = el.querySelector<HTMLInputElement>('[data-role="confirm-publish"]');
      if (!preview || !confirm?.checked) {
        status = "Check publish confirmation.";
        paint();
        return;
      }
      busy = true;
      status = "Publishing...";
      paint();
      try {
        await invoke("municipal_staff_request", { request: { operation: "publish-data", payload: { id: preview.id, expected_sha256: preview.sha256, confirm: true } } });
        if (disposed || root !== el || !el.isConnected) return;
        status = "Publish queued — awaiting receipt";
      } catch (e) {
        if (disposed || root !== el || !el.isConnected) return;
        status = `Error: ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        if (!disposed && root === el && el.isConnected) {
          busy = false;
          paint();
        }
      }
      return;
    }

    if (action === "withdraw" && admin) {
      const confirm = el.querySelector<HTMLInputElement>('[data-role="confirm-withdraw"]');
      if (!confirm?.checked) {
        status = "Check withdraw confirmation.";
        paint();
        return;
      }
      busy = true;
      status = "Withdrawing...";
      paint();
      try {
        await invoke("municipal_staff_request", { request: { operation: "withdraw-data", payload: { confirm: true } } });
        if (disposed || root !== el || !el.isConnected) return;
        status = "Withdraw queued — awaiting receipt";
      } catch (e) {
        if (disposed || root !== el || !el.isConnected) return;
        status = `Error: ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        if (!disposed && root === el && el.isConnected) {
          busy = false;
          paint();
        }
      }
    }
  }

  return {
    render,
    async bind(isAdmin: boolean): Promise<void> {
      admin = !!isAdmin;
      const el = document.querySelector<HTMLElement>(`[data-townlight-data-view="${viewId}"]`);
      if (!el) return;

      if (root !== el) {
        root = el;
        state = null;
        preview = null;
        selected.clear();
        status = "";
        busy = false;
        disposed = false;
      }

      if (bound.has(el)) return;
      bound.add(el);
      el.addEventListener("click", (e) => { void onClick(e); });
      el.addEventListener("change", onChange);
      await refresh();
    },
  };
}
