import { createPlanningClient } from './client.ts';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textField = (name, label, value = '', max = 10000) => `<label>${label}<textarea name="${name}" maxlength="${max}">${esc(value)}</textarea></label>`;

export function createPlanningView(invoke, publicMode = false) {
  const client = createPlanningClient(invoke, publicMode);
  let root, status, selected = [], links = [], draftConsiderations = [], active = null, pendingBundle = null, importPreview = null, snapshotPreview = null;
  let sourceOffset = 0, analysisOffset = 0, snapshotOffset = 0;
  const report = message => { if (status?.isConnected) status.textContent = message; };
  const button = (label, handler) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = label;
    node.addEventListener('click', () => run(node, handler)); return node;
  };
  async function run(control, handler) {
    control.disabled = true; report('Working…');
    try { await handler(); }
    catch (error) {
      const code = error?.status ?? error?.status_code;
      report(code === 409 || error?.code === 'conflict' ? 'Saved work changed. Reopen the saved analysis, reconcile your edits, and save again.' :
        'Planning could not complete this action. Check your account and System Health, then reload saved work before retrying.');
    } finally { if (control.isConnected) control.disabled = false; }
  }
  function show(target, value) {
    const output = root.querySelector(target); output.replaceChildren();
    const pre = document.createElement('pre'); pre.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2); output.append(pre);
  }
  function pageRows(target, items, makeRow, nextOffset, load) {
    const output = root.querySelector(target); output.replaceChildren();
    if (!items.length) output.textContent = 'No saved items on this page.';
    for (const item of items) output.append(makeRow(item));
    if (nextOffset !== null) output.append(button('Next page', () => load(nextOffset)));
    output.append(button('Refresh from first page', () => load(0)));
  }
  async function sources(offset = 0) {
    sourceOffset = offset;
    const result = await client.request('sources', {offset});
    pageRows('[data-planning-sources]', result.items, item => {
      const row = document.createElement('article');
      const label = document.createElement('p'); label.textContent = `${item.title} · ${item.status} · ${item.visibility} · ${item.effective_on || 'effective date pending'}`;
      row.append(label, button('Inspect source and history', async () => {
        const revision = await client.request('revision', {id: item.revision_id});
        show('[data-planning-source-detail]', revision);
        for (const doc of revision.documents) root.querySelector('[data-planning-source-detail]').append(button(`Save original ${doc.filename}`, async () => {
          const saved = await client.request('original', {id: item.revision_id, document_id: doc.document_id}); report(`Original saved: ${saved.path} · SHA256 ${saved.sha256}`);
        }));
        await history('source-history', {plan_id: item.plan_id});
        report('Source metadata, exact excerpts and immutable history loaded.');
      })); return row;
    }, result.next_offset, sources);
  }
  async function analyses(offset = 0) {
    analysisOffset = offset;
    const result = await client.request('analyses', {offset});
    pageRows('[data-planning-analyses]', result.items, item => button(`${item.project_name} · ${item.review_state} · ${item.revision_id}`, async () => {
      const saved = await client.request('analysis', {id: item.analysis_id});
      if (!saved) throw new Error('Analysis unavailable');
      active = saved; selected = saved.payload.policy_context; links = saved.payload.linked_sources; snapshotPreview = null;
      editor(saved.payload);
      await history('analysis-history', {id: item.analysis_id});
      report(`Reopened revision ${saved.revision_id}. Saving creates a new immutable revision.`);
    }), result.next_offset, analyses);
  }
  async function history(operation, values, offset = 0) {
    const page = await client.request(operation, {...values, offset});
    show('[data-planning-history]', page.items);
    if (page.next_offset !== null && page.next_offset !== undefined) root.querySelector('[data-planning-history]').append(button('Next history page', () => history(operation, values, page.next_offset)));
  }
  async function snapshots(offset = 0) {
    snapshotOffset = offset;
    const result = await client.request('snapshots', {offset});
    pageRows('[data-planning-snapshots]', result.items, item => {
      const row = document.createElement('article');
      const label = document.createElement('p'); label.textContent = `${item.title} · ${item.visibility} · ${item.citation}`;
      row.append(label, button('Read reviewed snapshot', async () => {
        const saved = await client.request('snapshot', {id: item.version});
        if (!saved) throw new Error('Snapshot unavailable');
        show('[data-planning-snapshot-detail]', saved.text); report('Reviewed snapshot rechecked and loaded.');
      }), button('Export exact snapshot', async () => {
        const result = await client.request('export-snapshot', {id: item.version, expected_sha256: item.sha256});
        report(`Exact snapshot saved: ${result.path} · SHA256 ${result.sha256}`);
      }));
      if (!publicMode) row.append(button('Request Access advice', async () => { show('[data-planning-snapshot-detail]', await client.request('access-advice', {id: item.version})); report('Advice requires review; the original snapshot is retained.'); }));
      return row;
    }, result.next_offset, snapshots);
  }
  function selectionControls() {
    const target = root.querySelector('[data-planning-selected]'); if (!target) return;
    target.replaceChildren();
    for (const policy of selected) {
      const row = document.createElement('p'); row.textContent = `${policy.citation} · ${policy.anchor} · revision ${policy.revision_id}`;
      row.append(button('Remove selected policy', async () => { collectConsiderations(); selected = selected.filter(p => p !== policy); selectionControls(); report('Policy removed from this draft.'); })); target.append(row);
    }
    const considerations = root.querySelector('[data-planning-considerations]');
    const old = draftConsiderations;
    considerations.innerHTML = selected.map((p, i) => {
      const found = old.find(c => c.policy.revision_id === p.revision_id && c.policy.policy_id === p.policy_id);
      return `<fieldset data-consideration="${i}"><legend>${esc(p.citation)}: proposal-specific consideration</legend><label>Relationship <select name="stance"><option value="uncertain">Uncertain</option><option value="supporting" ${found?.stance === 'supporting' ? 'selected' : ''}>Supporting</option><option value="conflicting" ${found?.stance === 'conflicting' ? 'selected' : ''}>Conflicting</option></select></label>${textField('note','Staff consideration (optional)',found?.note || '',5000)}</fieldset>`;
    }).join('');
    root.querySelector('[data-planning-links]').textContent = links.length ? links.map(l => `${l.provider}: ${l.source_id} · ${l.relation} · SHA256 ${l.expected_sha256}`).join('\n') : 'No connected evidence selected.';
  }
  const refs = () => selected.map(p => ({plan_id:p.plan_id, revision_id:p.revision_id, policy_id:p.policy_id}));
  function collectConsiderations() {
    const values = [...root.querySelectorAll('[data-consideration]')].map(row => ({policy:refs()[Number(row.dataset.consideration)], stance:row.querySelector('select').value, note:row.querySelector('textarea').value})).filter(c => c.note.trim());
    draftConsiderations = values;
    return values;
  }
  function editor(data = {}) {
    draftConsiderations = data.considerations || [];
    const target = root.querySelector('[data-planning-editor]');
    target.innerHTML = `<h3>${active ? 'Edit saved analysis' : 'New staff analysis'}</h3><p>Save a draft, review it explicitly, then preview the intended snapshot audience. All planning conclusions require staff judgment.</p>
      <form data-planning-analysis><label>Project name <input name="project_name" required maxlength="500" value="${esc(data.project_name || '')}"></label>
      ${textField('proposal','Proposal',data.proposal)}${textField('analysis_text','Staff analysis',data.analysis_text,50000)}
      ${textField('staff_notes','Private staff notes',data.staff_notes)}${textField('public_summary','Separately edited public summary',data.public_summary)}
      <label>Intended audience <select name="audience"><option value="staff">Staff</option><option value="public" ${data.audience === 'public' ? 'selected' : ''}>Public</option></select></label>
      <div data-planning-selected></div><div data-planning-considerations></div><pre data-planning-links></pre>
      ${textField('review_notes','Review evidence and applicability notes',data.review_notes,5000)}
      <label><input name="reviewed" type="checkbox">I reviewed the cited sources, analysis and intended audience. Record my current account as reviewer.</label>
      <button>Save analysis revision</button></form>
      <form data-planning-preview><label>Snapshot audience <select name="visibility"><option value="staff_only">Staff only</option><option value="public">Public summary and permitted citations</option></select></label><button>Preview saved reviewed revision</button></form>
      <div data-planning-preview-output></div>`;
    selectionControls();
    target.querySelector('[data-planning-analysis]').addEventListener('submit', event => {
      event.preventDefault(); const form = event.currentTarget;
      run(form.querySelector('button'), async () => {
        const fields = new FormData(form), reviewed = fields.get('reviewed') === 'on';
        const payload = Object.fromEntries(['project_name','proposal','analysis_text','staff_notes','public_summary','audience','review_notes'].map(k => [k,String(fields.get(k) || '')]));
        payload.selected_policies = refs(); payload.considerations = collectConsiderations(); payload.linked_sources = links;
        payload.review_state = reviewed ? 'reviewed' : 'draft'; payload.expected_previous_revision = active?.revision_id || null;
        const receipt = await client.request(active ? 'revise-analysis' : 'create-analysis', active ? {id:active.analysis_id,payload} : {payload});
        active = await client.request('analysis', {id:receipt.analysis_id}); snapshotPreview = null;
        editor(active.payload); await analyses(analysisOffset); report(`Saved ${reviewed ? 'reviewed' : 'draft'} revision ${receipt.revision_id}.`);
      });
    });
    target.querySelector('[data-planning-preview]').addEventListener('submit', event => {
      event.preventDefault(); const form = event.currentTarget;
      run(form.querySelector('button'), async () => {
        if (!active) { report('Save and review an analysis before creating a snapshot.'); return; }
        const payload = {expected_revision:active.revision_id,visibility:String(new FormData(form).get('visibility'))};
        snapshotPreview = await client.request('preview-snapshot', {id:active.analysis_id,payload});
        show('[data-planning-preview-output]', snapshotPreview.text);
        const preview = snapshotPreview;
        root.querySelector('[data-planning-preview-output]').append(button('Create this immutable snapshot', async () => {
          const created = await client.request('create-snapshot', {id:active.analysis_id,payload});
          if (created.sha256 !== preview.sha256) throw new Error('Preview changed');
          await snapshots(snapshotOffset); report(`Created ${created.visibility} snapshot ${created.version} · SHA256 ${created.sha256}. No Records response was released.`);
        })); report(`Preview only · ${preview.visibility} · SHA256 ${preview.sha256}.`);
      });
    });
  }
  return {
    render() {
      return `<section data-planning-workspace><h2>Townlight Planning${publicMode ? '' : ' development preview'}</h2>
        <p><strong>Cited policy context for human review. This is not a zoning, legal, land-use or entitlement determination.</strong></p>
        <p data-planning-status role="status" aria-live="polite">Load saved work or search adopted policy sources.</p>
        <form data-planning-search><label>Policy search <input name="query" required maxlength="2000"></label><button>Search adopted policies</button></form><div data-planning-results></div>
        ${publicMode ? '' : `<h3>Source administration</h3><button type="button" data-planning-pick>Choose and preview local source bundle</button><div data-planning-import></div>
          <button type="button" data-planning-open-exports>Open saved originals and snapshots folder</button>
          <h3>Imported plans</h3><div data-planning-sources></div><div data-planning-source-detail></div>
          <h3>Saved analyses</h3><button type="button" data-planning-new>Start a new analysis</button><div data-planning-analyses></div>
          <form data-planning-connections><label>Evidence provider <select name="provider"><option value="meetings">Meetings</option><option value="zoning">Zoning</option></select></label><label>Evidence search <input name="query" required maxlength="500"></label><label>Relationship <select name="relation"><option value="context">Context</option><option value="hearing">Hearing</option><option value="adoption-evidence">Adoption evidence</option><option value="precedent">Precedent</option></select></label><button>Find permitted evidence</button></form><div data-planning-connection-results></div><div data-planning-editor></div>
          <details><summary>Source and analysis history</summary><div data-planning-history></div></details>`}
        <h3>Reviewed snapshots</h3><div data-planning-snapshots></div><div data-planning-snapshot-detail></div></section>`;
    },
    bind() {
      root = document.querySelector('[data-planning-workspace]'); if (!root) return;
      status = root.querySelector('[data-planning-status]'); active = null; selected = []; links = []; draftConsiderations = []; pendingBundle = null; importPreview = null; snapshotPreview = null;
      root.querySelector('[data-planning-search]').addEventListener('submit', event => {
        event.preventDefault(); const form = event.currentTarget;
        run(form.querySelector('button'), async () => {
          const result = await client.request('search-policies', {payload:{query:String(new FormData(form).get('query'))}});
          const output = root.querySelector('[data-planning-results]'); output.replaceChildren();
          for (const policy of result.sources) {
            const article = document.createElement('article');
            const text = document.createElement('p'); text.textContent = `${policy.citation} · ${policy.anchor} · adopted ${policy.adopted_on} · effective ${policy.effective_on}\n${policy.excerpt}\nSHA256 ${policy.source_sha256}`;
            article.append(text, button('Save original source', async () => { const result = await client.request('original', {id:policy.revision_id,document_id:policy.document_id}); report(`Original saved: ${result.path} · SHA256 ${result.sha256}`); }));
            if (!publicMode) article.append(button('Select policy for analysis', async () => {
              collectConsiderations(); if (!selected.some(p => p.revision_id === policy.revision_id && p.policy_id === policy.policy_id)) selected.push(policy);
              selectionControls(); report('Versioned policy selected for the current draft.');
            })); output.append(article);
          }
          report(result.status === 'no_supported_policy' ? 'No adopted source supports this search. Refine the search or import verified sources.' : result.status === 'needs_review' ? 'Multiple source excerpts may overlap or conflict. Staff must reconcile applicability.' : 'Cited policy context loaded; staff review is required.');
        });
      });
      run(status, async () => { await snapshots(); if (!publicMode) { await sources(); await analyses(); } report('Saved work loaded.'); });
      if (publicMode) return;
      root.querySelector('[data-planning-open-exports]').addEventListener('click', event => run(event.currentTarget, async () => {
        const result = await invoke('open_domain_exports', {request:{folder:'planning'}}); report(result.message);
      }));
      editor();
      root.querySelector('[data-planning-new]').addEventListener('click', () => { active = null; selected = []; links = []; snapshotPreview = null; editor(); report('New unsaved staff draft.'); });
      root.querySelector('[data-planning-pick]').addEventListener('click', event => run(event.currentTarget, async () => {
        pendingBundle = await client.pickBundle(); if (!pendingBundle) { report('Source selection cancelled.'); return; }
        importPreview = await client.request('preview-import', {payload:{bundle:pendingBundle}}); show('[data-planning-import]', importPreview);
        const container = root.querySelector('[data-planning-import]');
        const label = document.createElement('label'); label.textContent = 'Previous revision for an amendment (copy from current source history; leave empty for a new plan)';
        const previous = document.createElement('input'); previous.maxLength = 36; label.append(previous); container.append(label);
        const bundle = pendingBundle;
        container.append(button('Import this verified source bundle', async () => {
          const receipt = await client.request('import-bundle', {payload:{bundle,expected_previous_revision:previous.value.trim() || null}});
          container.replaceChildren(); await sources(sourceOffset); report(`Imported immutable source revision ${receipt.revision_id}.`);
        })); report('Preview metadata, exact excerpts, anchors and original hashes. Import requires explicit confirmation.');
      }));
      root.querySelector('[data-planning-connections]').addEventListener('submit', event => {
        event.preventDefault(); const form = event.currentTarget;
        run(form.querySelector('button'), async () => {
          const fields = new FormData(form), provider = String(fields.get('provider')), relation = String(fields.get('relation'));
          const response = await client.request('search-connections', {payload:{provider,query:String(fields.get('query'))}});
          const output = root.querySelector('[data-planning-connection-results]'); output.replaceChildren();
          for (const item of response.results) output.append(button(`Select ${item.title} · ${item.citation}`, async () => {
            if (!links.some(l => l.provider === provider && l.source_id === item.source_id)) links.push({provider,relation,source_id:item.source_id,expected_sha256:item.sha256});
            collectConsiderations(); selectionControls(); report('Evidence selected with its expected hash. Saving rechecks permission.');
          }));
          report(response.results.length ? 'Choose evidence explicitly for this draft.' : 'No permitted connected evidence matched.');
        });
      });
    }
  };
}
