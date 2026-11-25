import { renderParks } from './render.ts';
import { bindCatalog } from './catalog.ts';
import { bindHouseholds } from './households.ts';
import { bindParticipants } from './participants.ts';
import { bindReservations } from './reservations.ts';
import { bindAvailability } from './availability.ts';
import { bindSessions } from './sessions.ts';
import { bindEnrollment } from './enrollment.ts';
import { bindFinance } from './finance.ts';
import { bindPaymentSettings } from './payment-settings.ts';
import { bindArchiveSelection } from './archive-selection.ts';
import { bindRecordsHandoff } from './records-handoff.ts';
import { bindAttachments } from './attachments.ts';
import { bindMaintenance } from './maintenance.ts';
import { bindParksData } from './data-publication.ts';

type Task = () => unknown;

type Invoke = (
  command: string,
  payload: { request: { operation: string } & Record<string, unknown> },
) => Promise<unknown>;

export type ParksViewOptions = {
  isAdmin?: boolean;
  openRecords?: (id: string) => unknown;
  openServiceRequest?: (id: string) => unknown;
};

type Run = {
  (task: Task): Promise<unknown>;
  (label: string, task: Task): Promise<unknown>;
};

export type ParksViewContext = {
  run: Run;
  call: (operation: string, extra?: Record<string, unknown>) => Promise<unknown>;
  status: (message: string) => void;
  isAdmin: boolean;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  try {
    return String(error);
  } catch {
    return 'Unexpected error';
  }
}

function setStatus(root: HTMLElement, text: string): void {
  const status = root.querySelector<HTMLElement>('[data-parks-status]');
  if (status) {
    status.textContent = text;
  }
}

function createContext(root: HTMLElement, invoke: Invoke, isAdmin: boolean): ParksViewContext {
  let pending = 0;
  const disabledButtons = new Map<HTMLButtonElement, boolean>();

  const changePending = (delta: number): void => {
    const wasPending = pending > 0;
    pending += delta;
    if (pending < 0) pending = 0;

    if (!wasPending && pending > 0) {
      root.querySelectorAll('button').forEach((button) => {
        disabledButtons.set(button, button.disabled);
        button.disabled = true;
      });
    } else if (wasPending && pending === 0) {
      disabledButtons.forEach((wasDisabled, button) => {
        button.disabled = wasDisabled;
      });
      disabledButtons.clear();
    }
  };

  const perform = async (label: string, task: Task): Promise<unknown> => {
    changePending(1);
    setStatus(root, label);

    try {
      return await task();
    } catch (error) {
      setStatus(root, errorMessage(error));
      throw error;
    } finally {
      changePending(-1);
    }
  };

  const run = ((labelOrTask: string | Task, maybeTask?: Task): Promise<unknown> => {
    if (typeof labelOrTask === 'string') {
      if (typeof maybeTask !== 'function') return Promise.resolve(undefined);
      return perform(labelOrTask, maybeTask);
    }

    return perform(labelOrTask.name || 'parks', labelOrTask);
  }) as Run;

  const call = async (
    operation: string,
    extra: Record<string, unknown> = {},
  ): Promise<unknown> => {
    const response = await invoke('parks_request', {
      request: {
        operation,
        ...(extra ?? {}),
      },
    });

    if (response && typeof response === 'object' && 'result' in response) {
      return (response as { result?: unknown }).result;
    }

    return response;
  };

  return {
    run,
    call,
    isAdmin,
    status: (message: string) => setStatus(root, message),
  };
}

export function createParksView(invoke: Invoke, options: ParksViewOptions = {}) {
  const boundRoots = new WeakSet<Element>();

  const render = () => renderParks(Boolean(options.isAdmin));

  const bind = (parent: ParentNode = document): void => {
    const maybeElement = parent as Element;
    const root =
      typeof maybeElement.matches === 'function' &&
      maybeElement.matches('[data-parks-view]')
        ? (parent as HTMLElement)
        : parent.querySelector<HTMLElement>('[data-parks-view]');

    if (!root || boundRoots.has(root)) return;
    boundRoots.add(root);

    const isAdmin = Boolean(options.isAdmin);
    const ctx = createContext(root, invoke, isAdmin);

    const catalog = bindCatalog(root, ctx);
    bindHouseholds(root, ctx);
    bindParticipants(root, ctx);

    const reservations = bindReservations(root, ctx);
    bindAvailability(root, ctx);

    const sessions = bindSessions(root, ctx);
    bindEnrollment(root, ctx);
    bindFinance(root, ctx);

    bindRecordsHandoff(root, ctx, { openRecords: options.openRecords });
    bindAttachments(root, ctx);
    bindParksData(root, ctx);
    bindMaintenance(root, ctx, {
      requestCall: async (operation: string, extra: Record<string, unknown> = {}) => {
        const reply = await invoke('service_requests_request', {
          request: { operation, ...extra },
        });
        if (reply && typeof reply === 'object' && 'result' in reply) {
          return (reply as { result?: unknown }).result;
        }
        return reply;
      },
      openServiceRequest: options.openServiceRequest,
    });

    const paymentSettings = bindPaymentSettings(root, ctx);
    bindArchiveSelection(root, ctx);

    const start = async (): Promise<void> => {
      await catalog?.refresh?.();
      await reservations?.refresh?.();
      await sessions?.();

      if (isAdmin) {
        await paymentSettings?.refresh?.();
      }
    };

    void start().catch((error) => {
      setStatus(root, errorMessage(error));
    });
  };

  return { render, bind };
}
