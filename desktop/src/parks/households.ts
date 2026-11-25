type HouseholdRow = {
  id: string;
  snapshot: unknown;
};

type HouseholdContext = {
  call: (op: string, extra?: Record<string, unknown>) => Promise<any>;
  run: (task: () => Promise<void>) => Promise<void>;
  status: (message: string) => void;
};

function snapshotText(snapshot: unknown, key: string): string {
  if (!snapshot || typeof snapshot !== 'object') {
    return '';
  }

  const value = (snapshot as Record<string, unknown>)[key];
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return '';
}

function formText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function bindHouseholds(
  root: HTMLElement,
  ctx: HouseholdContext,
): { refresh: () => Promise<void> } {
  const searchForm = root.querySelector<HTMLFormElement>('form[data-household-search]');
  const searchInput = searchForm?.querySelector<HTMLInputElement>('input[name="search"]');
  const list = root.querySelector<HTMLSelectElement>('select[data-household-list]');
  const createForm = root.querySelector<HTMLFormElement>('form[data-household-create]');

  if (!searchForm || !searchInput || !list || !createForm) {
    throw new Error('Household controls not found');
  }

  const doc = root.ownerDocument;
  const rows = new Map<string, HouseholdRow>();
  const optionById = new Map<string, HTMLOptionElement>();
  let lastSearch = '';

  function emitSelected(id: string): void {
    root.dispatchEvent(
      new CustomEvent('parks-household-selected', {
        detail: { id },
        bubbles: true,
      }),
    );
  }

  function labelFor(row: HouseholdRow): string {
    const name = snapshotText(row.snapshot, 'contact_name');
    const email = snapshotText(row.snapshot, 'email');

    if (name && email) {
      return `${name} — ${email}`;
    }
    return name || email || `Household ${row.id}`;
  }

  function resetOptions(): void {
    optionById.clear();
    const placeholder = doc.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a household';
    list.replaceChildren(placeholder);
  }

  function addOption(row: HouseholdRow): void {
    let option = optionById.get(row.id);
    if (!option) {
      option = doc.createElement('option');
      option.value = row.id;
      optionById.set(row.id, option);
      list.appendChild(option);
    }
    option.textContent = labelFor(row);
  }

  async function search(term: string): Promise<void> {
    ctx.status('Searching households…');
    const found = await ctx.call('households-search', { search: term });
    if (!Array.isArray(found)) {
      throw new Error('Unexpected households-search response: expected an array.');
    }
    const results: unknown[] = found;

    rows.clear();
    resetOptions();

    for (const item of results) {
      if (!item || typeof item !== 'object') {
        throw new Error('Malformed households-search result: expected an object row.');
      }

      const record = item as Record<string, unknown>;
      const id = String(record.id ?? '').trim();
      if (!id) {
        throw new Error('Malformed households-search result: missing household id.');
      }

      const row: HouseholdRow = { id, snapshot: record.snapshot };
      rows.set(id, row);
      addOption(row);
    }

    lastSearch = term;
    ctx.status(
      results.length === 0
        ? 'No households found.'
        : `Found ${results.length} household${results.length === 1 ? '' : 's'}.`,
    );
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = searchInput.value.trim();

    if (!term) {
      ctx.status('Enter a search term.');
      return;
    }

    void ctx.run(async () => {
      await search(term);
    });
  });

  list.addEventListener('change', () => {
    if (list.value) {
      emitSelected(list.value);
    }
  });

  createForm.addEventListener('submit', (event) => {
    event.preventDefault();

    void ctx.run(async () => {
      const phone = formText(createForm, 'phone');
      const address = formText(createForm, 'address');

      const fields = {
        contact_name: formText(createForm, 'contact_name'),
        email: formText(createForm, 'email'),
        phone: phone || null,
        address: address || null,
        language: formText(createForm, 'language') || 'en',
      };

      ctx.status('Creating household…');
      const created = await ctx.call('households-create', {
        payload: { payload: fields },
      });

      const id = String(created?.id ?? '').trim();
      const snapshot = created?.snapshot ?? {};

      if (!id) {
        ctx.status('Household creation failed.');
        return;
      }

      const row: HouseholdRow = { id, snapshot };
      rows.set(id, row);
      addOption(row);
      list.value = id;
      emitSelected(id);

      createForm.reset();
      ctx.status(`Household ${id} created.`);
    });
  });

  return {
    refresh: () =>
      ctx.run(async () => {
        if (!lastSearch) {
          return;
        }
        await search(lastSearch);
      }),
  };
}
