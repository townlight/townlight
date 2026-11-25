import { bindOccurrences } from './occurrences.ts';
import { validatePair } from './occurrence-dates.ts';

type ResourceRow = Record<string, unknown> & {
  id?: unknown;
  revision?: unknown;
  snapshot?: unknown;
};

type BookingRow = Record<string, unknown> & {
  id?: unknown;
  booking_id?: unknown;
  revision?: unknown;
  status?: unknown;
  state?: unknown;
  resource_id?: unknown;
  household_id?: unknown;
  starts_at?: unknown;
  ends_at?: unknown;
};

interface ReservationsContext {
  call(operation: string, extra?: Record<string, unknown>): Promise<unknown>;
  run(label: string, task: () => Promise<unknown> | unknown): Promise<unknown>;
  status?(message: string, tone?: 'info' | 'success' | 'error'): void;
}

function requireElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function textValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function snapshotString(value: unknown): string {
  if (value === undefined || value === null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resourceLabel(row: ResourceRow): string {
  const snapshot = row.snapshot;
  if (typeof snapshot === 'string' && snapshot) return snapshot;
  if (snapshot && typeof snapshot === 'object') {
    const record = snapshot as Record<string, unknown>;
    for (const key of ['name', 'title', 'label']) {
      const value = record[key];
      if (typeof value === 'string' && value) return value;
    }
  }
  return row.id === undefined || row.id === null ? 'Resource' : String(row.id);
}

function bookingId(row: BookingRow | null): string {
  if (!row) return '';
  const id = row.id ?? row.booking_id;
  return id === undefined || id === null ? '' : String(id);
}

function bookingLabel(row: BookingRow): string {
  const parts: string[] = [];
  const id = bookingId(row);
  if (id) parts.push(id);
  const status = row.status ?? row.state;
  if (status !== undefined && status !== null && status !== '') parts.push(String(status));
  if (row.starts_at !== undefined && row.starts_at !== null && row.starts_at !== '') {
    parts.push(String(row.starts_at));
  }
  return parts.length > 0 ? parts.join(' — ') : 'Booking';
}

export function bindReservations(
  root: HTMLElement,
  ctx: ReservationsContext,
): { refresh: () => Promise<void> } {
  const occurrences = bindOccurrences(root);

  const resourceSelect = requireElement<HTMLSelectElement>(root, '[data-booking-resource]');
  const refreshButton = requireElement<HTMLButtonElement>(root, '[data-booking-refresh]');
  const householdInput = requireElement<HTMLInputElement>(root, '[data-booking-household]');
  const bookingSelect = requireElement<HTMLSelectElement>(root, '[data-booking-list]');
  const bookingDetails = requireElement<HTMLDListElement>(root, '[data-booking-details]');

  const createForm = requireElement<HTMLFormElement>(root, '[data-booking-create]');
  const purposeInput = requireElement<HTMLTextAreaElement>(createForm, '[name="purpose"]');

  const transitionForm = requireElement<HTMLFormElement>(root, '[data-booking-transition]');
  const transitionState = requireElement<HTMLSelectElement>(
    transitionForm,
    '[name="state"]',
  );
  const transitionReason = requireElement<HTMLTextAreaElement>(
    transitionForm,
    '[name="reason"]',
  );

  const rescheduleForm = requireElement<HTMLFormElement>(root, '[data-booking-reschedule]');
  const rescheduleStarts = requireElement<HTMLInputElement>(
    rescheduleForm,
    '[name="starts_at"]',
  );
  const rescheduleEnds = requireElement<HTMLInputElement>(
    rescheduleForm,
    '[name="ends_at"]',
  );
  const rescheduleReason = requireElement<HTMLTextAreaElement>(
    rescheduleForm,
    '[name="reason"]',
  );

  const resourceRows = new Map<string, ResourceRow>();
  let bookingRows: BookingRow[] = [];
  let currentResource: ResourceRow | null = null;
  let currentBooking: BookingRow | null = null;

  function renderBookingDetails(row: BookingRow | null): void {
    const entries: Array<{ field: string; name: string; value: unknown }> = [
      { field: 'booking', name: 'Booking', value: row ? bookingId(row) : 'No booking selected.' },
      { field: 'status', name: 'Status', value: row?.status ?? row?.state },
      { field: 'resource', name: 'Resource', value: row?.resource_id },
      { field: 'household', name: 'Household', value: row?.household_id },
      { field: 'starts_at', name: 'Starts at', value: row?.starts_at },
      { field: 'ends_at', name: 'Ends at', value: row?.ends_at },
    ];

    bookingDetails.replaceChildren();
    for (const entry of entries) {
      const dt = document.createElement('dt');
      dt.textContent = entry.name;
      const dd = document.createElement('dd');
      dd.dataset.bookingField = entry.field;
      dd.textContent = textValue(entry.value);
      bookingDetails.append(dt, dd);
    }
  }

  function notifyBookingSelectionCleared(): void {
    root.dispatchEvent(
      new CustomEvent('parks-booking-selected', { detail: {}, bubbles: true }),
    );
  }

  function updateBookingOption(row: BookingRow): void {
    const id = bookingId(row);
    if (!id) return;
    for (const option of Array.from(bookingSelect.options)) {
      if (option.value === id) {
        option.textContent = bookingLabel(row);
        return;
      }
    }
  }

  function requireSelectedResource(): ResourceRow {
    const id = resourceSelect.value;
    const row =
      currentResource && String(currentResource.id ?? '') === id
        ? currentResource
        : resourceRows.get(id);
    if (!row) throw new Error('Select a resource.');
    if (row.revision === undefined || row.revision === null) {
      throw new Error('Resource revision is unavailable.');
    }
    return row;
  }

  function requireSelectedBooking(): BookingRow {
    if (!currentBooking) throw new Error('Select a booking.');
    return currentBooking;
  }

  async function loadResourcesInternal(): Promise<void> {
    const previous = resourceSelect.value;
    const data = await ctx.call('catalog-list', { kind: 'resource' });
    if (!Array.isArray(data)) throw new Error('Expected resource list.');

    resourceRows.clear();
    const placeholder = new Option('Select a resource', '');
    resourceSelect.replaceChildren(placeholder);

    for (const raw of data) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as ResourceRow;
      const id = row.id === undefined || row.id === null ? '' : String(row.id);
      if (!id) continue;

      resourceRows.set(id, row);
      const option = new Option(resourceLabel(row), id);
      option.dataset.id = id;
      option.dataset.revision =
        row.revision === undefined || row.revision === null ? '' : String(row.revision);
      option.dataset.snapshot = snapshotString(row.snapshot);
      resourceSelect.append(option);
    }

    if (previous && resourceRows.has(previous)) {
      resourceSelect.value = previous;
    } else {
      resourceSelect.value = '';
    }
    currentResource = resourceRows.get(resourceSelect.value) ?? null;
  }

  async function loadBookingsInternal(preserveSelection: boolean): Promise<void> {
    const resourceId = resourceSelect.value;
    const previous = preserveSelection ? bookingSelect.value : '';

    bookingSelect.replaceChildren(new Option('Select a booking', ''));
    bookingRows = [];
    currentBooking = null;
    renderBookingDetails(null);
    notifyBookingSelectionCleared();

    if (!resourceId) return;

    const data = await ctx.call('bookings-list', { resource_id: resourceId });
    if (!Array.isArray(data)) throw new Error('Expected booking list.');

    for (const raw of data) {
      if (!raw || typeof raw !== 'object') continue;
      const row = raw as BookingRow;
      const id = bookingId(row);
      if (!id) continue;

      bookingRows.push(row);
      const option = new Option(bookingLabel(row), id);
      option.dataset.bookingId = id;
      bookingSelect.append(option);
    }

    if (previous && bookingRows.some((row) => bookingId(row) === previous)) {
      bookingSelect.value = previous;
    } else {
      bookingSelect.value = '';
    }
  }

  async function fetchBooking(id: string): Promise<BookingRow> {
    const data = await ctx.call('bookings-get', { booking_id: id });
    if (!data || typeof data !== 'object') throw new Error('Expected booking row.');
    return data as BookingRow;
  }

  async function selectBooking(id: string): Promise<void> {
    if (!id) {
      currentBooking = null;
      renderBookingDetails(null);
      notifyBookingSelectionCleared();
      return;
    }

    const row = await fetchBooking(id);
    currentBooking = row;
    renderBookingDetails(row);
    updateBookingOption(row);
    root.dispatchEvent(
      new CustomEvent('parks-booking-selected', { detail: row, bubbles: true }),
    );
  }

  async function refreshSelectedBooking(): Promise<void> {
    const id = bookingId(currentBooking) || bookingSelect.value;
    if (!id) return;

    const row = await fetchBooking(id);
    currentBooking = row;
    renderBookingDetails(row);
    updateBookingOption(row);
    root.dispatchEvent(
      new CustomEvent('parks-booking-selected', { detail: row, bubbles: true }),
    );
  }

  async function refresh(): Promise<void> {
    await ctx.run('Refresh reservations', async () => {
      await loadResourcesInternal();
      await loadBookingsInternal(true);
    });
  }

  function handleResourceSelected(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== 'object') return;

    const row = detail as ResourceRow;
    const id = row.id === undefined || row.id === null ? '' : String(row.id);
    if (!id) return;

    const existing = resourceRows.get(id);
    const merged: ResourceRow = { ...(existing ?? {}), ...row, id };
    resourceRows.set(id, merged);

    const option = Array.from(resourceSelect.options).find((item) => item.value === id);
    if (option) {
      option.dataset.revision =
        merged.revision === undefined || merged.revision === null
          ? ''
          : String(merged.revision);
      option.dataset.snapshot = snapshotString(merged.snapshot);
      option.textContent = resourceLabel(merged);
    }

    if (resourceSelect.value === id) currentResource = merged;
  }

  function handleHouseholdSelected(event: Event): void {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!detail || typeof detail !== 'object') return;

    const id = (detail as Record<string, unknown>).id;
    if (id === undefined || id === null) return;
    householdInput.value = id === '' ? '' : String(id);
  }

  resourceSelect.addEventListener('change', () => {
    const row = resourceRows.get(resourceSelect.value) ?? null;
    currentResource = row;

    root.dispatchEvent(
      new CustomEvent('parks-resource-selected', { detail: row ?? {}, bubbles: true }),
    );

    void ctx.run('Load bookings', async () => {
      await loadBookingsInternal(false);
    });
  });

  bookingSelect.addEventListener('change', () => {
    const id = bookingSelect.value;
    if (!id) {
      currentBooking = null;
      renderBookingDetails(null);
      notifyBookingSelectionCleared();
      return;
    }

    void ctx.run('Load booking', async () => {
      await selectBooking(id);
    });
  });

  createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void ctx.run('Create reservation', async () => {
      const resource = requireSelectedResource();
      const householdId = householdInput.value.trim();
      if (!householdId) throw new Error('Select a household.');

      const dates = occurrences.read();
      if (dates.length === 0) throw new Error('Preview occurrences before reserving.');

      const payload = {
        resource_id: resource.id,
        household_id: householdId,
        expected_resource_revision: resource.revision,
        occurrences: dates.map((date) => ({
          starts_at: date.starts_at,
          ends_at: date.ends_at,
        })),
        purpose: purposeInput.value.trim(),
      };

      await ctx.call('bookings-create', { payload });
      ctx.status?.('Reservation created.', 'success');
      await loadBookingsInternal(false);
    });
  });

  transitionForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void ctx.run('Update booking state', async () => {
      const booking = requireSelectedBooking();
      const id = bookingId(booking);
      if (!id) throw new Error('Selected booking id is unavailable.');

      const state = transitionState.value;
      if (!state) throw new Error('Select a booking state.');

      const reason = transitionReason.value.trim();
      if (!reason) throw new Error('Enter a reason.');

      const expectedRevision = booking.revision;
      if (expectedRevision === undefined || expectedRevision === null) {
        throw new Error('Booking revision is unavailable.');
      }

      const payload = {
        expected_revision: expectedRevision,
        state,
        reason,
      };

      await ctx.call('bookings-transition', { booking_id: id, payload });
      ctx.status?.('Booking state updated.', 'success');
      await refreshSelectedBooking();
    });
  });

  rescheduleForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void ctx.run('Reschedule booking', async () => {
      const booking = requireSelectedBooking();
      const id = bookingId(booking);
      if (!id) throw new Error('Selected booking id is unavailable.');

      const expectedRevision = booking.revision;
      if (expectedRevision === undefined || expectedRevision === null) {
        throw new Error('Booking revision is unavailable.');
      }

      const dates = validatePair(rescheduleStarts.value, rescheduleEnds.value);
      const reason = rescheduleReason.value.trim();
      if (!reason) throw new Error('Enter a reason.');

      const payload = {
        expected_revision: expectedRevision,
        starts_at: dates.starts_at,
        ends_at: dates.ends_at,
        reason,
      };

      await ctx.call('bookings-reschedule', { booking_id: id, payload });
      ctx.status?.('Booking rescheduled.', 'success');
      await refreshSelectedBooking();
    });
  });

  refreshButton.addEventListener('click', () => {
    void refresh();
  });

  root.addEventListener('parks-resource-selected', handleResourceSelected as EventListener);
  root.addEventListener('parks-household-selected', handleHouseholdSelected as EventListener);

  renderBookingDetails(null);

  return { refresh };
}
