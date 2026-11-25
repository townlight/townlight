import { bindSessionSelection, type SessionSelectionContext } from './session-selection.ts';
import { validatePair } from './occurrence-dates.ts';

type Row = Record<string, unknown>;

export interface SessionsContext extends SessionSelectionContext {
  status?: (message: string) => void;
}

function isRecord(value: unknown): value is Row {
  return typeof value === 'object' && value !== null;
}

function rowId(row: Row): string {
  const id = row.id ?? row.session_id;
  return id == null ? '' : String(id);
}

function rowDate(row: Row, key: string): string {
  const value = row[key];
  return value == null ? '' : String(value);
}

function readExpectedRevision(row: Row): number {
  const value = row.expected_revision ?? row.revision;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Selected session is missing a valid revision');
  }
  return value;
}

function readValue(form: HTMLFormElement, name: string): string {
  const field = form.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    `[name="${name}"]`,
  );
  return field ? field.value : '';
}

function parseCapacity(raw: string): number {
  const text = raw.trim();
  if (text === '') {
    throw new Error('Capacity is required');
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100000) {
    throw new Error('Capacity must be a whole number from 1 to 100000');
  }
  return value;
}

function parseFeeCents(raw: string): number {
  const text = raw.trim();
  if (text === '') {
    throw new Error('Fee in cents is required');
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Fee in cents must be a whole number greater than or equal to 0');
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notify(ctx: SessionsContext, message: string): void {
  if (typeof ctx.status === 'function') {
    ctx.status(message);
  }
}

function dispatchRefresh(
  root: HTMLElement | Document | DocumentFragment,
  id: unknown,
): void {
  root.dispatchEvent(
    new CustomEvent('parks-session-refresh', {
      detail: { id },
      bubbles: true,
    }),
  );
}

export function bindSessions(
  root: HTMLElement | Document | DocumentFragment,
  ctx: SessionsContext,
): () => Promise<void> {
  const selection = bindSessionSelection(root, ctx);
  const programSelect = root.querySelector<HTMLSelectElement>('[data-session-program]');
  const createForm = root.querySelector<HTMLFormElement>('[data-session-create]');
  const editForm = root.querySelector<HTMLFormElement>('[data-session-edit]');

  if (createForm) {
    createForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement | null;
      if (!form) {
        return;
      }

      void ctx.run('Create session', async () => {
        try {
          const programId = programSelect?.value ?? '';
          if (!programId) {
            throw new Error('Select a program before creating a session');
          }

          const pair = validatePair(
            readValue(form, 'starts_at'),
            readValue(form, 'ends_at'),
          );
          const capacity = parseCapacity(readValue(form, 'capacity'));
          const feeCents = parseFeeCents(readValue(form, 'fee_cents'));
          const currency = readValue(form, 'currency').trim();
          if (!currency) {
            throw new Error('Currency is required');
          }

          const created = await ctx.call('sessions-create', {
            payload: {
              program_id: programId,
              starts_at: pair.starts_at,
              ends_at: pair.ends_at,
              capacity,
              fee_cents: feeCents,
              currency,
            },
          });

          if (!isRecord(created) || created.id == null || String(created.id).trim() === '') {
            throw new Error('Session was created without an id');
          }

          form.reset();
          dispatchRefresh(root, created.id);
          notify(ctx, 'Session created');
        } catch (error) {
          notify(ctx, errorMessage(error));
        }
      });
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement | null;
      if (!form) {
        return;
      }

      void ctx.run('Save session', async () => {
        try {
          const selected = selection.getSelected();
          if (!selected || !isRecord(selected)) {
            throw new Error('Select a session before saving');
          }

          const sessionId = rowId(selected);
          if (!sessionId) {
            throw new Error('Selected session is missing an id');
          }

          const payload: Record<string, unknown> = {
            expected_revision: readExpectedRevision(selected),
          };

          const capacityRaw = readValue(form, 'capacity').trim();
          if (capacityRaw !== '') {
            payload.capacity = parseCapacity(capacityRaw);
          }

          const stateRaw = readValue(form, 'state').trim();
          if (stateRaw !== '') {
            payload.state = stateRaw;
          }

          const startsRaw = readValue(form, 'starts_at').trim();
          const endsRaw = readValue(form, 'ends_at').trim();
          if (startsRaw !== '' || endsRaw !== '') {
            const effectiveStart = startsRaw || rowDate(selected, 'starts_at');
            const effectiveEnd = endsRaw || rowDate(selected, 'ends_at');
            if (!effectiveStart || !effectiveEnd) {
              throw new Error('Current session start and end dates are required');
            }
            validatePair(effectiveStart, effectiveEnd);
            if (startsRaw !== '') {
              payload.starts_at = startsRaw;
            }
            if (endsRaw !== '') {
              payload.ends_at = endsRaw;
            }
          }

          await ctx.call('sessions-update', {
            session_id: sessionId,
            payload,
          });

          dispatchRefresh(root, sessionId);
          notify(ctx, 'Session saved');
        } catch (error) {
          notify(ctx, errorMessage(error));
        }
      });
    });
  }

  return selection.refresh;
}
