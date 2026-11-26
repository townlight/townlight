import { test, expect } from '@playwright/test';
import { installedParksEnrollment } from '../installed/parks-enrollment.mjs';

test('drives installed parks enrollment against bound sessions UI', async ({ page }) => {
  test.setTimeout(20000);

  let program: any;
  let session: any;
  const households: any[] = [];
  const participants: any[] = [];
  const registrations: any[] = [];
  let hIndex = 0;
  let pIndex = 0;
  let saved: any;

  const native = async (operation: string, extra: any) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const payload = extra?.payload;
    const clone = <T,>(value: T): T => structuredClone(value);

    switch (operation) {
      case 'catalog-create': {
        program = { id: 'program', ...clone(payload.payload) };
        return clone(program);
      }
      case 'catalog-get':
        return clone(program);
      case 'catalog-list':
        return [clone(program)];
      case 'sessions-create': {
        session = { id: 'session', revision: 1, ...clone(payload) };
        return clone(session);
      }
      case 'sessions-get':
        return clone(session);
      case 'sessions-list':
        return [clone(session)];
      case 'households-create': {
        const household = { id: `h${hIndex++}`, ...clone(payload.payload) };
        households.push(household);
        return clone(household);
      }
      case 'create-participant': {
        const participant = {
          id: `p${pIndex++}`,
          ...clone(payload.payload),
          household_id: payload.household_id,
        };
        participants.push(participant);
        return clone(participant);
      }
      case 'registrations-create': {
        if (payload.expected_session_revision !== session.revision) {
          throw new Error('stale session revision');
        }
        const registration = {
          id: `r${registrations.length + 1}`,
          revision: 1,
          state: registrations.length === 0 ? 'confirmed' : 'waitlisted',
          ...clone(payload),
        };
        registrations.push(registration);
        session.revision++;
        return clone(registration);
      }
      case 'registrations-get': {
        const row = registrations.find((registration) => registration.id === extra.registration_id);
        return clone(row);
      }
      case 'registrations-cancel': {
        const original = registrations.find((registration) => registration.id === extra.registration_id);
        if (!original || original.revision !== payload.expected_revision) {
          throw new Error('stale registration revision');
        }
        original.state = 'cancelled';
        original.revision++;
        const second = registrations.find((registration) => registration.state === 'waitlisted');
        if (second) {
          second.state = 'confirmed';
          second.revision++;
        }
        session.revision++;
        return clone({ registration: original, promoted: second ? [second] : [] });
      }
      case 'registrations-check-in': {
        const row = registrations.find((registration) => registration.id === extra.registration_id);
        if (!row || row.revision !== payload.expected_revision || row.state !== 'confirmed') {
          throw new Error('registration not check-in ready');
        }
        row.checked_in_at = new Date().toISOString();
        row.revision++;
        return clone(row);
      }
      case 'sessions-roster': {
        const roster = registrations.map((registration) => {
          const participant = participants.find((item) => item.id === registration.participant_id);
          const household = households.find((item) => item.id === participant?.household_id);
          return {
            id: registration.id,
            revision: registration.revision,
            state: registration.state,
            checked_in_at: registration.checked_in_at,
            name: participant?.name,
            contact: { contact_name: household?.contact_name },
          };
        });
        return clone(roster);
      }
      default:
        throw new Error(`unexpected op: ${operation}`);
    }
  };

  await page.route('**/parks-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body></body></html>' }),
  );
  await page.goto('/parks-fixture');
  await page.exposeFunction('parksNative', native);
  await page.evaluate(async () => {
    const { renderSessions } = await import('/src/parks/sessions-render.ts');
    const { bindSessions } = await import('/src/parks/sessions.ts');
    const { bindEnrollment } = await import('/src/parks/enrollment.ts');

    document.body.innerHTML = renderSessions();
    const root = document.querySelector('section.parks-sessions') as HTMLElement;
    const ctx = {
      call: (op: string, extra: any) => (window as any).parksNative(op, extra),
      run: async (_label: string, task: () => Promise<any>) => task(),
      status: () => {},
    };

    bindEnrollment(root, ctx);
    const refresh = bindSessions(root, ctx);
    (window as any).audit = { click: async () => {}, nav: async () => refresh() };
  });

  const result = await installedParksEnrollment({
    page,
    native: async (command: string, { request }: any) => {
      expect(command).toBe('parks_request');
      const { operation, ...extra } = request;
      return native(operation, extra);
    },
    save: async (key: string, value: any) => {
      saved = { key, value };
    },
    householdId: 'existing-household',
  });

  expect(saved.key).toBe('parks-enrollment');
  expect(saved.value).toEqual(result);
  expect(Object.values(result.assertions).every(value => value === true)).toBe(true);
  expect(registrations).toHaveLength(2);
  expect(registrations[0].state).toBe('cancelled');
  expect(registrations[1].state).toBe('confirmed');
  expect(registrations[1].checked_in_at).toBeTruthy();
});
