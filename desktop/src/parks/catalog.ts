import { renderCatalog } from './catalog-render.ts';
import {
  resourcePayload,
  programPayload,
  fillResource,
  fillProgram,
  addHours,
} from './catalog-values.ts';

export { renderCatalog };

export interface CatalogContext {
  call: (op: string, extra?: Record<string, unknown>) => Promise<any>;
  run: (asyncfn: () => Promise<void>) => Promise<void>;
  status: (message: string) => void;
}

type CatalogKind = 'resource' | 'program';

function getRows(result: any): any[] {
  if (!Array.isArray(result)) {
    throw new Error('Unexpected catalog-list response: expected an array.');
  }
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function bindCatalog(
  root: HTMLElement,
  ctx: CatalogContext,
): { refresh: () => Promise<void> } {
  const resourceList = root.querySelector<HTMLSelectElement>('[data-resource-list]');
  const programList = root.querySelector<HTMLSelectElement>('[data-program-list]');
  const resourceForm = root.querySelector<HTMLFormElement>('[data-resource]');
  const programForm = root.querySelector<HTMLFormElement>('[data-program]');
  const refreshButton = root.querySelector<HTMLButtonElement>('[data-catalog-refresh]');
  const newResourceButton = root.querySelector<HTMLButtonElement>('[data-new-resource]');
  const newProgramButton = root.querySelector<HTMLButtonElement>('[data-new-program]');

  if (!resourceList || !programList || !resourceForm || !programForm) {
    throw new Error('Catalog markup is missing required list or form elements.');
  }

  const loadedRecords: Record<CatalogKind, Map<string, any>> = {
    resource: new Map<string, any>(),
    program: new Map<string, any>(),
  };
  const selectedRows: Record<CatalogKind, any | null> = {
    resource: null,
    program: null,
  };

  function populateList(
    select: HTMLSelectElement,
    kind: CatalogKind,
    result: any,
  ): void {
    const map = loadedRecords[kind];
    map.clear();
    select.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = kind === 'resource' ? 'Select a resource' : 'Select a program';
    select.appendChild(placeholder);

    for (const row of getRows(result)) {
      const id = row?.id;
      if (id === null || id === undefined) continue;

      const value = String(id);
      map.set(value, row);

      const option = document.createElement('option');
      option.value = value;
      const snapshot = row.snapshot;
      const label = kind === 'resource' ? snapshot?.name : snapshot?.title;
      option.textContent = label ? String(label) : value;
      select.appendChild(option);
    }

    if (selectedRows[kind]) {
      const selectedId = selectedRows[kind]?.id;
      if (selectedId !== null && selectedId !== undefined && map.has(String(selectedId))) {
        const nextRow = map.get(String(selectedId));
        selectedRows[kind] = nextRow;
        select.value = String(selectedId);
        if (kind === 'resource') {
          fillResource(resourceForm, nextRow.snapshot);
        } else {
          fillProgram(programForm, nextRow.snapshot);
        }
      } else {
        selectedRows[kind] = null;
        select.value = '';
      }
    } else {
      select.value = '';
    }
  }

  async function refresh(): Promise<void> {
    const resourceResult = await ctx.call('catalog-list', { kind: 'resource' });
    const programResult = await ctx.call('catalog-list', { kind: 'program' });
    populateList(resourceList, 'resource', resourceResult);
    populateList(programList, 'program', programResult);
  }

  resourceList.addEventListener('change', () => {
    const row = loadedRecords.resource.get(resourceList.value) ?? null;
    selectedRows.resource = row;
    if (row) fillResource(resourceForm, row.snapshot);
  });

  programList.addEventListener('change', () => {
    const row = loadedRecords.program.get(programList.value) ?? null;
    selectedRows.program = row;
    if (row) fillProgram(programForm, row.snapshot);
  });

  function resetResourceForm(): void {
    selectedRows.resource = null;
    resourceList.value = '';
    resourceForm.reset();
    fillResource(resourceForm, {
      name: '',
      address: '',
      timezone: 'America/Denver',
      description: '',
      amenities: [],
      accessibility: '',
      public: false,
      approval_required: false,
      buffer_before_minutes: 0,
      buffer_after_minutes: 0,
      fee_cents: 0,
      deposit_cents: 0,
      currency: 'USD',
      hours: {},
    });
    ctx.status('New resource ready.');
  }

  function resetProgramForm(): void {
    selectedRows.program = null;
    programList.value = '';
    programForm.reset();
    fillProgram(programForm, {
      title: '',
      description: '',
      timezone: 'America/Denver',
      public: false,
      min_age: null,
      max_age: null,
      eligibility_text: '',
      accessibility: '',
    });
    ctx.status('New program ready.');
  }

  async function saveResource(): Promise<void> {
    const payload = resourcePayload(resourceForm);
    const row = selectedRows.resource;

    if (row && row.id !== null && row.id !== undefined) {
      await ctx.call('catalog-update', {
        kind: 'resource',
        id: row.id,
        payload: {
          expected_revision: row.revision,
          payload,
        },
      });
    } else {
      await ctx.call('catalog-create', {
        kind: 'resource',
        payload: { payload },
      });
    }

    await refresh();
    ctx.status('Resource saved.');
  }

  async function saveProgram(): Promise<void> {
    const payload = programPayload(programForm);
    const row = selectedRows.program;

    if (row && row.id !== null && row.id !== undefined) {
      await ctx.call('catalog-update', {
        kind: 'program',
        id: row.id,
        payload: {
          expected_revision: row.revision,
          payload,
        },
      });
    } else {
      await ctx.call('catalog-create', {
        kind: 'program',
        payload: { payload },
      });
    }

    await refresh();
    ctx.status('Program saved.');
  }

  resourceForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void ctx.run(async () => {
      try {
        await saveResource();
      } catch (error) {
        ctx.status(errorMessage(error));
      }
    });
  });

  programForm.addEventListener('submit', (event) => {
    event.preventDefault();
    void ctx.run(async () => {
      try {
        await saveProgram();
      } catch (error) {
        ctx.status(errorMessage(error));
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-add-hours]').forEach((button) => {
    button.addEventListener('click', () => {
      const day = button.dataset.addHours;
      if (day) addHours(resourceForm, day);
    });
  });

  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      void ctx.run(async () => {
        try {
          await refresh();
          ctx.status('Catalog loaded.');
        } catch (error) {
          ctx.status(errorMessage(error));
        }
      });
    });
  }

  if (newResourceButton) {
    newResourceButton.addEventListener('click', resetResourceForm);
  }

  if (newProgramButton) {
    newProgramButton.addEventListener('click', resetProgramForm);
  }

  return { refresh };
}
