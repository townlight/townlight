export type RecordsHandoffCall = (
  operation: string,
  extra?: Record<string, unknown>
) => Promise<any>;

export type RecordsHandoffSelection = { id: string; revision: number } | null;

export type RecordsHandoff = {
  render: () => string;
  bind: (root: HTMLElement) => void;
};

type ValidReceipt = {
  sha256: string;
  path: string;
  size_bytes: number;
};

type PreparedArchive = {
  id: string;
  revision: number;
  sha256: string;
  path: string;
  sizeBytes: number;
};

type Elements = {
  prepare: HTMLButtonElement;
  archive: HTMLButtonElement;
  approve: HTMLInputElement;
  receipt: HTMLElement;
  status: HTMLElement;
  error: HTMLElement;
  result: HTMLElement;
};

export function createRecordsHandoff(
  call: RecordsHandoffCall,
  getSelection: () => RecordsHandoffSelection,
  openRecords?: (id: string) => Promise<void> | void
): RecordsHandoff {
  let busy = false;
  let prepared: PreparedArchive | null = null;
  const boundRoots = new WeakSet<Element>();

  function render(): string {
    return `
<section class="records-handoff" data-records-handoff>
  <details>
    <summary>Records archive</summary>
    <div class="records-handoff__content">
      <button type="button" data-role="prepare">Prepare</button>
      <div data-role="receipt" class="records-handoff__receipt"></div>
      <label class="records-handoff__approval">
        <input type="checkbox" data-role="approve" />
        I approve archiving this prepared receipt to Records.
      </label>
      <button type="button" data-role="archive" disabled>Archive to Records</button>
      <div data-role="status" role="status" aria-live="polite"></div>
      <div data-role="error" role="alert"></div>
      <div data-role="result" class="records-handoff__result"></div>
    </div>
  </details>
</section>`.trim();
  }

  function bind(root: HTMLElement): void {
    if (!root || boundRoots.has(root)) {
      return;
    }

    const el = getElements(root);
    if (!el) {
      return;
    }

    boundRoots.add(root);
    el.prepare.addEventListener('click', () => {
      void handlePrepare(el);
    });
    el.archive.addEventListener('click', () => {
      void handleArchive(el);
    });
    el.approve.addEventListener('change', () => {
      refreshControls(el);
    });
    refreshControls(el);
  }

  function getElements(root: HTMLElement): Elements | null {
    const prepare = root.querySelector<HTMLButtonElement>('[data-role="prepare"]');
    const archive = root.querySelector<HTMLButtonElement>('[data-role="archive"]');
    const approve = root.querySelector<HTMLInputElement>('[data-role="approve"]');
    const receipt = root.querySelector<HTMLElement>('[data-role="receipt"]');
    const status = root.querySelector<HTMLElement>('[data-role="status"]');
    const error = root.querySelector<HTMLElement>('[data-role="error"]');
    const result = root.querySelector<HTMLElement>('[data-role="result"]');

    if (!prepare || !archive || !approve || !receipt || !status || !error || !result) {
      return null;
    }

    return { prepare, archive, approve, receipt, status, error, result };
  }

  function refreshControls(el: Elements): void {
    el.prepare.disabled = busy;
    el.approve.disabled = busy;
    el.archive.disabled = busy || prepared === null || !el.approve.checked;
  }

  function clearMessages(el: Elements): void {
    el.status.textContent = '';
    el.error.textContent = '';
  }

  function setStatus(el: Elements, message: string): void {
    el.status.textContent = message;
  }

  function setError(el: Elements, message: string): void {
    el.error.textContent = message;
  }

  function errorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    if (typeof error === 'string' && error) {
      return error;
    }
    return 'The operation failed.';
  }

  function validateReceipt(value: unknown): ValidReceipt | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;
    const sha256 = record.sha256;
    const path = record.path;
    const sizeBytes = record.size_bytes;

    if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(sha256)) {
      return null;
    }
    if (typeof path !== 'string' || path.trim().length === 0) {
      return null;
    }
    if (
      typeof sizeBytes !== 'number' ||
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes < 0
    ) {
      return null;
    }

    return {
      sha256: sha256.toLowerCase(),
      path,
      size_bytes: sizeBytes,
    };
  }

  function formatPrepared(value: PreparedArchive): string {
    return [
      `SHA-256: ${value.sha256}`,
      `Path: ${value.path}`,
      `Size: ${value.sizeBytes} bytes`,
    ].join('\n');
  }

  function formatHandoffResult(value: unknown): string {
    const record =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};

    const fields: Array<[string, string]> = [
      ['tracking', 'Tracking'],
      ['records_request_id', 'Records request ID'],
      ['attachment_id', 'Attachment ID'],
      ['sha256', 'SHA-256'],
    ];

    const lines: string[] = [];
    for (const [key, label] of fields) {
      const field = record[key];
      if (field !== undefined && field !== null && field !== '') {
        lines.push(`${label}: ${String(field)}`);
      }
    }

    return lines.length > 0
      ? lines.join('\n')
      : 'Handoff completed; no tracking fields were returned.';
  }

  async function handlePrepare(el: Elements): Promise<void> {
    if (busy) {
      return;
    }

    clearMessages(el);
    el.result.textContent = '';
    el.receipt.textContent = '';
    el.approve.checked = false;
    prepared = null;

    const selection = getSelection();
    if (!selection) {
      setError(el, 'Select a record before preparing an archive.');
      refreshControls(el);
      return;
    }

    busy = true;
    refreshControls(el);
    setStatus(el, 'Preparing archive…');

    try {
      const response = await call('archive', { id: selection.id });
      const responseRecord =
        response && typeof response === 'object'
          ? (response as Record<string, unknown>)
          : null;
      const candidate =
        responseRecord && 'receipt' in responseRecord
          ? responseRecord.receipt
          : response;

      const receipt = validateReceipt(candidate);
      if (!receipt) {
        throw new Error(
          'Invalid archive receipt: sha256 must be 64 hex characters, path must be present, and size_bytes must be a non-negative integer.'
        );
      }

      prepared = {
        id: selection.id,
        revision: selection.revision,
        sha256: receipt.sha256,
        path: receipt.path,
        sizeBytes: receipt.size_bytes,
      };

      el.receipt.textContent = formatPrepared(prepared);
      setStatus(
        el,
        'Archive prepared. Review the receipt, approve, then archive to Records.'
      );
    } catch (error) {
      prepared = null;
      el.receipt.textContent = '';
      el.approve.checked = false;
      setStatus(el, '');
      setError(el, errorMessage(error));
    } finally {
      busy = false;
      refreshControls(el);
    }
  }

  async function handleArchive(el: Elements): Promise<void> {
    if (busy) {
      return;
    }

    clearMessages(el);
    el.result.textContent = '';

    if (!el.approve.checked) {
      setError(el, 'Explicit archive approval is required.');
      refreshControls(el);
      return;
    }

    const snapshot = prepared;
    if (!snapshot) {
      setError(el, 'Prepare an archive before archiving to Records.');
      refreshControls(el);
      return;
    }

    const selection = getSelection();
    if (
      !selection ||
      selection.id !== snapshot.id ||
      selection.revision !== snapshot.revision
    ) {
      prepared = null;
      el.receipt.textContent = '';
      el.approve.checked = false;
      setStatus(el, '');
      setError(
        el,
        'The current selection no longer matches the prepared archive. Prepare again.'
      );
      refreshControls(el);
      return;
    }

    busy = true;
    refreshControls(el);
    setStatus(el, 'Archiving to Records…');

    try {
      const response = await call('records', {
        id: snapshot.id,
        payload: {
          expected_revision: snapshot.revision,
          expected_sha25664: snapshot.sha256,
          confirm: true,
        },
      });

      const responseRecord =
        response && typeof response === 'object'
          ? (response as Record<string, unknown>)
          : {};
      const recordsRequestId = responseRecord.records_request_id;
      const attachmentId = responseRecord.attachment_id;
      const tracking = responseRecord.tracking;
      const responseSha = responseRecord.sha256;

      if (
        typeof recordsRequestId !== 'string' ||
        recordsRequestId.trim().length === 0 ||
        typeof attachmentId !== 'string' ||
        attachmentId.trim().length === 0 ||
        typeof tracking !== 'string' ||
        tracking.trim().length === 0 ||
        typeof responseSha !== 'string' ||
        responseSha.toLowerCase() !== snapshot.sha256.toLowerCase()
      ) {
        el.result.textContent =
          'Unverified result: the Records handoff response did not include valid tracking fields or matching SHA-256.';
        throw new Error(
          'Unverified result: the Records handoff response did not include valid tracking fields or matching SHA-256.'
        );
      }

      el.result.textContent = formatHandoffResult(response);
      if (openRecords) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Open in Records';
        button.addEventListener('click', () => {
          void (async () => {
            try {
              await openRecords(recordsRequestId);
            } catch (error) {
              setError(el, errorMessage(error));
            }
          })();
        });
        el.result.appendChild(button);
      }
      prepared = null;
      el.receipt.textContent = '';
      el.approve.checked = false;
      setStatus(el, 'Archive handed off to Records.');
    } catch (error) {
      prepared = null;
      el.receipt.textContent = '';
      el.approve.checked = false;
      setStatus(el, '');
      setError(el, errorMessage(error));
    } finally {
      busy = false;
      refreshControls(el);
    }
  }

  return { render, bind };
}