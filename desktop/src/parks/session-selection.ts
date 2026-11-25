type Row = Record<string, unknown>;

export interface SessionSelectionContext {
  call: (operation: string, payload?: Record<string, unknown>) => unknown;
  run: (label: string, task: () => unknown) => unknown;
}

export interface SessionSelectionController {
  refresh: (preferredSessionId?: string | null) => Promise<void>;
  getSelected: () => Row | null;
}

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null;
}

function rowId(value: unknown): string {
  if (!isRecord(value)) {
    return '';
  }
  const id = value.id ?? value.session_id ?? value.program_id;
  return id == null ? '' : String(id);
}

export function bindSessionSelection(
  root: HTMLElement | Document | DocumentFragment,
  ctx: SessionSelectionContext,
): SessionSelectionController {
  const doc = root instanceof Document ? root : (root.ownerDocument ?? document);
  const programSelect = root.querySelector<HTMLSelectElement>('[data-session-program]');
  const sessionSelect = root.querySelector<HTMLSelectElement>('[data-session-list]');
  const editForm = root.querySelector<HTMLFormElement>('[data-session-edit]');

  if (!programSelect || !sessionSelect) {
    throw new Error('Session selection controls are missing');
  }

  let selectedSession: Row | null = null;
  let programsLoaded = false;
  let requestSequence = 0;
  const programTitles = new Map<string, string>();

  function createOption(value: string, label: string): HTMLOptionElement {
    const option = doc.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function emitSelected(detail: Row | { id: string }): void {
    root.dispatchEvent(
      new CustomEvent('parks-session-selected', {
        detail,
        bubbles: true,
      }),
    );
  }

  function setEditValue(name: string, value: unknown): void {
    const field = editForm?.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${name}"]`,
    );
    if (!field) {
      return;
    }
    const next = value == null ? '' : String(value);
    if (field instanceof HTMLSelectElement) {
      field.value = next;
      if (field.value !== next) {
        field.value = '';
      }
    } else {
      field.value = next;
    }
  }

  function clearEditForm(): void {
    setEditValue('capacity', '');
    setEditValue('state', '');
    setEditValue('starts_at', '');
    setEditValue('ends_at', '');
  }

  function populateEditForm(row: Row): void {
    setEditValue('capacity', row.capacity);
    setEditValue('state', row.state);
    setEditValue('starts_at', row.starts_at);
    setEditValue('ends_at', row.ends_at);
  }

  function resetSessionList(): void {
    sessionSelect.replaceChildren(createOption('', 'Select a session'));
    sessionSelect.value = '';
  }

  async function loadPrograms(): Promise<void> {
    if (programsLoaded) {
      return;
    }

    const result = await ctx.call('catalog-list', { kind: 'program' });
    if (!Array.isArray(result)) {
      throw new Error('catalog-list returned a non-array response');
    }

    const previousProgramId = programSelect.value;
    const options: HTMLOptionElement[] = [createOption('', 'Select a program')];

    for (const item of result) {
      if (!isRecord(item)) {
        continue;
      }
      const id = rowId(item);
      if (!id) {
        continue;
      }
      const titleValue = item.title == null ? '' : String(item.title);
      const title = titleValue || id;
      programTitles.set(id, title);
      options.push(createOption(id, title));
    }

    programSelect.replaceChildren(...options);
    programSelect.value = previousProgramId && programTitles.has(previousProgramId)
      ? previousProgramId
      : '';
    programsLoaded = true;
  }

  async function loadSessionDetail(
    sessionId: string,
    programId: string,
    sequence: number,
  ): Promise<void> {
    const result = await ctx.call('sessions-get', { session_id: sessionId });
    if (
      sequence !== requestSequence ||
      programSelect.value !== programId ||
      sessionSelect.value !== sessionId
    ) {
      return;
    }
    if (!isRecord(result)) {
      throw new Error('sessions-get returned a non-object response');
    }

    selectedSession = result;
    populateEditForm(result);
    emitSelected(result);
  }

  async function loadSessions(
    programId: string,
    preferredSessionId: string | null,
  ): Promise<void> {
    const sequence = ++requestSequence;
    const listedSessionId = sessionSelect.value;
    const result = await ctx.call('sessions-list', { program_id: programId });

    if (sequence !== requestSequence || programSelect.value !== programId) {
      return;
    }
    if (!Array.isArray(result)) {
      throw new Error('sessions-list returned a non-array response');
    }

    const rows = result.filter(isRecord);
    const options: HTMLOptionElement[] = [createOption('', 'Select a session')];

    for (const row of rows) {
      const id = rowId(row);
      if (!id) {
        continue;
      }
      const titleValue = row.title == null ? '' : String(row.title);
      const startsAtValue = row.starts_at == null ? '' : String(row.starts_at);
      options.push(createOption(id, titleValue || startsAtValue || id));
    }

    sessionSelect.replaceChildren(...options);

    const selectedId = selectedSession ? rowId(selectedSession) : '';
    const has = (id: string): boolean => id !== '' && rows.some((row) => rowId(row) === id);

    let targetId = '';
    if (preferredSessionId && has(preferredSessionId)) {
      targetId = preferredSessionId;
    } else if (has(selectedId)) {
      targetId = selectedId;
    } else if (has(listedSessionId)) {
      targetId = listedSessionId;
    }

    if (!targetId) {
      const hadSelection = selectedSession !== null || listedSessionId !== '';
      selectedSession = null;
      sessionSelect.value = '';
      clearEditForm();
      if (hadSelection) {
        emitSelected({ id: '' });
      }
      return;
    }

    sessionSelect.value = targetId;
    await loadSessionDetail(targetId, programId, sequence);
  }

  async function refresh(preferredSessionId: string | null = null): Promise<void> {
    await ctx.run('Refresh sessions', async () => {
      await loadPrograms();
      const programId = programSelect.value;

      if (!programId) {
        const hadSelection = selectedSession !== null || sessionSelect.value !== '';
        selectedSession = null;
        resetSessionList();
        clearEditForm();
        if (hadSelection) {
          emitSelected({ id: '' });
        }
        return;
      }

      await loadSessions(programId, preferredSessionId || null);
    });
  }

  function handleProgramChange(): void {
    requestSequence += 1;
    const programId = programSelect.value;

    selectedSession = null;
    resetSessionList();
    clearEditForm();
    emitSelected({ id: '' });

    if (!programId) {
      return;
    }

    void ctx.run('Load sessions', () => loadSessions(programId, null));
  }

  function handleSessionChange(): void {
    const programId = programSelect.value;
    const sessionId = sessionSelect.value;

    if (!sessionId) {
      const hadSelection = selectedSession !== null;
      selectedSession = null;
      sessionSelect.value = '';
      clearEditForm();
      if (hadSelection) {
        emitSelected({ id: '' });
      }
      return;
    }

    const sequence = ++requestSequence;
    void ctx.run('Load session', async () => {
      const result = await ctx.call('sessions-get', { session_id: sessionId });
      if (
        sequence !== requestSequence ||
        programSelect.value !== programId ||
        sessionSelect.value !== sessionId
      ) {
        return;
      }
      if (!isRecord(result)) {
        throw new Error('sessions-get returned a non-object response');
      }

      selectedSession = result;
      populateEditForm(result);
      emitSelected(result);
    });
  }

  programSelect.addEventListener('change', handleProgramChange);
  sessionSelect.addEventListener('change', handleSessionChange);

  root
    .querySelector<HTMLButtonElement>('[data-session-refresh]')
    ?.addEventListener('click', () => {
      void refresh();
    });

  root.addEventListener('parks-session-refresh', (event) => {
    const detail = (event as CustomEvent<{ id?: unknown }>).detail;
    const preferredId =
      detail && typeof detail.id === 'string' && detail.id !== '' ? detail.id : null;
    void refresh(preferredId);
  });

  return {
    refresh,
    getSelected: () => selectedSession,
  };
}
