import { bindBudgetAdoption } from "./adoption.ts";

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<any>;
type Revision = {
  id: string;
  fiscal_year: number;
  content_sha256: string;
  finance_reviewed_at: string | null;
  adopted_at: string | null;
  prior_year_total_cents: number;
  proposed_total_cents: number;
  lines?: Array<{
    department: string; account_code: string; description: string;
    prior_year_cents: number; proposed_cents: number;
  }>;
};

export function createBudgetView(invoke: Invoke) {
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  const action = (operation: string, args = {}) =>
    invoke("municipal_staff_request", { request: { operation, ...args } });

  function render() {
    return `<section class="workflow-editor" data-townlight-budget>
      <h2>Townlight Budget</h2>
      <form data-budget-import>
        <label>Fiscal year <input name="year" type="number" min="1900" max="2200" required></label>
        <label>Budget CSV <input name="csv" type="file" accept=".csv,text/csv" required></label>
        <button>Import budget CSV</button>
      </form>
      <label>Budget revision <select data-budget-select></select></label>
      <p data-budget-totals></p>
      <table><caption>Budget line items</caption><thead><tr>
        <th>Department</th><th>Account</th><th>Description</th><th>Prior year</th><th>Proposed</th>
      </tr></thead><tbody data-budget-lines></tbody></table>
      <form data-budget-review-form>
        <label><input type="checkbox" required> I reviewed these line items and totals</label>
        <button>Save finance review</button>
      </form>
      <button type="button" data-budget-download>Download hearing attachment</button>
      <div data-budget-adoption></div>
      <form data-budget-publish-form>
        <label><input type="checkbox" required> I approve public delivery of this adopted revision</label>
        <button>Queue adopted budget for publication</button>
      </form>
      <p role="status" aria-live="polite" data-budget-status></p>
    </section>`;
  }

  async function bind(role: string | null) {
    const root = document.querySelector<HTMLElement>("[data-townlight-budget]");
    if (!root) return;
    const select = root.querySelector<HTMLSelectElement>("[data-budget-select]")!;
    const importForm = root.querySelector<HTMLFormElement>("[data-budget-import]")!;
    const reviewForm = root.querySelector<HTMLFormElement>("[data-budget-review-form]")!;
    const publishForm = root.querySelector<HTMLFormElement>("[data-budget-publish-form]")!;
    const download = root.querySelector<HTMLButtonElement>("[data-budget-download]")!;
    const status = root.querySelector<HTMLElement>("[data-budget-status]")!;
    const canReview = role === "local-admin" || role === "city-staff";
    let revision: Revision | null = null;
    let busy = false;
    importForm.hidden = !canReview;

    function sync() {
      reviewForm.hidden = !canReview || !revision || Boolean(revision.finance_reviewed_at);
      publishForm.hidden = role !== "local-admin" || !revision?.adopted_at;
      download.disabled = busy || !revision?.finance_reviewed_at;
      select.disabled = busy;
      for (const form of [importForm, reviewForm, publishForm]) {
        form.querySelector<HTMLButtonElement>("button")!.disabled = busy;
      }
    }

    function showRevision(current: Revision | null) {
      revision = current;
      reviewForm.reset();
      publishForm.reset();
      root.querySelector<HTMLElement>("[data-budget-totals]")!.textContent = current
        ? `Prior year ${money.format(current.prior_year_total_cents / 100)} · Proposed ${money.format(current.proposed_total_cents / 100)}`
        : "Select a saved budget revision.";
      const table = root.querySelector("[data-budget-lines]")!;
      table.replaceChildren();
      for (const line of current?.lines || []) {
        const tr = document.createElement("tr");
        for (const text of [line.department, line.account_code, line.description,
          money.format(line.prior_year_cents / 100), money.format(line.proposed_cents / 100)]) {
          const td = document.createElement("td");
          td.textContent = text;
          tr.append(td);
        }
        table.append(tr);
      }
      root.dispatchEvent(new Event("budget-adoption-change"));
      sync();
    }

    async function reload(id?: string) {
      const rows: Revision[] = await action("budget");
      const selected = rows.find(row => row.id === id)?.id || rows[0]?.id || "";
      select.replaceChildren(new Option("Select a revision", ""));
      for (const row of rows) {
        const phase = row.adopted_at ? "Adopted" : row.finance_reviewed_at ? "Reviewed" : "Draft";
        select.add(new Option(`FY ${row.fiscal_year} · ${phase} · ${row.content_sha256.slice(0, 8)}`, row.id));
      }
      select.value = selected;
      showRevision(selected ? await action("get-budget", { id: selected }) : null);
    }

    async function run(task: () => Promise<void>) {
      if (busy) return;
      busy = true;
      sync();
      try {
        await task();
      } catch (error) {
        status.textContent = String((error as {message?: string})?.message || error);
      } finally {
        busy = false;
        sync();
      }
    }

    select.addEventListener("change", () => void run(async () => {
      showRevision(select.value ? await action("get-budget", { id: select.value }) : null);
    }));
    importForm.addEventListener("submit", event => {
      event.preventDefault();
      void run(async () => {
        if (!canReview) return;
        const form = new FormData(importForm);
        const file = form.get("csv");
        if (!(file instanceof File) || !file.size || file.size > 1048576) {
          status.textContent = "Choose a budget CSV up to 1 MiB.";
          return;
        }
        const result = await action("import-budget", {
          payload: { fiscal_year: Number(form.get("year")), csv_text: await file.text() },
        });
        if (result.errors?.length) {
          status.textContent = result.errors.map((error: {row: number; reason: string}) =>
            `Row ${error.row}: ${error.reason}`).join(" · ");
          return;
        }
        await reload(result.id);
        status.textContent = "Budget revision saved.";
      });
    });
    reviewForm.addEventListener("submit", event => {
      event.preventDefault();
      void run(async () => {
        if (!revision || !canReview) return;
        const { id, content_sha256 } = revision;
        await action("review-budget", { id, payload: { content_sha256, confirmed: true } });
        await reload(id);
        status.textContent = "Finance review saved.";
      });
    });
    download.addEventListener("click", () => void run(async () => {
      if (!revision?.finance_reviewed_at) return;
      const attachment = await action("budget-attachment", { id: revision.id });
      const url = URL.createObjectURL(new Blob([attachment.text], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.file_name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = "Attach the saved budget-revision.txt to the public hearing packet in Meetings.";
    }));
    publishForm.addEventListener("submit", event => {
      event.preventDefault();
      void run(async () => {
        if (!revision?.adopted_at || role !== "local-admin") return;
        const { id, content_sha256 } = revision;
        const receipt = await action("publish-budget", { id, payload: { content_sha256, confirm: true } });
        publishForm.reset();
        status.textContent = `Resident delivery ${receipt.state}: sequence ${receipt.sequence}.`;
      });
    });
    await run(() => reload());
    if (role === "clerk" || role === "local-admin") {
      await bindBudgetAdoption(root, invoke, () => revision, action, reload);
    }
  }

  return { render, bind };
}
