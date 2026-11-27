export function createLibraryView(invoke: any, options: any = {}) {
  let current: any = null;
  let latestRevision = 0;
  let root: HTMLElement | null = null;
  let generation = 0;
  let ac: AbortController | null = null;

  const setStatus = (message: string) => {
    const el = root?.querySelector('[data-library-status]');
    if (el) el.textContent = message;
  };
  const unwrap = (res: any) => (res && res.result !== undefined ? res.result : res);
  const isAdmin = () => options?.isAdmin === true;
  const syncAdminControls = () => {
    const stale = !!current && Number(current.revision) !== Number(latestRevision);
    const button = root?.querySelector('[data-library-approve]') as HTMLButtonElement | null;
    if (button) {
      const allowed = isAdmin();
      button.hidden = !allowed;
      button.disabled = !allowed || stale;
    }
    const handoffButton = root?.querySelector('[data-library-comms]') as HTMLButtonElement | null;
    if (handoffButton) handoffButton.disabled = stale;
    const form = root?.querySelector('[data-library-form]') as HTMLFormElement | null;
    if (form) {
      form.querySelectorAll('input, textarea').forEach((el) => {
        (el as HTMLInputElement | HTMLTextAreaElement).disabled = stale;
      });
      const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submit) submit.disabled = stale;
    }
  };
  const extractArticleId = (links: any): string | null => {
    if (!links) return null;
    if (Array.isArray(links)) {
      for (const entry of links) {
        const value = entry?.article_id ?? entry?.articleId;
        if (value) return String(value);
      }
      return null;
    }
    if (typeof links === 'object') {
      const value = links.article_id ?? links.articleId;
      if (value) return String(value);
    }
    return null;
  };

  const toLocalInput = (value: any) => {
    const date = new Date(String(value ?? ''));
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };
  const clearForm = () => {
    const form = root?.querySelector('[data-library-form]') as HTMLFormElement | null;
    form?.reset();
    if (form) {
      delete form.dataset.currentId;
      delete form.dataset.currentRevision;
    }
    const confirm = root?.querySelector('[data-library-confirm]') as HTMLInputElement | null;
    if (confirm) confirm.checked = false;
    const links = root?.querySelector('[data-library-links]');
    if (links) links.textContent = '';
    const history = root?.querySelector('[data-library-history]') as HTMLSelectElement | null;
    if (history) history.replaceChildren();
    const preview = root?.querySelector('[data-library-public-preview]');
    if (preview) preview.textContent = '';
  };
  const fillCurrent = () => {
    const form = root?.querySelector('[data-library-form]') as HTMLFormElement | null;
    if (!form || !current) return;
    const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
    field('title')!.value = String(current.content?.title ?? '');
    field('starts_at')!.value = toLocalInput(current.content?.starts_at);
    field('location')!.value = String(current.content?.location ?? '');
    field('description')!.value = String(current.content?.description ?? '');
    field('private_notes')!.value = String(current.private_notes ?? '');
    const confirm = root?.querySelector('[data-library-confirm]') as HTMLInputElement | null;
    if (confirm) confirm.checked = false;
    form.dataset.currentId = String(current.id ?? '');
    form.dataset.currentRevision = String(current.revision ?? '');
  };
  const renderPublicPreview = () => {
    const preview = root?.querySelector('[data-library-public-preview]');
    if (!preview) return;
    if (!current) {
      preview.textContent = '';
      return;
    }
    const publicContent = { ...(current.content ?? {}) };
    delete publicContent.private_notes;
    preview.textContent = JSON.stringify({ ...publicContent, revision: current.revision, hash: current.hash ?? current.sha256, approval: current.approval }, null, 2);
  };
  let busy = false;
  const save = async () => {
    if (busy || !root) return;
    if (current && Number(current.revision) !== Number(latestRevision)) return;
    const form = root.querySelector('[data-library-form]') as HTMLFormElement | null;
    if (!form) return;
    const g = generation;
    const data = new FormData(form);
    const payload = {
      title: String(data.get('title') ?? ''),
      starts_at: new Date(String(data.get('starts_at') ?? '')).toISOString(),
      location: String(data.get('location') ?? ''),
      description: String(data.get('description') ?? ''),
      private_notes: String(data.get('private_notes') ?? ''),
    };
    const id = form.dataset.currentId;
    const revision = Number(form.dataset.currentRevision || 0);
    const controls = Array.from(form.querySelectorAll('input, textarea, button')) as HTMLButtonElement[];
    busy = true;
    controls.forEach((control) => (control.disabled = true));
    try {
      const request = id
        ? { operation: 'edit', id, payload: { expected_revision: revision, ...payload } }
        : { operation: 'create', payload: { ...payload } };
      const res = await invoke('library_request', { request });
      if (g !== generation) return;
      const saved = unwrap(res);
      const savedId = String(saved?.id ?? saved?.item?.id ?? id ?? '');
      await loadList(savedId);
      if (g !== generation) return;
      setStatus('Saved');
    } catch (error: any) {
      if (g === generation) setStatus(error?.message ? String(error.message) : 'Save failed');
    } finally {
      if (g === generation) {
        controls.forEach((control) => (control.disabled = false));
        busy = false;
      }
    }
  };

  const approve = async () => {
    if (!root || !current) return;
    if (Number(current.revision) !== Number(latestRevision)) return;
    if (!isAdmin()) return;
    const checkbox = root.querySelector('[data-library-confirm]') as HTMLInputElement | null;
    if (!checkbox?.checked) {
      setStatus('Confirm approval first');
      return;
    }
    const g = generation;
    const id = String(current.id);
    try {
      const res = await invoke('library_request', {
        request: {
          operation: 'approve',
          id,
          payload: {
            expected_revision: current.revision,
            expected_sha256: current.sha256,
            confirm: true,
          },
        },
      });
      if (g !== generation) return;
      unwrap(res);
      await loadCurrent(id);
      if (g !== generation) return;
      setStatus('Approved');
    } catch (error: any) {
      if (g === generation) setStatus(error?.message ? String(error.message) : 'Approval failed');
    }
  };

  const handoff = async () => {
    if (!root || !current) return;
    if (Number(current.revision) !== Number(latestRevision)) return;
    const g = generation;
    const id = String(current.id);
    const currentRevision = Number(current.revision);
    try {
      const res = await invoke('library_request', { request: { operation: 'source', id } });
      if (g !== generation) return;
      const source = unwrap(res);
      if (!source) return;
      const content = source.content ?? {};
      const body = [
        String(content.title ?? ''),
        String(content.starts_at ?? ''),
        String(content.location ?? ''),
        '',
        String(content.description ?? ''),
      ].join('\n');
      const seed: any = {
        kind: 'library',
        id: String(source.id ?? id),
        title: String(content.title ?? ''),
        body,
      };
      let articleId = extractArticleId(source.links);
      if (!articleId) {
        const startRevision = Number(source.revision ?? currentRevision);
        for (let rev = startRevision - 1; rev >= 1; rev -= 1) {
          const previous = await invoke('library_request', { request: { operation: 'get', id, revision: rev } });
          if (g !== generation) return;
          articleId = extractArticleId(unwrap(previous)?.links);
          if (articleId) break;
        }
      }
      if (articleId) seed.article_id = articleId;
      if (typeof options?.openCommunications === 'function') {
        options.openCommunications(seed);
      }
    } catch (error: any) {
      if (g === generation) setStatus(error?.message ? String(error.message) : 'Handoff failed');
    }
  };

  const linkReceipt = async () => {
    if (!root || !current) return;
    const form = root.querySelector('[data-library-receipts]') as HTMLFormElement | null;
    if (!form) return;
    const g = generation;
    const data = new FormData(form);
    const id = String(current.id);
    const selectedRevision = Number(current.revision);
    try {
      const res = await invoke('library_request', {
        request: {
          operation: 'receipts',
          id,
          payload: {
            source_revision: selectedRevision,
            article_id: String(data.get('article_id') ?? ''),
            article_revision: Number(data.get('article_revision')),
          },
        },
      });
      if (g !== generation) return;
      unwrap(res);
      await loadCurrent(id, selectedRevision);
      if (g !== generation) return;
      setStatus('Linked');
    } catch (error: any) {
      if (g === generation) setStatus(error?.message ? String(error.message) : 'Link failed');
    }
  };

  const loadCurrent = async (id: string, revision?: number) => {
    const g = generation;
    try {
      const request: any = { operation: 'get', id };
      if (revision) request.revision = revision;
      const res = await invoke('library_request', { request });
      if (g !== generation) return;
      current = unwrap(res) ?? null;
      if (!revision) latestRevision = Number(current?.revision ?? 0);
      fillCurrent();
      renderPublicPreview();
      const links = root?.querySelector('[data-library-links]');
      if (links) links.textContent = JSON.stringify(current?.links ?? [], null, 2);
      const history = root?.querySelector('[data-library-history]') as HTMLSelectElement | null;
      if (history) {
        history.replaceChildren();
        for (let rev = 1; rev <= latestRevision; rev += 1) {
          const option = document.createElement('option');
          option.value = String(rev);
          option.textContent = String(rev);
          if (current && Number(current.revision) === rev) option.selected = true;
          history.appendChild(option);
        }
      }
      syncAdminControls();
    } catch {
      if (g === generation) setStatus('Failed to load record');
    }
  };

  const loadList = async (preferredId?: string) => {
    const g = generation;
    setStatus('Loading…');
    try {
      const res = await invoke('library_request', { request: { operation: 'list' } });
      if (g !== generation) return;
      const data = unwrap(res);
      const items = Array.isArray(data) ? data : data?.items ?? [];
      const select = root?.querySelector('[data-library-list]') as HTMLSelectElement | null;
      if (!select) return;
      select.replaceChildren();
      for (const item of items) {
        const option = document.createElement('option');
        option.value = String(item.id);
        option.textContent = String(item.title ?? item.name ?? item.id);
        select.appendChild(option);
      }
      if (!items.length) {
        current = null;
        clearForm();
        syncAdminControls();
        setStatus('No records');
        return;
      }
      const chosen = preferredId && items.some((item: any) => String(item.id) === String(preferredId))
        ? String(preferredId)
        : String(items[0].id);
      select.value = chosen;
      setStatus('');
      await loadCurrent(chosen);
      if (g !== generation) return;
      syncAdminControls();
    } catch {
      if (g === generation) setStatus('Failed to load library');
    }
  };

  const render = () =>
    '<section data-townlight-library><h2>Library</h2><button data-library-refresh>Refresh</button>' +
    '<label>Choose program <select data-library-list></select></label>' +
    '<label>History <select data-library-history></select></label>' +
    '<form data-library-form>' +
    '<label>Title <input name="title" required></label>' +
    '<label>Starts at <input name="starts_at" type="datetime-local" required></label>' +
    '<label>Location <input name="location" required></label>' +
    '<label>Description <textarea name="description" required></textarea></label>' +
    '<label>Private staff notes <textarea name="private_notes"></textarea></label>' +
    '<button type="button" data-library-new>New program</button>' +
    '<button type="submit">Save</button>' +
    '</form>' +
    '<form data-library-receipts>' +
    '<label>Article ID <input name="article_id" type="text" required></label>' +
    '<label>Article revision <input name="article_revision" type="number" min="1" step="1" required></label>' +
    '<button type="submit">Link verified publication</button>' +
    '</form>' +
    '<pre data-library-links></pre>' +
    '<label><input type="checkbox" data-library-confirm> Approve this exact source revision</label>' +
    '<button type="button" data-library-approve>Approve</button>' +
    '<button type="button" data-library-comms>Open approved source in Communications</button>' +
    '<pre data-library-public-preview></pre><p role="status" data-library-status></p></section>';

  const bind = async (parent: ParentNode | HTMLElement = document) => {
    ac?.abort();
    ac = new AbortController();
    const { signal } = ac;
    const section = (parent as HTMLElement).matches?.('section[data-townlight-library]')
      ? (parent as HTMLElement)
      : (parent.querySelector('section[data-townlight-library]') as HTMLElement | null);
    if (!section) return;
    root = section;
    section.querySelector('[data-library-refresh]')?.addEventListener('click', () => void loadList(), { signal });
    section.querySelector('[data-library-list]')?.addEventListener('change', (event) => {
      const id = (event.target as HTMLSelectElement).value;
      if (id) void loadCurrent(id);
    }, { signal });
    section.querySelector('[data-library-history]')?.addEventListener('change', (event) => {
      if (current) void loadCurrent(String(current.id), Number((event.target as HTMLSelectElement).value));
    }, { signal });
    section.querySelector('[data-library-new]')?.addEventListener('click', () => {
      current = null;
      latestRevision = 0;
      clearForm();
      syncAdminControls();
      setStatus('');
    }, { signal });
    section.querySelector('[data-library-form]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void save();
    }, { signal });
    section.querySelector('[data-library-receipts]')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void linkReceipt();
    }, { signal });
    section.querySelector('[data-library-approve]')?.addEventListener('click', () => {
      void approve();
    }, { signal });
    section.querySelector('[data-library-comms]')?.addEventListener('click', () => {
      void handoff();
    }, { signal });
    await loadList();
    syncAdminControls();
  };

  const reset = () => {
    generation += 1;
    ac?.abort();
    ac = null;
    current = null;
    latestRevision = 0;
    busy = false;
    root?.replaceChildren();
    root = null;
  };

  return { render, bind, reset };
}