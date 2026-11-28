type Policy = { policy_id: string; version: number; title: string; text: string; citation: string };
type Invoke = (command: string, payload: { request: { operation: string } & Record<string, unknown> }) => Promise<unknown>;
type Options = { isAdmin?: boolean };

export function createUtilitiesView(invoke: Invoke, options: Options = { isAdmin: false }) {
  const boundRoots = new WeakSet<Element>();
  let root: HTMLElement | null = null;
  let policies: Policy[] = [];
  let requestId = '';
  let reqSummary: any = null;
  let wp: any = null;
  let revision: number | null = null;
  let delivered = false;
  let pending = false;
  let busy = false;
  let generation = 0;
  let savedBody = '';
  let savedNotes = '';
  let savedPolicyKey = '';
  let selectedPolicyKey = '';

  const keyOf = (id: any, version: any) => `${String(id ?? '')}::${String(version ?? '')}`;
  const el = <T extends HTMLElement>(role: string): T | null =>
    root ? root.querySelector<T>(role.startsWith('[') ? role : `[data-role="${role}"]`) : null;
  const msgOf = (e: any) => (e instanceof Error ? e.message : String(e ?? 'Unknown error'));

  async function call(operation: string, request_id?: string, payload?: any) {
    const request: any = { operation };
    if (request_id) request.request_id = request_id;
    if (payload !== undefined) request.payload = payload;
    const raw: any = await invoke('utilities_request', { request });
    return raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'result')
      ? raw.result
      : raw;
  }

  function setStatus(text: string, error = false) {
    const n = el<HTMLElement>('status');
    if (!n) return;
    n.textContent = text;
    n.dataset.kind = error ? 'error' : 'info';
  }

  function normalizePolicy(p: any): Policy {
    return {
      policy_id: String(p?.policy_id ?? p?.id ?? ''),
      version: Number(p?.version ?? p?.policy_version ?? 0),
      title: String(p?.title ?? ''),
      text: String(p?.text ?? p?.body ?? ''),
      citation: String(p?.citation ?? '')
    };
  }

  function currentPolicyKey(): string {
    const sel = el<HTMLSelectElement>('policy-select');
    return sel?.value || selectedPolicyKey;
  }

  function getSelectedPolicy(): Policy | undefined {
    const k = currentPolicyKey();
    return policies.find((p) => keyOf(p.policy_id, p.version) === k);
  }

  function policyForWorkpaper(): Policy | undefined {
    if (!wp) return undefined;
    const k = keyOf(wp.policy_id, wp.policy_version);
    return policies.find((p) => keyOf(p.policy_id, p.version) === k);
  }

  function renderPolicies() {
    const sel = el<HTMLSelectElement>('policy-select');
    if (!sel) return;
    sel.replaceChildren();
    if (!policies.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = 'No approved policies';
      o.disabled = true;
      sel.appendChild(o);
      selectedPolicyKey = '';
      updatePolicyPreview();
      return;
    }
    for (const p of policies) {
      const o = document.createElement('option');
      o.value = keyOf(p.policy_id, p.version);
      o.textContent = `${p.title} (v${p.version})`;
      sel.appendChild(o);
    }
    if (selectedPolicyKey && policies.some((p) => keyOf(p.policy_id, p.version) === selectedPolicyKey)) {
      sel.value = selectedPolicyKey;
    } else {
      sel.value = keyOf(policies[0].policy_id, policies[0].version);
      selectedPolicyKey = sel.value;
    }
    updatePolicyPreview();
  }

  function updatePolicyPreview() {
    const p = getSelectedPolicy();
    const title = el<HTMLElement>('policy-title');
    const meta = el<HTMLElement>('policy-meta');
    const text = el<HTMLElement>('policy-text');
    const citation = el<HTMLElement>('policy-citation');
    if (title) title.textContent = p ? p.title : 'No policy selected';
    if (meta) meta.textContent = p ? `Version ${p.version}` : '';
    if (text) text.textContent = p ? p.text : '';
    if (citation) citation.textContent = p ? `Citation: ${p.citation}` : '';
  }

  function formatRequest(r: any): string {
    if (r == null) return '';
    if (typeof r === 'string') return r;
    const parts: string[] = [];
    const id = r.request_id ?? r.id;
    if (id != null) parts.push(`Request: ${id}`);
    const status = r.status ?? r.state;
    if (status) parts.push(`Status: ${status}`);
    const summary = r.summary ?? r.description ?? r.title;
    if (summary) parts.push(String(summary));
    if (r.address) parts.push(`Address: ${r.address}`);
    return parts.length ? parts.join(' | ') : 'Request loaded.';
  }

  function computeState() {
    const st = String(wp?.status ?? wp?.state ?? '').toLowerCase();
    const explicitFalse = !!wp && wp.delivered === false;
    delivered = !!wp && !explicitFalse && (wp.delivered === true || st === 'delivered');
    pending = !!wp && !delivered && (
      wp.pending === true ||
      st.includes('pending') ||
      st === 'approved' ||
      (explicitFalse && st.includes('approv'))
    );
    if (delivered) pending = false;
  }

  function updateStateDisplay() {
    const state = el<HTMLElement>('state');
    const receipt = el<HTMLElement>('receipt');
    if (!state) return;
    state.replaceChildren();
    if (receipt) receipt.replaceChildren();
    const p = policyForWorkpaper();
    const line = document.createElement('div');
    line.textContent = delivered ? 'Delivered' : pending ? 'Approved — delivery pending' : wp ? 'Draft saved' : 'No saved draft';
    state.appendChild(line);
    if (wp) {
      const details = document.createElement('div');
      const version = wp.policy_version ?? p?.version ?? 'n/a';
      const citation = wp.citation ?? wp.policy_citation ?? p?.citation ?? 'n/a';
      details.textContent = `Revision: ${revision ?? 'n/a'} | Policy: ${wp.policy_id ?? p?.policy_id ?? 'n/a'} v${version} | Citation: ${citation}`;
      state.appendChild(details);
    }
    if (delivered) {
      const receiptId = wp?.comment_id ?? wp?.commentID ?? wp?.receipt?.comment_id ?? wp?.receipt_id ?? '';
      const actor = wp?.approved_by_display_name ?? wp?.actor_name ?? wp?.actorName ?? wp?.approved_by ?? wp?.actor?.name ?? '';
      const actorId = wp?.approved_by_actor_id ?? '';
      const rline = document.createElement('div');
      rline.textContent = `Receipt comment ID: ${receiptId || 'n/a'} | Actor: ${actor || 'n/a'}${actorId ? ` (${actorId})` : ''}`;
      if (receipt) receipt.appendChild(rline);
    } else if (pending && receipt) {
      const rline = document.createElement('div');
      rline.textContent = 'Delivery pending. A receipt is not available yet.';
      receipt.appendChild(rline);
    }
  }

  function updateUi() {
    const caseEl = el<HTMLElement>('case');
    if (caseEl) caseEl.hidden = !requestId || !reqSummary;
    const summary = el<HTMLElement>('request-summary');
    if (summary) summary.textContent = reqSummary ? formatRequest(reqSummary) : '';
    const bodyEl = el<HTMLTextAreaElement>('body');
    const notesEl = el<HTMLTextAreaElement>('private-notes');
    const sel = el<HTMLSelectElement>('policy-select');
    const confirmEl = el<HTMLInputElement>('confirm');
    const editable = busy || delivered || pending;
    if (bodyEl) bodyEl.disabled = editable;
    if (notesEl) notesEl.disabled = editable;
    if (sel) sel.disabled = editable;
    if (confirmEl) confirmEl.disabled = busy || delivered || pending || !wp || revision === null;
    const isSavedDraft = !!wp && !delivered && !pending && revision !== null;
    const unsaved = !isSavedDraft || bodyEl?.value !== savedBody || notesEl?.value !== savedNotes || currentPolicyKey() !== savedPolicyKey;
    const openBtn = el<HTMLButtonElement>('[data-action="open"]');
    if (openBtn) openBtn.disabled = busy;
    const saveBtn = el<HTMLButtonElement>('[data-action="save"]');
    if (saveBtn) saveBtn.disabled = busy || delivered || pending || !requestId || !reqSummary || !getSelectedPolicy();
    const approveBtn = el<HTMLButtonElement>('[data-action="approve"]');
    if (approveBtn) approveBtn.disabled = busy || delivered || pending || !isSavedDraft || unsaved || !confirmEl?.checked;
    const retryBtn = el<HTMLButtonElement>('[data-action="retry"]');
    if (retryBtn) retryBtn.disabled = busy || delivered || !pending || revision === null;
    const registerBtn = el<HTMLButtonElement>('[data-action="register"]');
    if (registerBtn) registerBtn.disabled = busy;
    updatePolicyPreview();
    updateStateDisplay();
  }

  function looksLikeWorkpaper(x: any): boolean {
    return !!x && typeof x === 'object' && (
      'revision' in x || 'body' in x || 'private_notes' in x || 'status' in x ||
      'delivered' in x || 'comment_id' in x || 'policy_version' in x || 'pending' in x
    );
  }

  function restoreFromWorkpaper(isOpen: boolean, result?: any) {
    if (result && result.request) reqSummary = result.request;
    if (isOpen) {
      wp = result && result.workpaper && typeof result.workpaper === 'object' ? { ...result.workpaper } : null;
      revision = wp && typeof wp.revision === 'number' ? wp.revision : null;
    } else {
      let w = result?.workpaper;
      if (w === undefined && looksLikeWorkpaper(result)) w = result;
      if (w !== undefined) {
        if (w && typeof w === 'object') wp = { ...(wp || {}), ...w };
        else wp = null;
      }
      const r = result?.revision ?? (w && typeof w === 'object' ? w.revision : undefined);
      if (typeof r === 'number') revision = r;
      else if (wp && typeof wp.revision === 'number') revision = wp.revision;
    }
    const bodyEl = el<HTMLTextAreaElement>('body');
    const notesEl = el<HTMLTextAreaElement>('private-notes');
    const sel = el<HTMLSelectElement>('policy-select');
    if (isOpen) {
      if (bodyEl) bodyEl.value = wp && wp.body != null ? String(wp.body) : '';
      if (notesEl) notesEl.value = wp && wp.private_notes != null ? String(wp.private_notes) : '';
      savedBody = bodyEl?.value ?? '';
      savedNotes = notesEl?.value ?? '';
      if (wp && wp.policy_id != null && wp.policy_version != null) {
        selectedPolicyKey = keyOf(wp.policy_id, wp.policy_version);
        if (sel) sel.value = selectedPolicyKey;
      } else {
        selectedPolicyKey = sel?.value || selectedPolicyKey;
      }
      savedPolicyKey = selectedPolicyKey;
    } else if (wp) {
      if (bodyEl && 'body' in wp) bodyEl.value = String(wp.body ?? '');
      if (notesEl && 'private_notes' in wp) notesEl.value = String(wp.private_notes ?? '');
      savedBody = bodyEl?.value ?? savedBody;
      savedNotes = notesEl?.value ?? savedNotes;
      if (wp.policy_id != null && wp.policy_version != null) {
        selectedPolicyKey = keyOf(wp.policy_id, wp.policy_version);
        if (sel) sel.value = selectedPolicyKey;
      }
      savedPolicyKey = currentPolicyKey();
    }
    computeState();
    updateUi();
  }

  function resetCase() {
    reqSummary = null;
    wp = null;
    revision = null;
    delivered = false;
    pending = false;
    savedBody = '';
    savedNotes = '';
    savedPolicyKey = '';
    selectedPolicyKey = '';
    const bodyEl = el<HTMLTextAreaElement>('body');
    const notesEl = el<HTMLTextAreaElement>('private-notes');
    const confirmEl = el<HTMLInputElement>('confirm');
    if (bodyEl) bodyEl.value = '';
    if (notesEl) notesEl.value = '';
    if (confirmEl) confirmEl.checked = false;
    updateUi();
  }

  function reset() {
    generation += 1;
    busy = false;
    requestId = '';
    policies = [];
    resetCase();
    const input = el<HTMLInputElement>('request-id');
    if (input) input.value = '';
    const form = el<HTMLFormElement>('register-form');
    form?.reset();
    renderPolicies();
    setStatus('');
    updateUi();
    const admin = el<HTMLDetailsElement>('admin-details');
    if (admin) admin.hidden = options.isAdmin !== true;
  }

  async function withBusy(fn: () => Promise<void>) {
    if (busy) return;
    const epoch = generation;
    busy = true;
    updateUi();
    try {
      await fn();
    } catch (e) {
      if (epoch === generation) setStatus(msgOf(e), true);
    } finally {
      if (epoch === generation) {
        busy = false;
        updateUi();
      }
    }
  }

  async function loadPolicies() {
    const epoch = generation;
    try {
      const result = await call('policies');
      if (epoch !== generation) return;
      const list = Array.isArray(result) ? result : Array.isArray(result?.policies) ? result.policies : [];
      policies = list.map(normalizePolicy).filter((p: Policy) => !!p.policy_id && p.version > 0);
      renderPolicies();
      updateUi();
    } catch (e) {
      if (epoch !== generation) return;
      setStatus(`Could not load approved policies: ${msgOf(e)}`, true);
    }
  }

  async function openRequest() {
    const epoch = generation;
    if (busy) return;
    const input = el<HTMLInputElement>('request-id');
    const id = input?.value.trim() || '';
    if (!id) {
      setStatus('Enter a 311 request ID.');
      return;
    }
    await withBusy(async () => {
      requestId = id;
      resetCase();
      setStatus('Opening request...');
      try {
        const result = await call('open-request', id);
        if (epoch !== generation) return;
        reqSummary = result?.request ?? { request_id: id };
        restoreFromWorkpaper(true, result);
        setStatus('Request opened.');
      } catch (e) {
        if (epoch !== generation) return;
        requestId = '';
        resetCase();
        setStatus(`Could not open request: ${msgOf(e)}`, true);
      }
    });
  }

  async function saveDraft() {
    const epoch = generation;
    if (busy) return;
    const policy = getSelectedPolicy();
    if (!requestId) {
      setStatus('Open a request first.', true);
      return;
    }
    if (!policy) {
      setStatus('Select an approved policy.', true);
      return;
    }
    const bodyEl = el<HTMLTextAreaElement>('body');
    const notesEl = el<HTMLTextAreaElement>('private-notes');
    await withBusy(async () => {
      setStatus('Saving private draft...');
      try {
        const result = await call('save-draft', requestId, {
          policy_id: policy.policy_id,
          policy_version: policy.version,
          body: bodyEl?.value ?? '',
          private_notes: notesEl?.value ?? '',
          expected_revision: revision
        });
        if (epoch !== generation) return;
        restoreFromWorkpaper(false, result);
        setStatus('Private draft saved.');
      } catch (e) {
        if (epoch !== generation) return;
        setStatus(`Could not save draft: ${msgOf(e)}`, true);
      }
    });
  }

  async function approveReply() {
    const epoch = generation;
    if (busy) return;
    const confirmEl = el<HTMLInputElement>('confirm');
    if (!confirmEl?.checked) {
      setStatus('Confirm the approval before replying.', true);
      return;
    }
    const bodyEl = el<HTMLTextAreaElement>('body');
    const notesEl = el<HTMLTextAreaElement>('private-notes');
    if (!requestId) {
      setStatus('Open a request first.', true);
      return;
    }
    if (!wp || revision === null || delivered || pending) {
      setStatus('Save a draft before approving.', true);
      return;
    }
    if (bodyEl?.value !== savedBody || notesEl?.value !== savedNotes || currentPolicyKey() !== savedPolicyKey) {
      setStatus('Save editor changes before approval.', true);
      return;
    }
    await withBusy(async () => {
      setStatus('Approving and sending reply...');
      try {
        const result = await call('approve-reply', requestId, { expected_revision: revision, confirm: true });
        if (epoch !== generation) return;
        restoreFromWorkpaper(false, result);
        if (delivered) setStatus('Reply delivered.');
        else if (pending) {
          const rawPendingError = wp?.error ?? wp?.pending_error ?? result?.error ?? result?.pending_error;
          const pendingError = typeof rawPendingError === 'string' ? rawPendingError.trim() : '';
          setStatus(`Reply approved; delivery pending. Not delivered yet.${pendingError ? ` Error: ${pendingError}` : ''}`);
        }
        else setStatus('Approval submitted.');
      } catch (e) {
        if (epoch !== generation) return;
        setStatus(`Could not approve reply: ${msgOf(e)}`, true);
      }
    });
  }

  async function retryReply() {
    const epoch = generation;
    if (busy) return;
    if (!requestId) {
      setStatus('Open a request first.', true);
      return;
    }
    if (!pending || revision === null) {
      setStatus('No pending reply to retry.', true);
      return;
    }
    await withBusy(async () => {
      setStatus('Retrying pending reply...');
      try {
        const result = await call('retry-reply', requestId, { expected_revision: revision });
        if (epoch !== generation) return;
        restoreFromWorkpaper(false, result);
        if (delivered) setStatus('Reply delivered.');
        else if (pending) {
          const rawPendingError = wp?.error ?? wp?.pending_error ?? result?.error ?? result?.pending_error;
          const pendingError = typeof rawPendingError === 'string' ? rawPendingError.trim() : '';
          setStatus(`Reply still pending delivery. Not delivered yet.${pendingError ? ` Error: ${pendingError}` : ''}`);
        }
        else setStatus('Retry submitted.');
      } catch (e) {
        if (epoch !== generation) return;
        setStatus(`Could not retry reply: ${msgOf(e)}`, true);
      }
    });
  }

  async function registerPolicy(ev: Event) {
    const epoch = generation;
    ev.preventDefault();
    if (busy) return;
    const id = el<HTMLInputElement>('reg-id')?.value.trim() || '';
    const versionText = el<HTMLInputElement>('reg-version')?.value.trim() || '';
    const title = el<HTMLInputElement>('reg-title')?.value.trim() || '';
    const text = el<HTMLTextAreaElement>('reg-text')?.value.trim() || '';
    const citation = el<HTMLInputElement>('reg-citation')?.value.trim() || '';
    const version = Number.parseInt(versionText, 10);
    if (!id || !title || !text || !citation) {
      setStatus('Complete all policy fields.', true);
      return;
    }
    if (!Number.isInteger(version) || version < 1) {
      setStatus('Policy version must be a positive integer.', true);
      return;
    }
    await withBusy(async () => {
      try {
        await call('register-policy', undefined, { policy_id: id, version, title, text, citation, approved: true });
        if (epoch !== generation) return;
        setStatus('Policy registered.');
        const form = el<HTMLFormElement>('register-form');
        form?.reset();
        await loadPolicies();
        if (epoch !== generation) return;
      } catch (e) {
        if (epoch !== generation) return;
        setStatus(`Could not register policy: ${msgOf(e)}`, true);
      }
    });
  }

  return {
    render(): string {
      return `
<div data-utilities-view>
  <h2>Utilities staff request reply</h2>
  <p data-role="status" role="status" aria-live="polite"></p>
  <section aria-labelledby="ut-request-label">
    <label id="ut-request-label">311 request ID <input data-role="request-id" autocomplete="off" placeholder="UUID"></label>
    <button type="button" data-action="open">Open original 311 request</button>
  </section>
  <section data-role="case" hidden>
    <h3>Original 311 request</h3>
    <div data-role="request-summary"></div>
    <div data-role="state" aria-live="polite"></div>
    <label>Approved policy <select data-role="policy-select"></select></label>
    <div data-role="policy-preview">
      <strong data-role="policy-title"></strong>
      <div data-role="policy-meta"></div>
      <p data-role="policy-text"></p>
      <div data-role="policy-citation"></div>
    </div>
    <label>Public reply <textarea data-role="body" rows="8"></textarea></label>
    <label>Private staff notes <textarea data-role="private-notes" rows="4"></textarea></label>
    <button type="button" data-action="save">Save private draft</button>
    <label><input type="checkbox" data-role="confirm"> I confirm this reply is approved for delivery</label>
    <button type="button" data-action="approve">Approve and reply</button>
    <button type="button" data-action="retry">Retry pending reply</button>
    <div data-role="receipt"></div>
  </section>
  <details data-role="admin-details" hidden>
    <summary>Register approved policy (admin)</summary>
    <form data-role="register-form">
      <label>Policy ID <input data-role="reg-id" required></label>
      <label>Version <input data-role="reg-version" type="number" min="1" step="1" required></label>
      <label>Title <input data-role="reg-title" required></label>
      <label>Policy text <textarea data-role="reg-text" rows="5" required></textarea></label>
      <label>Citation <input data-role="reg-citation" required></label>
      <button type="submit" data-action="register">Register policy</button>
    </form>
  </details>
</div>`;
    },

    reset,

    bind(parent: ParentNode = document): void {
      const rootEl = parent instanceof Element && parent.matches('[data-utilities-view]')
        ? parent as HTMLElement
        : parent.querySelector<HTMLElement>('[data-utilities-view]');
      if (!rootEl) return;
      root = rootEl;
      const admin = el<HTMLDetailsElement>('admin-details');
      if (admin) admin.hidden = options.isAdmin !== true;
      if (boundRoots.has(rootEl)) return;
      boundRoots.add(rootEl);

      rootEl.addEventListener('click', (ev: Event) => {
        const target = ev.target as HTMLElement | null;
        const btn = target?.closest?.<HTMLButtonElement>('[data-action]');
        if (!btn || !rootEl.contains(btn)) return;
        const action = btn.dataset.action;
        if (action === 'open') { ev.preventDefault(); void openRequest(); }
        else if (action === 'save') { ev.preventDefault(); void saveDraft(); }
        else if (action === 'approve') { ev.preventDefault(); void approveReply(); }
        else if (action === 'retry') { ev.preventDefault(); void retryReply(); }
      });

      rootEl.addEventListener('input', (ev: Event) => {
        const t = ev.target as HTMLElement | null;
        if (t?.dataset.role === 'body' || t?.dataset.role === 'private-notes') updateUi();
      });

      rootEl.addEventListener('change', (ev: Event) => {
        const t = ev.target as HTMLElement | null;
        if (t?.dataset.role === 'policy-select') {
          selectedPolicyKey = (t as HTMLSelectElement).value;
          updatePolicyPreview();
          updateUi();
        } else if (t?.dataset.role === 'confirm') {
          updateUi();
        }
      });

      rootEl.addEventListener('submit', (ev: Event) => {
        const form = ev.target as HTMLElement | null;
        if (form?.getAttribute('data-role') === 'register-form') void registerPolicy(ev);
      });

      void loadPolicies();
      updateUi();
    }
  };
}
