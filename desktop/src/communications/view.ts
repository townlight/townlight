import { renderCommunications } from "./render.ts";
import { createEditor } from "./editor.ts";
import { bindCommunicationFiles } from "./files.ts";

type Invoke = (name: string, input: unknown) => Promise<unknown>;
type Options = { openRecords?: (id: string) => unknown };
type SourceRef = { kind: string; id: string; title?: string; eligible?: boolean };

const boundRoots = new WeakSet<object>();

export function createCommunicationsView(invoke: Invoke, options: Options = {}) {
  let current: any = null;
  let currentId = "";
  let currentRevision = 0;
  let sources: SourceRef[] = [];
  let busy = 0;
  let fileActions: { refresh: () => void } | undefined;

  const call = async (operation: string, payload: Record<string, unknown> = {}) => {
    const response: any = await invoke("communications_request", {
      request: { operation, ...payload },
    });
    return response && typeof response === "object" && "result" in response
      ? response.result
      : response;
  };

  function bind(parent: ParentNode = document) {
    const root = parent instanceof HTMLElement
      ? parent
      : parent.querySelector<HTMLElement>("[data-comms-view]");
    if (!root) return;
    if (boundRoots.has(root)) return;
    boundRoots.add(root);
    const editor = createEditor(root);
    const statusEl = root.querySelector<HTMLElement>("[data-status]");
    const articlesEl = root.querySelector<HTMLElement>("[data-articles]");
    const sourcesEl = root.querySelector<HTMLElement>("[data-sources]");
    const currentEl = root.querySelector<HTMLElement>("[data-current]");
    const historyEl = root.querySelector<HTMLElement>("[data-history]");
    const previewEl = root.querySelector<HTMLElement>("[data-preview]");
    const reportEl = root.querySelector<HTMLElement>("[data-access-report]");
    const status = (message: string) => {
      if (statusEl) statusEl.textContent = message;
    };

    async function run(task: () => Promise<void>) {
      busy += 1;
      root.setAttribute("aria-busy", "true");
      const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>("button"));
      buttons.forEach((button) => { button.disabled = true; });
      try {
        await task();
      } catch (error) {
        status(error instanceof Error ? error.message : "Request failed");
      } finally {
        busy -= 1;
        if (busy === 0) {
          root.setAttribute("aria-busy", "false");
          buttons.forEach((button) => { button.disabled = false; });
        }
      }
    }

    function renderArticles(items: any[]) {
      if (!articlesEl) return;
      articlesEl.replaceChildren();
      items.forEach((article) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.articleId = String(article?.id ?? "");
        button.textContent = `${article?.title ?? article?.revision?.title ?? "Untitled"} (${article?.state ?? article?.status ?? "draft"})`;
        li.append(button);
        articlesEl.append(li);
      });
    }

    async function loadList() {
      const data: any = await call("articles");
      const items = Array.isArray(data) ? data : data?.articles ?? data?.items ?? [];
      renderArticles(Array.isArray(items) ? items : []);
    }

    function renderSources() {
      if (!sourcesEl) return;
      sourcesEl.replaceChildren();
      sources.forEach((source, index) => {
        const li = document.createElement("li");
        const label = document.createElement("span");
        label.textContent = `${source.kind}/${source.id}`;
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";
        remove.dataset.removeSource = String(index);
        li.append(label, remove);
        sourcesEl.append(li);
      });
    }

    function renderPreview() {
      if (!previewEl) return;
      const draft: any = editor.payload(sources);
      previewEl.replaceChildren();
      const heading = document.createElement('h4');
      heading.textContent = 'Draft preview';
      const title = document.createElement('p');
      title.textContent = `Title: ${String(draft?.title ?? '')}`;
      const language = document.createElement('p');
      language.textContent = `Language: ${String(draft?.language ?? '')}`;
      const body = document.createElement('div');
      body.textContent = String(draft?.body ?? '');
      body.style.whiteSpace = 'pre-wrap';
      const sourceHeading = document.createElement('p');
      sourceHeading.textContent = 'Sources:';
      const sourceList = document.createElement('ul');
      sources.forEach((source) => {
        const item = document.createElement('li');
        item.textContent = source.title ? `${source.kind}/${source.id} — ${source.title}` : `${source.kind}/${source.id}`;
        sourceList.append(item);
      });
      previewEl.append(heading, title, language, body, sourceHeading, sourceList);
    }

    function renderCurrent() {
      if (currentEl) {
        if (!current) currentEl.textContent = 'No article selected.';
        else {
          const revision = current.revision ?? {};
          currentEl.textContent = `ID: ${current.id ?? ''}
Title: ${revision.title ?? ''}
State: ${current.state ?? current.status ?? ''}
Revision: ${revision.sha256 ?? ''}`;
        }
      }
      if (historyEl) {
        const lines: string[] = [];
        const history = current?.history;
        const publications: any[] = [];
        if (Array.isArray(history)) {
          history.forEach((entry: any) => {
            if (Array.isArray(entry?.publications)) publications.push(...entry.publications);
            else if (entry?.publication) publications.push(entry.publication);
            else publications.push(entry);
          });
        } else if (Array.isArray(history?.publications)) {
          publications.push(...history.publications);
        } else if (history) {
          publications.push(history);
        }
        lines.push('Publications');
        if (publications.length === 0) lines.push('None');
        publications.forEach((publication: any) => {
          const revision = publication?.revision?.sha256 ?? publication?.revision_sha256 ?? publication?.sha256 ?? publication?.revision ?? '';
          const due = publication?.due_at ?? publication?.due ?? publication?.scheduled_for ?? '';
          const time = publication?.created_at ?? publication?.updated_at ?? publication?.at ?? publication?.time ?? '';
          lines.push(`state=${publication?.state ?? publication?.status ?? ''} action=${publication?.action ?? ''} revision=${revision} due=${due} time=${time}`.trim());
          const lastError = publication?.last_error ?? publication?.error ?? publication?.error_message;
          if (lastError) lines.push(`last_error: ${String(lastError)}`);
          const receipt = publication?.website_receipt?.url ?? publication?.website_receipt_url ?? (typeof publication?.website_receipt === 'string' ? publication.website_receipt : '');
          if (receipt) lines.push(`website_receipt: ${String(receipt)}`);
          const summary = publication?.email_summary;
          const sent = summary?.sent ?? summary?.smtp_accepted ?? summary?.accepted;
          if (summary && typeof summary === 'object') {
            lines.push(`email_summary: sent(SMTP accepted)=${sent ?? 0} remaining=${summary.remaining ?? 0} failed=${summary.failed ?? 0} uncertain=${summary.uncertain ?? 0} skipped=${summary.skipped ?? 0}`);
          }
        });
        const events = Array.isArray(current?.events) ? current.events : Array.isArray(current?.revisions) ? current.revisions : [];
        lines.push('', 'Revision events');
        if (events.length === 0) lines.push('None');
        events.forEach((entry: any) => {
          lines.push(`kind=${String(entry?.kind ?? '')} revision=${String(entry?.revision ?? '')} actor=${String(entry?.actor ?? '')} created_at=${String(entry?.created_at ?? '')}`.trim());
        });
        historyEl.textContent = lines.join('\n');
      }
    }

    async function load(id: string) {
      const data: any = await call("article", { id });
      current = data?.article ?? data;
      currentId = String(current?.id ?? id);
      currentRevision = Number(current?.current_revision ?? 0);
      editor.fill(current ?? {});
      sources = Array.isArray(current?.revision?.source_refs)
        ? current.revision.source_refs.map((source: any) => ({
            kind: String(source?.kind ?? ""),
            id: String(source?.id ?? ""),
            title: source?.title,
            eligible: source?.eligible,
          }))
        : [];
      root.dataset.currentId = currentId;
      root.dataset.currentRevision = String(currentRevision);
      renderSources();
      renderCurrent();
      fileActions?.refresh();
    }

    async function reloadSelected() {
      await loadList();
      if (currentId) await load(currentId);
    }

    function sourceInputs() {
      const kind = root.querySelector<HTMLSelectElement>('[name="source_kind"]')?.value.trim() ?? "";
      const id = root.querySelector<HTMLInputElement>('[name="source_id"]')?.value.trim() ?? "";
      return { kind, id };
    }

    function fieldValue(name: string) {
      return root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`)?.value.trim() ?? "";
    }

    root.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      const articleButton = target?.closest<HTMLButtonElement>("[data-article-id]");
      if (articleButton?.dataset.articleId) {
        void run(async () => { await load(articleButton.dataset.articleId!); status("Article loaded"); });
        return;
      }
      if (target?.closest('[data-refresh]')) {
        void run(async () => { await reloadSelected(); status('Articles reloaded'); });
        return;
      }
      if (target?.closest('[data-preview-draft]')) {
        renderPreview();
        status('Draft preview updated');
        return;
      }
      if (target?.closest('[data-new]')) {
        current = null;
        currentId = "";
        currentRevision = 0;
        sources = [];
        delete root.dataset.currentId;
        delete root.dataset.currentRevision;
        editor.reset();
        renderSources();
        renderCurrent();
        fileActions?.refresh();
        status("New article");
        return;
      }
      const remove = target?.closest<HTMLButtonElement>("[data-remove-source]");
      if (remove) {
        const index = Number(remove.dataset.removeSource);
        if (Number.isInteger(index)) sources.splice(index, 1);
        renderSources();
        return;
      }
      if (target?.closest("[data-source-add]")) {
        const { kind, id } = sourceInputs();
        if (!kind || !id) { status("Select a source kind and enter an ID"); return; }
        if (!sources.some((source) => source.kind === kind && source.id === id)) {
          sources.push({ kind, id });
        }
        renderSources();
        status("Source added");
        return;
      }
      if (target?.closest("[data-source-lookup]")) {
        void run(async () => {
          const { kind, id } = sourceInputs();
          if (!kind || !id) throw new Error("Select a source kind and enter an ID");
          const data: any = await call("source", { payload: { kind, id } });
          const source = data?.reference;
          const verified = source?.eligible === true;
          status(verified && source?.title
            ? `Verified source ${kind}/${id}: ${source.title}`
            : `Source ${kind}/${id} could not be verified`);
        });
        return;
      }
      if (target?.closest("[data-access-review]")) {
        void run(async () => {
          const draft = editor.payload(sources);
          const data: any = await call("access-review", { payload: draft });
          const report = data?.report ?? data?.text ?? data;
          if (reportEl) reportEl.textContent = typeof report === "string" ? report : JSON.stringify(report, null, 2);
          status("Accessibility report loaded");
        });
        return;
      }
      if (target?.closest("[data-approve]")) {
        const confirm = root.querySelector<HTMLInputElement>("[data-approve-confirm]");
        if (!confirm?.checked) { status("Confirm the approval checkbox first"); return; }
        if (!currentId || !currentRevision) { status("Select a current revision first"); return; }
        void run(async () => {
          await call("approve", {
            id: currentId,
            payload: {
              expected_revision: currentRevision,
              expected_sha256: current.revision.sha256,
              confirm: true,
            },
          });
          await reloadSelected();
          status("Revision approved");
        });
        return;
      }
    });

    root.addEventListener("submit", (event) => {
      const form = event.target as HTMLFormElement;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.matches("[data-draft]")) {
        event.preventDefault();
        void run(async () => {
          const draft = editor.payload(sources);
          let result: any;
          if (currentId) {
            if (!currentRevision) throw new Error("Current revision unavailable");
            result = await call("edit", {
              id: currentId,
              payload: { ...draft, expected_revision: currentRevision },
            });
          } else {
            result = await call("create", { payload: draft });
          }
          const nextId = result?.id ?? result?.article?.id ?? currentId;
          if (!currentId && result?.id) {
            currentId = String(result.id);
            await load(currentId);
            await loadList();
          } else if (currentId || nextId) {
            await reloadSelected();
          } else {
            await loadList();
          }
          status("Article saved");
        });
        return;
      }
      if (form.matches("[data-review]")) {
        event.preventDefault();
        void run(async () => {
          if (!currentId || !currentRevision) throw new Error("Select a current revision first");
          const note = fieldValue("note");
          await call("review", {
            id: currentId,
            payload: { expected_revision: currentRevision, note },
          });
          await reloadSelected();
          status("Article sent for review");
        });
        return;
      }
      if (form.matches("[data-schedule]")) {
        event.preventDefault();
        void run(async () => {
          if (!currentId || !currentRevision) throw new Error("Select a current revision first");
          const due = fieldValue("due_at");
          const date = new Date(due);
          if (!due || Number.isNaN(date.getTime())) throw new Error("Enter a valid schedule date");
          const channels = ["website", "email"].filter((name) =>
            root.querySelector<HTMLInputElement>(`[name="${name}"]`)?.checked
          );
          if (channels.length === 0) throw new Error("Select at least one channel");
          const action = fieldValue("action");
          if (!action) throw new Error("Select a schedule action");
          const confirm = root.querySelector<HTMLInputElement>('[name="confirm"]');
          if (!confirm?.checked) throw new Error("Confirm the scheduled action");
          await call("schedule", {
            id: currentId,
            payload: {
              expected_revision: currentRevision,
              expected_sha256: current.revision.sha256,
              due_at: date.toISOString(),
              channels,
              action,
              confirm: true,
            },
          });
          await reloadSelected();
          status("Article scheduled");
        });
      }
    });

    fileActions = bindCommunicationFiles(root, {
      call,
      current: () => current,
      reload: async () => { if (currentId) await load(currentId); },
      status,
      openRecords: options.openRecords,
    });
    void run(loadList);
  }

  return { render: renderCommunications, bind };
}
