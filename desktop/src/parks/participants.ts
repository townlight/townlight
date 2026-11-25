export type ParticipantRow = {
  id: string;
  revision: number | string;
  snapshot: {
    name?: string;
    birth_date?: string;
    accommodations?: string;
  };
};

export type ParticipantContext = {
  call: (op: string, extra?: Record<string, unknown>) => Promise<any>;
  run: (fn: () => Promise<void>) => Promise<void>;
  status: (text: string) => void;
};

export function bindParticipants(root: HTMLElement, ctx: ParticipantContext): void {
  const selectElement = root.querySelector<HTMLSelectElement>('[data-participant-list]');
  const formElement = root.querySelector<HTMLFormElement>('[data-participant]');
  const newButtonElement = root.querySelector<HTMLButtonElement>('[data-new-participant]');

  if (!selectElement || !formElement || !newButtonElement) {
    return;
  }

  const select = selectElement;
  const form = formElement;
  const newButton = newButtonElement;

  let householdId = '';
  let rows: ParticipantRow[] = [];
  let selectedRow: ParticipantRow | null = null;

  function getField(
    fieldName: 'name' | 'birth_date' | 'accommodations',
  ): HTMLInputElement | HTMLTextAreaElement | null {
    const field = form.elements.namedItem(fieldName);
    return field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement ? field : null;
  }

  function setFieldValue(fieldName: 'name' | 'birth_date' | 'accommodations', value: string): void {
    const field = getField(fieldName);
    if (field) {
      field.value = value;
    }
  }

  function readFieldValue(fieldName: 'name' | 'birth_date' | 'accommodations'): string {
    const field = getField(fieldName);
    return field ? field.value : '';
  }

  function readSnapshot(): { name: string; birth_date: string; accommodations: string } {
    return {
      name: readFieldValue('name'),
      birth_date: readFieldValue('birth_date'),
      accommodations: readFieldValue('accommodations'),
    };
  }

  function resetParticipantForm(): void {
    selectedRow = null;
    select.value = '';
    form.reset();
    setFieldValue('name', '');
    setFieldValue('birth_date', '');
    setFieldValue('accommodations', '');
    emitParticipantSelected('');
  }

  function fillParticipantForm(row: ParticipantRow): void {
    selectedRow = row;
    select.value = row.id;

    const snapshot = row.snapshot;
    setFieldValue('name', snapshot && typeof snapshot.name === 'string' ? snapshot.name : '');
    setFieldValue(
      'birth_date',
      snapshot && typeof snapshot.birth_date === 'string' ? snapshot.birth_date : '',
    );
    setFieldValue(
      'accommodations',
      snapshot && typeof snapshot.accommodations === 'string' ? snapshot.accommodations : '',
    );
  }

  function fillParticipantSelect(): void {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a participant';
    select.appendChild(placeholder);

    for (const row of rows) {
      if (!row || typeof row.id !== 'string') {
        continue;
      }

      const option = document.createElement('option');
      option.value = row.id;
      const name = row.snapshot && typeof row.snapshot.name === 'string' ? row.snapshot.name : '';
      option.textContent = name || row.id;
      select.appendChild(option);
    }
  }

  function emitParticipantSelected(id: string): void {
    root.dispatchEvent(
      new CustomEvent('parks-participant-selected', {
        detail: { id, household_id: householdId },
        bubbles: true,
      }),
    );
  }

  async function loadParticipants(): Promise<void> {
    const currentHouseholdId = householdId;

    if (!currentHouseholdId) {
      rows = [];
      resetParticipantForm();
      fillParticipantSelect();
      return;
    }

    const result = await ctx.call('list-participants', { household_id: currentHouseholdId });

    if (householdId !== currentHouseholdId) {
      return;
    }

    if (!Array.isArray(result)) {
      throw new Error('list-participants returned an invalid response.');
    }

    rows = result as ParticipantRow[];
    fillParticipantSelect();
    resetParticipantForm();
  }

  function handleHouseholdSelected(event: Event): void {
    const detail = (event as CustomEvent<{ id?: unknown }>).detail;
    const id = detail && typeof detail.id === 'string' ? detail.id : '';

    if (!id) {
      return;
    }

    householdId = id;
    rows = [];
    resetParticipantForm();
    fillParticipantSelect();

    void ctx.run(async () => {
      await loadParticipants();
    });
  }

  select.addEventListener('change', () => {
    const id = select.value;

    if (!id) {
      resetParticipantForm();
      return;
    }

    const row = rows.find((candidate) => candidate && candidate.id === id);

    if (!row) {
      resetParticipantForm();
      return;
    }

    fillParticipantForm(row);
    emitParticipantSelected(row.id);
  });

  newButton.addEventListener('click', () => {
    resetParticipantForm();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!householdId) {
      ctx.status('Select a household first.');
      return;
    }

    const snapshot = readSnapshot();

    if (selectedRow) {
      const row = selectedRow;

      if (row.revision === undefined || row.revision === null) {
        ctx.status('Select a participant to edit.');
        return;
      }

      const id = row.id;
      const revision = row.revision;

      void ctx.run(async () => {
        await ctx.call('edit-participant', {
          id,
          payload: {
            expected_revision: revision,
            payload: snapshot,
          },
        });
        await loadParticipants();
      });
      return;
    }

    void ctx.run(async () => {
      const created = await ctx.call('create-participant', {
        payload: {
          household_id: householdId,
          payload: snapshot,
        },
      });

      const createdId =
        created && typeof created === 'object' && typeof (created as { id?: unknown }).id === 'string'
          ? (created as { id: string }).id
          : '';

      await loadParticipants();

      if (createdId) {
        emitParticipantSelected(createdId);
      }
    });
  });

  root.addEventListener('parks-household-selected', handleHouseholdSelected as EventListener);
}
