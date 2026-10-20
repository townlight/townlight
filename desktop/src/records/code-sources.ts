type Invoke = <T>(command: string, args: { request: object }) => Promise<T>;

interface Source {
  source_id: string;
  title: string;
  sha256: string;
  excerpt: string;
  citation: string;
  as_of: string | null;
  version_context: {
    version_id: string;
    version_label: string;
    effective_start: string;
    effective_end: string | null;
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;");

export function renderCodeSources(requestId: string): string {
  return `
<section data-code-sources data-request-id="${esc(requestId)}">
  <h3>Find Code documents</h3>
  <p>Code results are authoritative public adopted section/version/date exports, not legal advice.
    Attaching a source does not approve or release this response.</p>
  <form>
    <label>Code document search <input name="query" type="search" required maxlength="500" /></label>
    <label>As of (optional; blank means current adopted) <input name="as_of" type="date" /></label>
    <button type="submit">Search Code</button>
  </form>
  <div data-code-results></div>
  <p data-code-status role="status" aria-live="polite"></p>
</section>`.trim();
}

function describeVersion(source: Source): string {
  const vc = source.version_context;
  const end = vc.effective_end ? vc.effective_end : 'open-ended';
  const chosen = source.as_of ?? 'current adopted';
  return `${vc.version_label} (${vc.version_id}) — effective ${vc.effective_start} to ${end} (as of ${chosen})`;
}

function buildSourceItem(source: Source, requestId: string, invoke: Invoke,
                         refresh: () => Promise<void>, status: HTMLElement): HTMLElement {
  const article = document.createElement('article');
  const h4 = document.createElement('h4');
  h4.textContent = source.title;
  const version = document.createElement('p');
  version.textContent = describeVersion(source);
  const excerpt = document.createElement('p');
  excerpt.textContent = source.excerpt;
  const citation = document.createElement('p');
  citation.textContent = source.citation;
  const attach = document.createElement('button');
  attach.type = 'button';
  attach.textContent = 'Attach to selected Records request';
  attach.disabled = !requestId;
  attach.addEventListener('click', async () => {
    if (!requestId) return;
    attach.disabled = true;
    status.textContent = 'Attaching source snapshot…';
    try {
      await invoke('records_domain_request', {request: {
        operation: 'attach-code-source', request_id: requestId,
        source_id: source.source_id, expected_sha256: source.sha256, as_of: source.as_of,
      }});
      await refresh();
    } catch {
      status.textContent = 'Attachment was not confirmed. Refresh to verify saved work before relying on it.';
      attach.disabled = false;
    }
  });
  article.append(h4, version, excerpt, citation, attach);
  return article;
}

export function bindCodeSources(invoke: Invoke, refresh: () => Promise<void>): void {
  const root = document.querySelector<HTMLElement>('[data-code-sources]');
  if (!root) return;
  const form = root.querySelector<HTMLFormElement>('form');
  const results = root.querySelector<HTMLElement>('[data-code-results]');
  const status = root.querySelector<HTMLElement>('[data-code-status]');
  if (!form || !results || !status) return;
  const searchButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const requestId = root.dataset.requestId ?? '';
  form.addEventListener('submit', async (event: Event) => {
    event.preventDefault();
    if (searchButton) searchButton.disabled = true;
    results.replaceChildren();
    status.textContent = 'Searching Code documents…';
    const formData = new FormData(form);
    const query = String(formData.get('query') ?? '').trim();
    const asOf = String(formData.get('as_of') ?? '').trim() || null;
    try {
      const response = await invoke<{results: Source[]; truncated: boolean}>(
        'records_domain_request', {request: {operation: 'search-code', query, as_of: asOf}});
      for (const source of response.results.slice(0, 50)) {
        results.appendChild(buildSourceItem(source, requestId, invoke, refresh, status));
      }
      status.textContent = `${response.results.length} permitted results.${response.truncated ? ' First 50; refine query.' : ''}`;
    } catch {
      status.textContent = 'Code search failed or was restricted. No cached or substituted results are shown.';
    } finally {
      if (searchButton) searchButton.disabled = false;
    }
  });
}
