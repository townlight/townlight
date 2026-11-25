import { encodeFile, downloadVerified } from "./file-bytes.ts";

type AttachmentRef = {
  attachment_id?: string;
  id?: string;
  name?: string;
  filename?: string;
  media_type?: string;
  public?: boolean;
};
type Article = {
  id: string;
  current_revision: number;
  revision: { sha256: string; attachment_refs?: AttachmentRef[] };
};
type Context = {
  call: (operation: string, extra?: Record<string, unknown>) => Promise<any>;
  current: () => Article | null | undefined;
  reload: () => Promise<void> | void;
  status: (message: string, error?: unknown) => void;
  openRecords: (id: string) => Promise<void> | void;
};

function makeButton(label: string, id: string, action: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset[action] = "";
  button.dataset.attachmentId = id;
  return button;
}

export function bindCommunicationFiles(root: HTMLElement, ctx: Context) {
  const list = root.querySelector<HTMLElement>("[data-attachments]");
  const records = root.querySelector<HTMLElement>("[data-records]");

  function refresh() {
    if (!list) return;
    const article = ctx.current();
    const refs = article?.revision?.attachment_refs ?? [];
    list.replaceChildren();
    for (const ref of refs) {
      const id = String(ref.attachment_id ?? ref.id ?? "");
      if (!id) continue;
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = `${ref.name ?? ref.filename ?? "Attachment"}${
        ref.media_type ? ` (${ref.media_type})` : ""
      }${ref.public ? " — public" : ""}`;
      item.append(label, makeButton("Download", id, "download"), makeButton("Remove", id, "remove"));
      list.append(item);
    }
  }

  async function run(button: HTMLButtonElement | null, task: () => Promise<void>, failure: string) {
    if (button) button.disabled = true;
    try {
      await task();
    } catch (error) {
      ctx.status(error instanceof Error ? error.message : failure, error);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function selected() {
    const article = ctx.current();
    if (!article?.id || article.current_revision == null) throw new Error("Select a current article first");
    return article;
  }

  root.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    const download = target?.closest<HTMLButtonElement>("[data-download]");
    if (download?.dataset.attachmentId) {
      void run(download, async () => {
        const article = selected();
        const data = await ctx.call("attachment", {
          id: article.id,
          attachment_id: download.dataset.attachmentId,
        });
        await downloadVerified(data);
        ctx.status("Attachment downloaded");
      }, "Could not download attachment");
      return;
    }

    const remove = target?.closest<HTMLButtonElement>("[data-remove]");
    if (remove?.dataset.attachmentId) {
      void run(remove, async () => {
        const article = selected();
        await ctx.call("remove-attachment", {
          id: article.id,
          attachment_id: remove.dataset.attachmentId,
          payload: { expected_revision: article.current_revision },
        });
        await ctx.reload();
        refresh();
        ctx.status("Attachment removed");
      }, "Could not remove attachment");
      return;
    }

    const open = target?.closest<HTMLButtonElement>("[data-open-records]");
    if (open?.dataset.recordsRequestId) {
      void run(open, async () => {
        await ctx.openRecords(open.dataset.recordsRequestId!);
      }, "Could not open records");
      return;
    }

    const archive = target?.closest<HTMLButtonElement>("[data-archive-records]");
    if (archive) {
      void run(archive, async () => {
        const article = selected();
        const data = await ctx.call("archive-records", {
          id: article.id,
          payload: {
            expected_revision: article.current_revision,
            expected_sha256: article.revision.sha256,
            confirm: true,
          },
        });
        const requestId = String(data?.records_request_id ?? "");
        if (!requestId) throw new Error("Records request ID unavailable");
        if (records) {
          const tracking = data?.tracking ?? "";
          const hash = data?.sha256 ?? "";
          const info = document.createElement("p");
          info.textContent = `Tracking: ${String(tracking)}\nHash: ${String(hash)}`;
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = "Open records";
          button.dataset.openRecords = "";
          button.dataset.recordsRequestId = requestId;
          records.replaceChildren(info, button);
        }
        ctx.status("Records request created");
      }, "Could not archive records");
    }
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches("[data-attachment]")) return;
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter as HTMLButtonElement | null;
    void run(submitter, async () => {
      const article = selected();
      const file = form.querySelector<HTMLInputElement>('[name="file"]')?.files?.[0];
      if (!file) throw new Error("Select a file to attach");
      const encoded = await encodeFile(file);
      const isPublic = !!form.querySelector<HTMLInputElement>('[name="public"]')?.checked;
      await ctx.call("attach", {
        id: article.id,
        payload: {
          expected_revision: article.current_revision,
          name: file.name,
          media_type: file.type || "application/octet-stream",
          content_base64: encoded,
          public: isPublic,
        },
      });
      await ctx.reload();
      refresh();
      form.reset();
      ctx.status("Attachment added");
    }, "Could not add attachment");
  });

  refresh();
  return { refresh };
}
