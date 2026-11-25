/**
 * Parks finance binding.
 *
 * Binds the finance view rendered by `finance-render.ts` to the parks
 * backend. Handles:
 *   - selection events (booking / registration) -> receipt load
 *   - offline payment / offline refund (idempotency key retained per
 *     obligation + action + amount + reference until a successful
 *     response is received)
 *   - hosted refund preparation (command_key retained through failures)
 *   - refund status refresh (refund-get then receipt refresh when the
 *     backend reports a succeeded state)
 *   - reconciliation table rendering against the actual array contract
 *     returned by the backend (headers derived in-scope, table headings
 *     from the render file overridden to match the real record shape)
 *
 * No settings handlers live here (separate module). No provider payments
 * are fabricated; money moves only through the documented endpoints.
 * No automatic retries: retries are user-initiated and reuse the same
 * idempotency key.
 */

export interface FinanceCtx {
  call(op: string, extra?: Record<string, unknown>): Promise<any>;
  run(label: string, task: () => Promise<any>): Promise<any>;
  status(message: string): void;
}

export type FinanceStatusState = 'idle' | 'busy' | 'ok' | 'error';

export interface FinanceBinding {
  call<T = unknown>(
    path: string,
    init?: { method?: 'GET' | 'POST'; body?: unknown },
  ): Promise<T>;
  run<T>(label: string, task: () => Promise<T>): Promise<T>;
  status(
    el: HTMLElement | null | undefined,
    state: FinanceStatusState,
    message: string,
  ): void;
  refresh(): Promise<void>;
}

const SUCCESS_REFUND_STATES = new Set(['succeeded']);

const RECONCILIATION_HEADERS = [
  'Obligation',
  'Entity',
  'Amount',
  'Paid',
  'Refunded',
  'Balance',
  'Created',
] as const;

function defaultUuid(): string {
  return globalThis.crypto.randomUUID();
}

function asText(value: unknown): string {
  if (value == null) return '';
  return typeof value === 'string' ? value : String(value);
}

function parseCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 1) return null;
  return n;
}

function formatCents(cents: unknown, currency: string): string {
  const n = typeof cents === 'number' ? cents : Number(cents);
  if (!Number.isFinite(n) || !Number.isSafeInteger(Math.round(n))) {
    return '—';
  }
  const value = n / 100;
  const cur = currency || 'USD';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: cur,
    }).format(value);
  } catch {
    return value.toFixed(2) + ' ' + cur;
  }
}

function formatDate(value: unknown): string {
  if (value == null || value === '') return '';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString();
}

function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function removeRowCell(parent: Element, colspan: number, text: string): void {
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = colspan;
  td.className = 'finance-muted';
  td.textContent = text;
  tr.appendChild(td);
  parent.appendChild(tr);
}

function appendCell(tr: HTMLTableRowElement, text: string): void {
  const td = document.createElement('td');
  td.textContent = text;
  tr.appendChild(td);
}

function extractObligationId(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null;
  const d = detail as Record<string, unknown>;
  const row =
    (d.full_actual_row as Record<string, unknown> | undefined) ??
    (d.fullActualRow as Record<string, unknown> | undefined) ??
    (d.row as Record<string, unknown> | undefined) ??
    d;
  if (!row || typeof row !== 'object') return null;
  const id = (row as Record<string, unknown>).obligation_id ??
    (row as Record<string, unknown>).obligationId;
  return id == null || id === '' ? null : String(id);
}

export function bindFinance(
  root: HTMLElement,
  ctx: FinanceCtx,
): FinanceBinding {
  const uuid = defaultUuid;
  const on = (event: string, handler: (detail: unknown) => void): (() => void) => {
    const listener = (ev: Event): void => {
      handler((ev as CustomEvent).detail);
    };
    root.addEventListener(event, listener);
    return () => root.removeEventListener(event, listener);
  };

  const selectedEl = root.querySelector<HTMLElement>('[data-finance-selected]');
  const receiptRowsEl =
    root.querySelector<HTMLTableSectionElement>('[data-finance-receipt-rows]');
  const paymentLedgerSelect =
    root.querySelector<HTMLSelectElement>('[data-payment-ledger]');
  const refundStatusEl =
    root.querySelector<HTMLElement>('[data-refund-status]');
  const reconciliationBody =
    root.querySelector<HTMLTableSectionElement>('[data-reconciliation]');
  const reconciliationTable =
    reconciliationBody?.closest('table') ?? null;

  const offlinePaymentForm =
    root.querySelector<HTMLFormElement>('[data-offline-payment]');
  const offlineRefundForm =
    root.querySelector<HTMLFormElement>('[data-offline-refund]');
  const hostedRefundForm =
    root.querySelector<HTMLFormElement>('[data-hosted-refund]');

  let selectedId: string | null = null;
  let receipt: ReceiptResponse | null = null;

  // keyed by obligation|action|amount|reference, cleared only on success
  const offlineIdempotency = new Map<string, string>();

  interface HostedState {
    sig: string;
    commandKey: string;
    refundId?: string;
    state?: string;
  }
  let hosted: HostedState | null = null;

  interface ReceiptLedgerEntry {
    id?: string;
    operation?: string;
    amount_cents?: number;
    reference?: string;
    method?: string;
    created_at?: string;
    [key: string]: unknown;
  }
  interface ReceiptEntity {
    id?: string;
    entity_kind?: string;
    entity_id?: string;
    currency?: string;
    amount_cents?: number;
    deposit_cents?: number;
    [key: string]: unknown;
  }
  interface ReceiptTotals {
    paid_cents?: number;
    refunded_cents?: number;
    net_paid_cents?: number;
    balance_cents?: number;
    deposit_cents?: number;
  }
  interface ReceiptResponse {
    schema_version?: number;
    currency?: string;
    entity?: ReceiptEntity;
    ledger?: ReceiptLedgerEntry[];
    totals?: ReceiptTotals;
  }

  // ---------------------------------------------------------------- helpers

  function setStatus(
    el: HTMLElement | null | undefined,
    state: FinanceStatusState,
    message: string,
  ): void {
    if (!el) return;
    el.dataset.state = state;
    el.textContent = message;
  }

  function ensureOfflineStatus(form: HTMLFormElement): HTMLElement {
    const existing = form.querySelector<HTMLElement>('.finance-status');
    if (existing) return existing;
    const out = document.createElement('output');
    out.className = 'finance-status';
    out.setAttribute('role', 'status');
    out.setAttribute('aria-live', 'polite');
    const actions = form.querySelector('.finance-actions');
    if (actions) form.insertBefore(out, actions);
    else form.appendChild(out);
    return out;
  }

  // ---------------------------------------------------------------- API

  async function call<T = unknown>(
    path: string,
    init?: { method?: 'GET' | 'POST'; body?: unknown },
  ): Promise<T> {
    const method = init?.method ?? 'GET';
    let m: RegExpMatchArray | null;
    if (method === 'GET' && (m = path.match(/^\/obligations\/([^/]+)\/receipt$/))) {
      return ctx.call('obligation-receipt', { id: decodeURIComponent(m[1]) }) as Promise<T>;
    }
    if (method === 'POST' && (m = path.match(/^\/obligations\/([^/]+)\/(offline-payment|offline-refund)$/))) {
      const id = decodeURIComponent(m[1]);
      const op = m[2] === 'offline-payment' ? 'offline-payment' : 'offline-refund';
      return ctx.call(op, { id, payload: init?.body }) as Promise<T>;
    }
    if (method === 'GET' && /^\/reconciliation(?:\?limit=100&offset=0)?$/.test(path)) {
      return ctx.call('reconciliation', {}) as Promise<T>;
    }
    if (method === 'POST' && path === '/refunds') {
      return ctx.call('refund-prepare', { payload: init?.body }) as Promise<T>;
    }
    if (method === 'GET' && (m = path.match(/^\/refunds\/([^/]+)$/))) {
      return ctx.call('refund-get', { id: decodeURIComponent(m[1]) }) as Promise<T>;
    }
    throw new Error('Unsupported finance operation: ' + method + ' ' + path);
  }

  async function run<T>(label: string, task: () => Promise<T>): Promise<T> {
    return (await ctx.run(label, task)) as T;
  }

  // ---------------------------------------------------------------- rendering

  function renderSelected(): void {
    if (!selectedEl) return;
    clearChildren(selectedEl);
    if (!selectedId) {
      const p = document.createElement('p');
      p.className = 'finance-muted';
      p.textContent = 'No booking or registration selected.';
      selectedEl.appendChild(p);
      return;
    }
    if (!receipt) {
      const p = document.createElement('p');
      p.className = 'finance-muted';
      p.textContent = 'Loading obligation ' + selectedId + '…';
      selectedEl.appendChild(p);
      return;
    }
    const currency = asText(receipt.currency);
    const entity = receipt.entity ?? {};
    const totals = receipt.totals ?? {};
    const dl = document.createElement('dl');
    dl.className = 'finance-selected__list';

    const addField = (label: string, value: string): void => {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      dl.append(dt, dd);
    };

    addField('Obligation', selectedId);
    const entityKind = asText(entity.entity_kind);
    const entityId = asText(entity.entity_id);
    if (entityKind || entityId) {
      addField('Entity', (entityKind || '—') + ':' + (entityId || '—'));
    }
    addField('Currency', currency || '—');
    addField('Amount', formatCents(entity.amount_cents ?? 0, currency));
    if (entity.deposit_cents != null) {
      addField('Deposit', formatCents(entity.deposit_cents, currency));
    }
    addField('Paid', formatCents(totals.paid_cents ?? 0, currency));
    addField('Refunded', formatCents(totals.refunded_cents ?? 0, currency));
    addField('Net paid', formatCents(totals.net_paid_cents ?? 0, currency));
    addField('Balance', formatCents(totals.balance_cents ?? 0, currency));

    selectedEl.appendChild(dl);
  }

  function populatePaymentLedger(ledger: ReceiptLedgerEntry[]): void {
    if (!paymentLedgerSelect) return;
    const previous = paymentLedgerSelect.value;
    clearChildren(paymentLedgerSelect);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'Select a receipt ledger ID';
    paymentLedgerSelect.appendChild(none);
    const currency = asText(receipt?.currency);
    for (const entry of ledger) {
      if (entry.operation !== 'payment') continue;
      const ledgerId = asText(entry.id);
      if (!ledgerId) continue;
      const opt = document.createElement('option');
      opt.value = ledgerId;
      opt.textContent =
        ledgerId + ' · ' + formatCents(entry.amount_cents ?? 0, currency);
      paymentLedgerSelect.appendChild(opt);
    }
    if (previous && paymentLedgerSelect.querySelector('option[value="' + previous + '"]')) {
      paymentLedgerSelect.value = previous;
    }
  }

  function renderReceipt(): void {
    if (!receiptRowsEl) return;
    clearChildren(receiptRowsEl);
    if (!receipt) {
      removeRowCell(receiptRowsEl, 4, 'No receipt loaded.');
      populatePaymentLedger([]);
      return;
    }
    const ledger = Array.isArray(receipt.ledger) ? receipt.ledger : [];
    const currency = asText(receipt.currency);
    if (ledger.length === 0) {
      removeRowCell(receiptRowsEl, 4, 'No ledger entries.');
      populatePaymentLedger([]);
      return;
    }
    for (const entry of ledger) {
      const tr = document.createElement('tr');
      const sign = entry.operation === 'refund' ? '\u2212' : '+';
      appendCell(tr, asText(entry.id));
      appendCell(tr, formatDate(entry.created_at));
      appendCell(tr, sign + formatCents(entry.amount_cents ?? 0, currency));
      appendCell(tr, asText(entry.reference));
      receiptRowsEl.appendChild(tr);
    }
    populatePaymentLedger(ledger);
  }

  function renderReconciliation(rows: unknown): void {
    if (!reconciliationBody) return;
    const list: Array<Record<string, unknown>> = Array.isArray(rows)
      ? (rows as Array<Record<string, unknown>>)
      : [];

    if (reconciliationTable) {
      const thead = reconciliationTable.querySelector('thead');
      if (thead) {
        clearChildren(thead);
        const tr = document.createElement('tr');
        for (const heading of RECONCILIATION_HEADERS) {
          const th = document.createElement('th');
          th.scope = 'col';
          th.textContent = heading;
          tr.appendChild(th);
        }
        thead.appendChild(tr);
      }
    }

    clearChildren(reconciliationBody);
    if (list.length === 0) {
      removeRowCell(
        reconciliationBody,
        RECONCILIATION_HEADERS.length,
        'No reconciliation rows.',
      );
      return;
    }

    for (const row of list) {
      const currency = asText(row.currency);
      const tr = document.createElement('tr');
      appendCell(tr, asText(row.obligation_id));
      const kind = asText(row.entity_kind);
      const entId = asText(row.entity_id);
      appendCell(tr, (kind || '—') + ':' + (entId || '—'));
      appendCell(tr, formatCents(row.amount_cents ?? 0, currency));
      appendCell(tr, formatCents(row.paid_cents ?? 0, currency));
      appendCell(tr, formatCents(row.refunded_cents ?? 0, currency));
      appendCell(tr, formatCents(row.balance_cents ?? 0, currency));
      appendCell(tr, formatDate(row.created_at));
      reconciliationBody.appendChild(tr);
    }
  }

  // ---------------------------------------------------------------- loading

  async function loadReceipt(id: string): Promise<void> {
    const data = await call<ReceiptResponse>(
      '/obligations/' + encodeURIComponent(id) + '/receipt',
    );
    if (selectedId !== id) return;
    receipt = data ?? null;
    renderSelected();
    renderReceipt();
  }

  async function selectObligation(id: string): Promise<void> {
    if (!id) return;
    selectedId = id;
    receipt = null;
    if (hosted && !hosted.sig.startsWith(id + '|')) hosted = null;
    renderSelected();
    renderReceipt();
    try {
      await loadReceipt(id);
    } catch (err) {
      if (selectedId !== id) return;
      const p = document.createElement('p');
      p.className = 'finance-muted';
      p.textContent =
        'Unable to load receipt: ' +
        (err instanceof Error ? err.message : 'request failed');
      if (selectedEl) {
        clearChildren(selectedEl);
        selectedEl.appendChild(p);
      }
      if (receiptRowsEl) {
        clearChildren(receiptRowsEl);
        removeRowCell(receiptRowsEl, 4, 'No receipt loaded.');
      }
      populatePaymentLedger([]);
    }
  }

  async function refresh(): Promise<void> {
    if (!selectedId) return;
    await loadReceipt(selectedId);
  }

  async function refreshReconciliation(): Promise<void> {
    const rows = await call<unknown>('/reconciliation');
    renderReconciliation(rows);
  }

  // ---------------------------------------------------------------- offline

  async function handleOffline(
    kind: 'payment' | 'refund',
    form: HTMLFormElement | null,
  ): Promise<void> {
    if (!form || !selectedId) return;
    const statusEl = ensureOfflineStatus(form);
    const amountInput = form.elements.namedItem(
      'amount_cents',
    ) as HTMLInputElement | null;
    const referenceInput = form.elements.namedItem(
      'reference',
    ) as HTMLInputElement | null;
    const amount = parseCents(amountInput?.value ?? '');
    if (amount == null) {
      setStatus(statusEl, 'error', 'Enter a whole number of cents (at least 1).');
      return;
    }
    const reference = referenceInput?.value ?? '';
    const id = selectedId;
    const sig = id + '|' + kind + '|' + amount + '|' + reference;
    let key = offlineIdempotency.get(sig);
    if (!key) {
      key = uuid();
      offlineIdempotency.set(sig, key);
    }
    const endpoint = kind === 'payment' ? 'offline-payment' : 'offline-refund';
    const submit = form.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (submit) submit.disabled = true;
    setStatus(
      statusEl,
      'busy',
      kind === 'payment' ? 'Recording payment…' : 'Recording refund…',
    );
    try {
      await call(
        '/obligations/' +
          encodeURIComponent(id) +
          '/' +
          endpoint,
        {
          method: 'POST',
          body: {
            amount_cents: amount,
            reference,
            idempotency_key: key,
          },
        },
      );
      // authoritative success: drop the retained key
      offlineIdempotency.delete(sig);
      form.reset();
      setStatus(
        statusEl,
        'ok',
        kind === 'payment' ? 'Payment recorded.' : 'Refund recorded.',
      );
      try {
        await loadReceipt(id);
      } catch {
        /* receipt reload failure does not undo success */
      }
    } catch (err) {
      // key intentionally retained through failures; no auto retry
      setStatus(
        statusEl,
        'error',
        err instanceof Error ? err.message : 'Request failed.',
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  // ---------------------------------------------------------------- hosted

  function hostedFormSignature(): string | null {
    if (!hostedRefundForm || !paymentLedgerSelect || !selectedId) return null;
    const ledgerId = paymentLedgerSelect.value;
    if (!ledgerId) return null;
    const amountInput = hostedRefundForm.elements.namedItem(
      'amount_cents',
    ) as HTMLInputElement | null;
    const amount = parseCents(amountInput?.value ?? '');
    if (amount == null) return null;
    const reasonInput = hostedRefundForm.elements.namedItem(
      'reason',
    ) as HTMLTextAreaElement | null;
    const reason = reasonInput?.value ?? '';
    return selectedId + '|' + ledgerId + '|' + amount + '|' + reason;
  }

  function renderHostedState(payload: unknown): void {
    if (!refundStatusEl) return;
    if (!payload || typeof payload !== 'object') {
      setStatus(refundStatusEl, 'ok', 'Refund request sent.');
      return;
    }
    const record = payload as Record<string, unknown>;
    const id = asText(record.id);
    const state = asText(record.state);
    const parts: string[] = [];
    if (id) parts.push('id ' + id);
    if (state) parts.push('state ' + state);
    setStatus(
      refundStatusEl,
      'ok',
      parts.length ? parts.join(' · ') : 'Refund request sent.',
    );
  }

  async function handleHostedRefundSubmit(): Promise<void> {
    if (!hostedRefundForm || !paymentLedgerSelect || !selectedId) return;
    const ledgerId = paymentLedgerSelect.value;
    if (!ledgerId) {
      setStatus(refundStatusEl, 'error', 'Select a payment ledger entry.');
      return;
    }
    const amountInput = hostedRefundForm.elements.namedItem(
      'amount_cents',
    ) as HTMLInputElement | null;
    const amount = parseCents(amountInput?.value ?? '');
    if (amount == null) {
      setStatus(refundStatusEl, 'error', 'Enter a whole number of cents (at least 1).');
      return;
    }
    const reasonInput = hostedRefundForm.elements.namedItem(
      'reason',
    ) as HTMLTextAreaElement | null;
    const reason = reasonInput?.value ?? '';
    const sig = selectedId + '|' + ledgerId + '|' + amount + '|' + reason;
    if (!hosted || hosted.sig !== sig) {
      hosted = { sig, commandKey: uuid() };
    }
    const commandKey = hosted.commandKey;
    const submit = hostedRefundForm.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (submit) submit.disabled = true;
    setStatus(refundStatusEl, 'busy', 'Preparing refund…');
    try {
      const res = await call<Record<string, unknown>>('/refunds', {
        method: 'POST',
        body: {
          payment_ledger_id: ledgerId,
          amount_cents: amount,
          reason,
          command_key: commandKey,
        },
      });
      const refundId = asText(res?.id);
      const state = asText(res?.state);
      hosted = {
        sig,
        commandKey,
        refundId: refundId || undefined,
        state: state || undefined,
      };
      renderHostedState(res);
      if (SUCCESS_REFUND_STATES.has(state) && selectedId) {
        try {
          await loadReceipt(selectedId);
        } catch {
          /* receipt reload is best-effort */
        }
      }
    } catch (err) {
      // command_key intentionally retained; no auto retry
      setStatus(
        refundStatusEl,
        'error',
        err instanceof Error ? err.message : 'Refund preparation failed.',
      );
    } finally {
      if (submit) submit.disabled = false;
    }
  }

  async function handleRefundRefresh(): Promise<void> {
    if (!hosted?.refundId) {
      setStatus(refundStatusEl, 'idle', 'No prepared refund to refresh.');
      return;
    }
    setStatus(refundStatusEl, 'busy', 'Refreshing refund…');
    try {
      const res = await call<Record<string, unknown>>(
        '/refunds/' + encodeURIComponent(hosted.refundId),
      );
      const state = asText(res?.state);
      hosted = { ...hosted, state };
      renderHostedState(res);
      if (SUCCESS_REFUND_STATES.has(state) && selectedId) {
        try {
          await loadReceipt(selectedId);
        } catch {
          /* best-effort */
        }
      }
    } catch (err) {
      setStatus(
        refundStatusEl,
        'error',
        err instanceof Error ? err.message : 'Refund refresh failed.',
      );
    }
  }

  // ---------------------------------------------------------------- events

  function clearSelection(): void {
    selectedId = null;
    receipt = null;
    hosted = null;
    if (selectedEl) {
      clearChildren(selectedEl);
      const p = document.createElement('p');
      p.className = 'finance-muted';
      p.textContent = 'No booking or registration selected.';
      selectedEl.appendChild(p);
    }
    if (receiptRowsEl) {
      clearChildren(receiptRowsEl);
      removeRowCell(receiptRowsEl, 4, 'No receipt loaded.');
    }
    populatePaymentLedger([]);
    if (hostedRefundForm) hostedRefundForm.reset();
    if (refundStatusEl) {
      refundStatusEl.textContent = '';
      delete refundStatusEl.dataset.state;
    }
  }

  on('parks-booking-selected', (detail: unknown) => {
    const id = extractObligationId(detail);
    if (id) void selectObligation(id);
    else clearSelection();
  });

  on('parks-registration-selected', (detail: unknown) => {
    const id = extractObligationId(detail);
    if (id) void selectObligation(id);
    else clearSelection();
  });

  on('selection-cleared', clearSelection);

  // ---------------------------------------------------------------- wiring

  offlinePaymentForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void handleOffline('payment', offlinePaymentForm);
  });
  offlineRefundForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void handleOffline('refund', offlineRefundForm);
  });
  hostedRefundForm?.addEventListener('submit', (ev) => {
    ev.preventDefault();
    void handleHostedRefundSubmit();
  });

  root
    .querySelector('[data-finance-refresh]')
    ?.addEventListener('click', () => {
      void refresh();
    });
  root
    .querySelector('[data-reconciliation-refresh]')
    ?.addEventListener('click', () => {
      void refreshReconciliation().catch((err) => {
        if (reconciliationBody) {
          clearChildren(reconciliationBody);
          removeRowCell(
            reconciliationBody,
            RECONCILIATION_HEADERS.length,
            err instanceof Error ? 'Reconciliation failed: ' + err.message : 'Reconciliation failed.',
          );
        }
      });
    });
  root
    .querySelector('[data-refund-refresh]')
    ?.addEventListener('click', () => {
      void handleRefundRefresh();
    });

  function status(
    el: HTMLElement | null | undefined,
    state: FinanceStatusState,
    message: string,
  ): void {
    setStatus(el, state, message);
  }

  return { call, run, status, refresh };
}
