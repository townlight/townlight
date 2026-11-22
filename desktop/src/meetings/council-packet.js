export function councilPacketMarkup() {
  return `<details data-council-packet>
    <summary>Prepare a printable council packet</summary>
    <fieldset><legend>Sources for the next saved revision</legend>
      <p>Mark agenda items and release-ready copies for public review here, then save the packet.</p>
      <div data-council-draft-agenda></div>
      <div data-council-retained></div>
      <button type="button" data-council-choose>Choose PDF or UTF-8 text attachment</button>
      <div data-council-chosen></div>
    </fieldset>
    <fieldset><legend>Review and approve the saved revision</legend>
      <label>Audience <select data-council-audience><option value="staff">Staff</option><option value="public">Public</option></select></label>
      <div data-council-public></div>
      <button type="button" data-council-preview>Prepare review files</button>
      <label><input type="checkbox" data-council-confirm> I reviewed these exact files for the selected audience</label>
      <button type="button" data-council-approve disabled>Approve reviewed files</button>
      <label>Approved revision <select data-council-approved-revision></select></label>
      <button type="button" data-council-download disabled>Save approved files locally</button>
      <button type="button" data-council-folder>Open Meetings exports</button>
      <p role="status" aria-live="polite" data-council-status></p>
    </fieldset>
    <p>Public files include only the selected saved items and reviewed release copies. Review for closed-session and private content. The HTML agenda is the accessible index. Imported PDF pages may need separate accessible copies. Approval keeps these files in Townlight until you explicitly publish them.</p>
  </details>`;
}

export function bindCouncilPacket(root, client) {
  const box = root.querySelector('[data-council-packet]');
  const doc = root.ownerDocument;
  const $ = name => box.querySelector(`[data-council-${name}]`);
  const audience = $('audience');
  const confirm = $('confirm');
  const status = $('status');
  const revisions = $('approved-revision');
  let packet = null;
  let history = [];
  let newFiles = [];
  let prepared = null;
  let seedAgenda = true;
  let busy = false;
  let selectionVersion = 0;

  function invalidate() {
    selectionVersion += 1;
    prepared = null;
    confirm.checked = false;
    controls();
  }

  function controls() {
    $('preview').disabled = busy || !packet;
    $('approve').disabled = busy || !prepared || !confirm.checked;
    $('download').disabled = busy || !revisions.value;
  }

  function checks(target, legend, options, checked = new Set()) {
    const heading = doc.createElement('p');
    heading.textContent = legend;
    const labels = options.map(([value, description]) => {
      const label = doc.createElement('label');
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.value = value;
      input.checked = checked.has(value);
      label.append(input, ` ${description}`);
      const row = doc.createElement('div');
      row.append(label);
      return row;
    });
    target.replaceChildren(heading, ...labels);
  }

  function values(target) {
    return [...target.querySelectorAll('input:checked')].map(input => input.value);
  }

  function renderSources() {
    checks($('retained'), 'Keep attachments from the saved revision',
      (packet?.source_references || []).map((file, index) => [String(index), file.file_name]),
      new Set((packet?.source_references || []).map((_, index) => String(index))));
  }

  function renderPublic() {
    const container = $('public');
    container.hidden = audience.value !== 'public';
    container.replaceChildren();
    if (container.hidden || !packet) return;
    const items = doc.createElement('div');
    const files = doc.createElement('div');
    items.dataset.publicAgenda = '';
    files.dataset.publicFiles = '';
    checks(items, 'Include these saved public agenda items', packet.snapshot_content
      .filter(item => item.packet_access === 'public_candidate').map(item => [item.id, item.title]));
    checks(files, 'Include these saved public release copies', packet.source_references
      .map((file, index) => [String(index), file]).filter(([, file]) => file.packet_access === 'public_candidate')
      .map(([index, file]) => [index, file.file_name]));
    container.append(items, files);
  }

  function renderChosen() {
    const rows = newFiles.map(file => {
      const row = doc.createElement('div');
      const label = doc.createElement('label');
      const access = doc.createElement('input');
      access.type = 'checkbox';
      access.checked = file.public;
      access.addEventListener('change', () => { file.public = access.checked; });
      label.append(access, ` Public review copy: ${file.path.split(/[\\/]/).at(-1)}`);
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => { newFiles = newFiles.filter(item => item !== file); renderChosen(); });
      row.append(label, ' ', remove);
      return row;
    });
    $('chosen').replaceChildren(...rows);
  }

  function renderRevisions() {
    revisions.replaceChildren(...[...history].reverse().map(receipt => new Option(
      `Version ${receipt.packet_version} · ${receipt.audience} · ${new Date(receipt.approved_at).toLocaleString()}`,
      receipt.approval_id)));
  }

  async function action(task) {
    if (busy) return;
    busy = true;
    status.textContent = '';
    controls();
    try {
      await task();
    } catch (error) {
      status.textContent = error?.message || String(error);
    } finally {
      busy = false;
      controls();
    }
  }

  $('choose').addEventListener('click', () => action(async () => {
    const path = await client.chooseCouncilSource();
    if (path && !newFiles.some(file => file.path === path)) newFiles.push({path, public: false});
    renderChosen();
  }));
  audience.addEventListener('change', () => { invalidate(); renderPublic(); });
  $('public').addEventListener('change', invalidate);
  confirm.addEventListener('change', controls);
  revisions.addEventListener('change', controls);
  $('folder').addEventListener('click', () => action(() => client.openExports()));
  $('preview').addEventListener('click', () => action(async () => {
    const selected = packet;
    const targetAudience = audience.value;
    const publicCopy = targetAudience === 'public';
    invalidate();
    const version = selectionVersion;
    const receipt = await client.previewCouncilPacket(selected.id, {audience: targetAudience,
      agenda_item_ids: publicCopy ? values(box.querySelector('[data-public-agenda]')) : [],
      source_indexes: publicCopy ? values(box.querySelector('[data-public-files]')).map(Number) : []});
    const files = await client.saveCouncilFiles(selected.id, {artifact_id: receipt.preview_id,
      manifest_sha256: receipt.manifest_sha256, approved: false});
    if (packet?.id !== selected.id || selectionVersion !== version) return;
    prepared = receipt;
    status.textContent = `Review packet.pdf and agenda.html in ${files.folder}.`;
  }));
  $('approve').addEventListener('click', () => action(async () => {
    const selected = packet;
    const receipt = await client.approveCouncilPacket(selected.id, {preview_id: prepared.preview_id,
      manifest_sha256: prepared.manifest_sha256, public_confirmed: prepared.audience === 'public'});
    invalidate();
    if (packet?.id !== selected.id) return;
    history = [...history, {...receipt, packet_id: selected.id, packet_version: selected.packet_version,
      approved_at: new Date().toISOString()}];
    renderRevisions();
    status.textContent = 'Council packet approved. Save the approved files to print or deliver them.';
  }));
  $('download').addEventListener('click', () => action(async () => {
    const receipt = history.find(item => item.approval_id === revisions.value);
    const files = await client.saveCouncilFiles(receipt.packet_id, {artifact_id: receipt.approval_id,
      manifest_sha256: receipt.manifest_sha256, approved: true});
    status.textContent = `Approved packet.pdf and agenda.html saved in ${files.folder}.`;
  }));
  controls();

  return {
    sync: controls,
    load(saved, packets = []) {
      history = packets.flatMap(item => (item.delivery_history || [])
        .filter(receipt => receipt.kind === 'council-packet-approval')
        .map(receipt => ({...receipt, packet_id: item.id, packet_version: item.packet_version})));
      renderRevisions();
      if (packet?.id === saved?.id) return;
      packet = saved;
      newFiles = [];
      seedAgenda = true;
      renderSources();
      renderChosen();
      renderPublic();
      invalidate();
    },
    order(options) {
      const selected = new Set(seedAgenda ? (packet?.snapshot_content || [])
        .filter(item => item.packet_access === 'public_candidate').map(item => item.id) : values($('draft-agenda')));
      checks($('draft-agenda'), 'Agenda items for public review', options, selected);
      seedAgenda = false;
    },
    capture() {
      return {public_agenda_ids: values($('draft-agenda')), prior_packet_id: packet?.id,
        retained_source_indexes: values($('retained')).map(Number),
        council_sources: newFiles.map(file => ({path: file.path, packet_access: file.public ? 'public_candidate' : 'staff_only'}))};
    },
  };
}
