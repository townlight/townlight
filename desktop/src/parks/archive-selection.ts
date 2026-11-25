type ArchiveKind = 'resource' | 'program' | 'booking' | 'registration';

type ArchiveCtx = {
  call: (op: string, extra?: Record<string, unknown>) => Promise<unknown> | unknown;
  run: (label: string, fn: () => Promise<unknown>) => unknown;
  status?: ((message: string) => void) | { set?: (message: string) => void };
  emit?: (name: string, detail: unknown) => void;
};

const isArchiveKind = (value: string): value is ArchiveKind =>
  value === 'resource' || value === 'program' || value === 'booking' || value === 'registration';

export function renderArchiveSelection(): string {
  return `
    <div class="parks-archive-selection">
      <label class="parks-field">
        <span>Kind</span>
        <select data-archive-kind>
          <option value="resource">Resource</option>
          <option value="program">Program</option>
          <option value="booking">Booking</option>
          <option value="registration">Registration</option>
        </select>
      </label>
      <label class="parks-field">
        <span>Record</span>
        <select data-archive-entity disabled>
          <option value="">Select a record</option>
        </select>
      </label>
      <button type="button" data-archive-refresh>Refresh</button>
      <p data-archive-status role="status"></p>
    </div>
  `;
}

export function bindArchiveSelection(root: HTMLElement, ctx: ArchiveCtx): () => Promise<void> {
  const doc = root.ownerDocument || document;
  const kindSelect = root.querySelector<HTMLSelectElement>('[data-archive-kind]');
  const entitySelect = root.querySelector<HTMLSelectElement>('[data-archive-entity]');
  const refreshButton = root.querySelector<HTMLButtonElement>('[data-archive-refresh]');
  const statusEl = root.querySelector<HTMLElement>('[data-archive-status]');

  let kind: ArchiveKind = isArchiveKind(kindSelect?.value ?? '') ? (kindSelect!.value as ArchiveKind) : 'resource';
  let selectedId = '';
  let householdId = '';
  let loadToken = 0;

  const reportStatus = (message: string): void => {
    if (statusEl) statusEl.textContent = message;
    const status = ctx.status;
    try {
      if (typeof status === 'function') status(message);
      else if (status && typeof status.set === 'function') status.set(message);
    } catch {
      // Status reporting must not break the selection UI.
    }
  };

  const emitSelection = (): void => {
    const detail = { kind, id: selectedId || '' };
    try {
      if (typeof ctx.emit === 'function') {
        ctx.emit('parks-archive-source-selected', detail);
      } else {
        root.dispatchEvent(
          new CustomEvent('parks-archive-source-selected', {
            detail,
            bubbles: true,
          }),
        );
      }
    } catch {
      // Event emission must not break the selection UI.
    }
  };

  const resetEntities = (placeholder: string): void => {
    if (!entitySelect) return;
    while (entitySelect.firstChild) entitySelect.removeChild(entitySelect.firstChild);
    const option = doc.createElement('option');
    option.value = '';
    option.textContent = placeholder;
    entitySelect.appendChild(option);
    entitySelect.value = '';
    entitySelect.disabled = true;
    selectedId = '';
  };

  const rowId = (row: unknown): string => {
    if (row == null || typeof row !== 'object') return '';
    const id = (row as Record<string, unknown>).id;
    return id == null ? '' : String(id);
  };

  const rowLabel = (row: unknown, currentKind: ArchiveKind): string => {
    if (row == null || typeof row !== 'object') return '';
    const record = row as Record<string, unknown>;
    const snapshotValue = record.snapshot;
    const snapshot =
      snapshotValue && typeof snapshotValue === 'object' ? (snapshotValue as Record<string, unknown>) : {};
    const id = rowId(row);

    if (currentKind === 'resource' || currentKind === 'program') {
      const label = snapshot.name || snapshot.title || record.name || record.title || id || 'Untitled';
      return String(label);
    }

    if (currentKind === 'booking') {
      const state = record.state != null ? String(record.state) : '';
      const start = record.start != null ? String(record.start) : '';
      const label = [state, start].filter(Boolean).join(' — ');
      return label || id || 'Booking';
    }

    const label = snapshot.name || snapshot.title || record.name || record.title || id || 'Registration';
    return String(label);
  };

  const extractRows = (result: unknown): unknown[] => {
    if (Array.isArray(result)) return result;
    if (result && typeof result === 'object') {
      const record = result as Record<string, unknown>;
      for (const key of ['rows', 'rawRows', 'items']) {
        if (Array.isArray(record[key])) return record[key] as unknown[];
      }
    }
    throw new Error('Invalid row collection');
  };

  const populate = (rows: unknown[], currentKind: ArchiveKind, previous: string): void => {
    if (!entitySelect) return;
    resetEntities('Select a record');
    let foundPrevious = false;

    for (const row of rows) {
      if (row == null || typeof row !== 'object') continue;
      const id = rowId(row);
      if (!id) continue;
      const option = doc.createElement('option');
      option.value = id;
      option.textContent = rowLabel(row, currentKind) || id;
      entitySelect.appendChild(option);
      if (id === previous) foundPrevious = true;
    }

    const hasRows = entitySelect.options.length > 1;
    entitySelect.disabled = !hasRows;

    if (foundPrevious) {
      entitySelect.value = previous;
      selectedId = previous;
    } else {
      entitySelect.value = '';
      selectedId = '';
    }
  };

  const load = async (): Promise<void> => {
    const myToken = ++loadToken;
    const currentKind = kind;
    const previous = selectedId;

    if (currentKind === 'registration' && !householdId) {
      resetEntities('Select a household first');
      reportStatus('Select a household to see registrations.');
      emitSelection();
      return;
    }

    resetEntities(currentKind === 'registration' ? 'Loading registrations…' : 'Loading records…');
    reportStatus('Loading…');

    try {
      const label =
        currentKind === 'resource' || currentKind === 'program'
          ? 'Loading catalog records'
          : currentKind === 'booking'
            ? 'Loading bookings'
            : 'Loading registrations';

      await ctx.run(label, async () => {
        let result: unknown;

        if (currentKind === 'resource' || currentKind === 'program') {
          result = await ctx.call('catalog-list', { kind: currentKind });
        } else if (currentKind === 'booking') {
          result = await ctx.call('bookings-list', {});
        } else {
          result = await ctx.call('household-registrations', { household_id: householdId });
        }

        if (myToken !== loadToken) return;

        const rows = extractRows(result);
        populate(rows, currentKind, previous);
        reportStatus(rows.length ? '' : 'No records found.');
      });

      if (myToken !== loadToken) return;
      emitSelection();
    } catch {
      if (myToken !== loadToken) return;
      resetEntities('Could not load records');
      reportStatus('Could not load records.');
      emitSelection();
    }
  };

  const refresh = (): Promise<void> => load();

  kindSelect?.addEventListener('change', () => {
    const value = kindSelect.value;
    kind = isArchiveKind(value) ? value : 'resource';
    selectedId = '';
    void load();
  });

  entitySelect?.addEventListener('change', () => {
    selectedId = entitySelect.value || '';
    emitSelection();
  });

  refreshButton?.addEventListener('click', () => {
    void refresh();
  });

  root.addEventListener('parks-household-selected', (event: Event) => {
    const detail = (event as CustomEvent<{ id?: unknown }>).detail;
    const nextId = detail && detail.id != null ? String(detail.id) : '';

    if (kind !== 'registration') {
      householdId = nextId;
      return;
    }

    if (nextId === householdId) return;

    householdId = nextId;
    selectedId = '';

    if (!householdId) {
      resetEntities('Select a household first');
      reportStatus('Select a household to see registrations.');
      emitSelection();
      return;
    }

    void load();
  });

  void refresh();
  return refresh;
}
