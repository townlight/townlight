import {bindCouncilPacket, councilPacketMarkup} from './council-packet.js';

export function clerkWorkspaceMarkup(isSharedStaff = false) {
  return `
<section data-clerk-workspace>
  <h3>Work on a saved meeting</h3>
  <form data-search-form>
    <label>Search meetings <input type="search" name="query" maxlength="255" data-search-input autocomplete="off"></label>
    <button type="submit">Search</button>
  </form>
  <label>Saved meeting <select data-meeting-select></select></label>
  <label>Unassigned agenda item <select data-agenda-picker></select></label>
  <button type="button" data-add-agenda>Place on this agenda</button>
  <label>Packet order (top to bottom) <select data-packet size="6"></select></label>
  <button type="button" data-move-up>Move up</button>
  <button type="button" data-move-down>Move down</button>
  <button type="button" data-save-packet>Save packet</button>
  <button type="button" data-deliver-packet>Deliver saved packet files</button>
  <button type="button" data-open-station ${isSharedStaff ? 'hidden title="Open Station on the city Windows host"' : ''}>Open Station</button>
  ${councilPacketMarkup()}
  <p data-status role="status" aria-live="polite"></p>
  <p data-summary></p>
</section>`;
}

export function bindClerkWorkspace(root, client, openStation) {
  const section = root.querySelector('[data-clerk-workspace]');
  if (!section) return null;
  const $ = (s) => section.querySelector(s);
  const doc = section.ownerDocument;
  const searchForm = $('[data-search-form]');
  const searchInput = $('[data-search-input]');
  const meetingSelect = $('[data-meeting-select]');
  const agendaPicker = $('[data-agenda-picker]');
  const addBtn = $('[data-add-agenda]');
  const packetSelect = $('[data-packet]');
  const upBtn = $('[data-move-up]');
  const downBtn = $('[data-move-down]');
  const saveBtn = $('[data-save-packet]');
  const deliverBtn = $('[data-deliver-packet]');
  const openBtn = $('[data-open-station]');
  const statusEl = $('[data-status]');
  const summaryEl = $('[data-summary]');
  const council = bindCouncilPacket(section, client);
  let packetIds = [];
  let savedPacketId = '';
  let packetMeetingId = '';
  let busy = false;

  const setStatus = (msg, isError = false) => {
    statusEl.textContent = msg;
    statusEl.dataset.error = isError ? 'true' : 'false';
  };

  async function runBusy(task) {
    if (busy) return;
    busy = true;
    section.setAttribute('aria-busy', 'true');
    const controls = [...section.querySelectorAll('input,select,button')];
    const active = section.contains(doc.activeElement) ? doc.activeElement : null;
    controls.forEach((el) => { el.disabled = true; });
    try {
      return await task();
    } finally {
      busy = false;
      section.setAttribute('aria-busy', 'false');
      controls.forEach((el) => { el.disabled = false; });
      const hasMeeting = Boolean(meetingSelect.value);
      openBtn.disabled = !hasMeeting;
      addBtn.disabled = !hasMeeting || !agendaPicker.value;
      saveBtn.disabled = !hasMeeting || packetIds.length === 0;
      deliverBtn.disabled = !hasMeeting || !savedPacketId;
      upBtn.disabled = downBtn.disabled = packetIds.length < 2;
      council.sync();
      if (active?.isConnected && !active.disabled && doc.activeElement === doc.body) active.focus();
    }
  }

  async function loadSummary(meetingId) {
    if (!meetingId) {
      summaryEl.textContent = 'No saved meeting selected.';
      savedPacketId = '';
      council.load(null);
      return null;
    }
    try {
      const saved = await client.read('proceedings', meetingId);
      const latestPacket = saved.packets.at(-1) || null;
      savedPacketId = latestPacket?.id || '';
      council.load(latestPacket, saved.packets);
      summaryEl.textContent = [
        saved.meeting.title,
        `${saved.motions.length} motions`,
        `${saved.votes.length} votes`,
        `${saved.packets.length} packet versions`,
        `${saved.minutes.length} minutes drafts`,
      ].join(' · ');
      return latestPacket;
    } catch (err) {
      savedPacketId = '';
      council.load(null);
      summaryEl.textContent = `Saved proceedings unavailable: ${err?.message || err}`;
      return null;
    }
  }

  function renderPacket(agenda, meetingId) {
    const assigned = new Map(
      agenda
        .filter((a) => String(a.meeting_id) === String(meetingId))
        .map((a) => [String(a.id), a])
    );
    const activeItem = packetSelect.value;
    packetIds = packetIds.filter(id => assigned.has(id));
    for (const id of assigned.keys()) {
      if (!packetIds.includes(id)) packetIds.push(id);
    }
    packetSelect.replaceChildren(
      ...packetIds.map(id => new Option(assigned.get(id).title, id))
    );
    council.order([...packetSelect.options].map(option => [option.value, option.text]));
    if (packetIds.includes(activeItem)) packetSelect.value = activeItem;
  }

  async function doRefresh(prevMeeting = meetingSelect.value) {
    const query = searchInput.value;
    const prevAgenda = agendaPicker.value;
    const result = await client.catalog(query, prevMeeting || null);
    const meetings = Array.isArray(result?.meetings) ? result.meetings : [];
    const agenda = Array.isArray(result?.agenda) ? result.agenda : [];
    const meetingId = meetings.some((m) => String(m.id) === String(prevMeeting))
      ? prevMeeting
      : '';
    meetingSelect.replaceChildren(
      new Option('Choose a meeting', ''),
      ...meetings.map((m) => new Option(`${m.title} — ${m.scheduled_start ? new Date(m.scheduled_start).toLocaleString() : 'Date unavailable'}`, m.id))
    );
    meetingSelect.value = meetingId;
    section.dispatchEvent(new CustomEvent("clerk-meeting-change", {detail:meetingId || null}));
    const unassigned = agenda.filter(a => !a.meeting_id);
    agendaPicker.replaceChildren(
      new Option('Choose an agenda item', ''),
      ...unassigned.map(a => new Option(a.title, a.id))
    );
    if ([...agendaPicker.options].some((o) => o.value === prevAgenda)) agendaPicker.value = prevAgenda;
    const latestPacket = await loadSummary(meetingId);
    if (String(packetMeetingId) !== String(meetingId)) {
      packetIds = [...(latestPacket?.agenda_item_ids || [])];
      packetMeetingId = String(meetingId);
    }
    renderPacket(agenda, meetingId);
    setStatus(meetings.length ? `${meetings.length} matching meetings.` : 'No meetings match your search.');
    return meetingId;
  }

  const refresh = () => runBusy(doRefresh);

  function movePacket(delta) {
    const idx = packetSelect.selectedIndex;
    const next = idx + delta;
    if (idx < 0 || next < 0 || next >= packetSelect.options.length) return;
    const selected = packetSelect.options[idx];
    const other = packetSelect.options[next];
    if (delta < 0) packetSelect.insertBefore(selected, other);
    else packetSelect.insertBefore(other, selected);
    packetSelect.selectedIndex = next;
    packetIds = [...packetSelect.options].map((o) => o.value);
    council.order([...packetSelect.options].map(option => [option.value, option.text]));
    setStatus(`Moved ${selected.textContent} to position ${next + 1}.`);
  }

  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    refresh().catch((err) => setStatus(err?.message || String(err), true));
  });

  meetingSelect.addEventListener('change', () => {
    packetIds = [];
    packetMeetingId = '';
    refresh().catch((err) => setStatus(err?.message || String(err), true));
  });

  agendaPicker.addEventListener('change', () => {
    addBtn.disabled = busy || !meetingSelect.value || !agendaPicker.value;
  });

  addBtn.addEventListener('click', () => {
    runBusy(async () => {
      const itemId = agendaPicker.value;
      const meetingId = meetingSelect.value;
      if (!itemId) throw new Error('Select an agenda item to add.');
      if (!meetingId) throw new Error('Select a saved meeting first.');
      await client.assignAgendaMeeting(itemId, { meeting_id: meetingId });
      packetIds.push(itemId);
      await doRefresh();
      setStatus('Agenda item assigned and added to packet order.');
    }).catch((err) => setStatus(err?.message || String(err), true));
  });

  saveBtn.addEventListener('click', () => {
    runBusy(async () => {
      const meetingId = meetingSelect.value;
      if (!meetingId) throw new Error('Select a saved meeting first.');
      if (!packetIds.length) throw new Error('Packet order is empty.');
      await client.capturePacket(meetingId, { agenda_item_ids: packetIds.map(String).join(','), ...council.capture() });
      await loadSummary(meetingId);
      setStatus(`Saved packet with ${packetIds.length} agenda items.`);
    }).catch((err) => setStatus(err?.message || String(err), true));
  });

  deliverBtn.addEventListener('click', () => {
    runBusy(async () => {
      if (!savedPacketId) return;
      await client.deliverPacket(savedPacketId);
      setStatus('Saved packet files delivered to the Townlight profile.');
    }).catch((err) => setStatus(err?.message || String(err), true));
  });

  openBtn.addEventListener('click', () => {
    runBusy(async () => {
      const meetingId = meetingSelect.value;
      if (!meetingId) throw new Error('Select a saved meeting first.');
      await openStation(meetingId);
      setStatus('Station opened without starting.');
    }).catch((err) => setStatus(err?.message || String(err), true));
  });

  upBtn.addEventListener('click', () => movePacket(-1));
  downBtn.addEventListener('click', () => movePacket(1));

  const reportError = err => setStatus(err?.message || String(err), true);
  const initialized = refresh().catch(reportError);
  return {
    refresh: () => refresh().catch(reportError),
    async selectMeeting(id) {
      await initialized;
      await runBusy(() => doRefresh(id));
    },
  };
}
