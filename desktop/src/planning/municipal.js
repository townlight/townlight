// SPDX-License-Identifier: AGPL-3.0-only
// Native transport supplies the current authenticated actor; no credentials in this view.
export function createMunicipalView({client, run, report, changed}) {
  let root, active = null, policy = null, kind = 'initiative', fieldId = 0;
  const el = (tag, text) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; return n; };
  function button(text, action) {
    const n = el('button', text); n.type = 'button'; n.onclick = () => run(n, action); return n;
  }
  function field(form, name, label, value = '', type = 'text', required = true) {
    const wrap = el('label', label); wrap.className = 'planning-field';
    const input = el(type === 'textarea' ? 'textarea' : 'input');
    input.name = name; input.value = value ?? ''; if (type !== 'textarea') input.type = type;
    input.required = required; if (type === 'number') input.step = 'any';
    wrap.append(input); form.append(wrap); return input;
  }
  function select(form, name, label, choices, value) {
    const wrap = el('div'); wrap.className = 'planning-field';
    const caption = el('label', label); const input = el('select'); input.name = name;
    input.id = `municipal-select-${++fieldId}`; caption.htmlFor = input.id; wrap.append(caption);
    choices.forEach(([id, text]) => { const option = el('option', text); option.value = id; input.append(option); });
    input.value = value; wrap.append(input); form.append(wrap); return input;
  }
  async function list(type = kind, offset = 0) {
    kind = type; active = null; policy = null; changed(false);
    root.replaceChildren(el('h2', 'Implementation and amendments'));
    root.append(button('Initiatives', () => list('initiative')), button('Amendments', () => list('amendment')),
      el('p', 'Select an adopted policy in the policy library to start an initiative or amendment.'));
    const result = await client.request(type === 'initiative' ? 'initiatives' : 'amendments', {offset});
    if (!result.items.length) root.append(el('p', 'No saved work on this page.'));
    for (const row of result.items) {
      const card = el('article'); card.className = 'planning-card';
      card.append(el('h3', row.snapshot.title), el('p', `${row.snapshot.status} · ${row.snapshot.responsible_staff}`),
        el('p', row.snapshot.source.citation), button('Open saved work', () => open(type, row.snapshot.source, row)));
      root.append(card);
    }
    if (offset) root.append(button('Previous page', () => list(type, Math.max(0, offset - 50))));
    if (result.next_offset !== null) root.append(button('Next page', () => list(type, result.next_offset)));
  }
  async function open(type, source, row = null) {
    kind = type; policy = source; active = row; changed(false);
    const data = row?.snapshot || {}, form = el('form'); form.className = 'planning-card';
    root.replaceChildren(el('h2', type === 'initiative' ? 'Implementation initiative' : 'Plan amendment'));
    root.append(el('p', `${source.citation} · ${source.anchor}`),
      el('p', 'Staff planning support. Saving here does not change adopted plan text or publish this work.'));
    const terminal = ['completed', 'cancelled', 'adopted', 'withdrawn'].includes(data.status);
    field(form, 'title', 'Title', data.title);
    field(form, 'responsible_staff', 'Responsible staff or team', data.responsible_staff);
    const statuses = type === 'initiative' ? ['planned', 'active', 'completed', 'cancelled'] : ['draft', 'review', 'adopted', 'withdrawn'];
    select(form, 'status', 'Status', statuses.map(s => [s, s]), data.status || statuses[0]);
    field(form, 'note', 'Reason for this update', terminal ? data.note : row ? '' : data.note, 'textarea');
    const milestones = [], measurements = data.measurements || [];
    if (type === 'initiative') {
      field(form, 'target', 'Target amount', data.target, 'number');
      field(form, 'unit', 'Unit (for example, homes or miles)', data.unit);
      field(form, 'due_on', 'Target date', data.due_on, 'date');
      const milestoneList = el('div'); form.append(el('h3', 'Milestones'), milestoneList);
      const addMilestone = (m = {}) => {
        const box = el('fieldset'); box.append(el('legend', `Milestone ${milestones.length + 1}`));
        const values = {title: field(box, 'milestone_title', 'Milestone', m.title),
          due_on: field(box, 'milestone_due', 'Due date', m.due_on, 'date'),
          completed_on: field(box, 'milestone_completed', 'Completed date', m.completed_on, 'date', false),
          evidence: field(box, 'milestone_evidence', 'Completion evidence', m.evidence, 'textarea', false)};
        milestones.push(values); milestoneList.append(box);
      };
      (data.milestones || []).forEach(addMilestone);
      const add = el('button', 'Add milestone'); add.type = 'button'; add.onclick = () => { addMilestone(); changed(true); }; form.append(add);
      form.append(el('h3', 'Recorded measurements'));
      measurements.forEach(m => form.append(el('p', `${m.recorded_on}: ${m.value} ${data.unit} · ${m.evidence}`)));
      field(form, 'measurement_value', 'New measurement amount', '', 'number', false);
      field(form, 'measurement_date', 'Measurement date', '', 'date', false);
      field(form, 'measurement_evidence', 'Measurement evidence or correction reference', '', 'textarea', false);
    } else {
      field(form, 'proposal', 'Proposed amendment', data.proposal, 'textarea');
      field(form, 'review_note', 'Review findings', data.review_note, 'textarea', false);
      const adoptionSelect = select(form, 'adoption_revision', 'Retained adopted source (after adoption)', [['', 'No adoption yet']], '');
      let sourceOffset = 0;
      const more = button('Load more adopted source revisions', async () => loadSources());
      async function loadSources() {
        const history = await client.request('source-history', {plan_id: source.plan_id, offset: sourceOffset});
        for (const r of history.items || []) {
          if (r.status !== 'adopted' || r.revision_id === source.revision_id) continue;
          const option = el('option', `${r.title || source.plan_title} · ${r.adopted_on || r.source_date} · revision ${r.sequence}`);
          option.value = r.revision_id; adoptionSelect.append(option);
        }
        if (data.adoption_revision) adoptionSelect.value = data.adoption_revision;
        sourceOffset = history.next_offset; more.hidden = sourceOffset === null;
      }
      await loadSources(); form.append(more);
      form.append(el('p', 'Import the adopted source through the policy library first. Pending material is not an adoption.'));
    }
    const save = el('button', row ? 'Save new revision' : 'Create saved work'); form.append(save);
    form.addEventListener('input', () => changed(true));
    form.onsubmit = event => { event.preventDefault(); run(save, async () => {
      const f = new FormData(form), get = name => String(f.get(name) || '').trim();
      const payload = {expected_revision: active?.revision_id || null, title: get('title'),
        responsible_staff: get('responsible_staff'), status: get('status'), note: get('note'),
        policy: {plan_id: policy.plan_id, revision_id: policy.revision_id, policy_id: policy.policy_id}};
      if (kind === 'initiative') {
        Object.assign(payload, {target: get('target'), unit: get('unit'), due_on: get('due_on'),
          milestones: milestones.map(m => Object.fromEntries(Object.entries(m).map(([k, input]) => [k, k === 'completed_on' ? input.value || null : input.value]))),
          measurements: [...measurements]});
        if (get('measurement_value') || get('measurement_date') || get('measurement_evidence')) payload.measurements.push({
          value: get('measurement_value'), recorded_on: get('measurement_date'), evidence: get('measurement_evidence')});
      } else Object.assign(payload, {proposal: get('proposal'), review_note: get('review_note'), adoption_revision: get('adoption_revision') || null});
      const result = await client.request(`${active ? 'revise' : 'create'}-${kind}`, { ...(active ? {id: active.item_id} : {}), payload});
      await open(kind, policy, result); report('Saved revision. Adopted plan text and public access are unchanged.');
    }); };
    if (terminal) { form.querySelectorAll('input,select,textarea,button').forEach(n => n.disabled = true); root.append(el('p', 'This completed lifecycle is read-only.')); }
    root.append(form);
    if (row) root.append(button('Read revision history', async () => {
      const result = await client.request('municipal-history', {id: row.item_id});
      const history = el('section'); history.append(el('h3', 'Saved revision history'));
      result.revisions.forEach(r => history.append(el('p', `Revision ${r.sequence} · ${r.created_at} · ${r.snapshot.status} · ${r.snapshot.note} · recorded by ${r.actor_id}`)));
      root.append(history);
    }));
  }
  return {mount(node) { root = node; }, list, open, reset() { active = policy = null; }};
}
