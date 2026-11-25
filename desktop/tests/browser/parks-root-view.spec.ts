import { test, expect, type Page } from '@playwright/test';

type RecordedCall = {
  operation: string;
  request: Record<string, unknown>;
};

async function installErrorCapture(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error instanceof Error ? error.message : String(error));
  });
  return errors;
}

async function bootParks(page: Page, isAdmin: boolean): Promise<void> {
  await page.route('**/parks-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );

  await page.goto('/parks-fixture');

  await page.evaluate(async ({ admin }) => {
    const w = window as any;
    w.calls = [] as RecordedCall[];
    w.openedRecords = null;
    w.options = { isAdmin: admin };

    const invoke = async (
      command: string,
      payload: { request: { operation: string } & Record<string, unknown> },
    ): Promise<unknown> => {
      if (command !== 'parks_request') {
        throw new Error(`Unexpected native command ${command}`);
      }

      const request = payload?.request;
      if (!request || typeof request.operation !== 'string') {
        throw new Error('parks_request envelope is missing request.operation');
      }

      w.calls.push({
        operation: request.operation,
        request: { ...request },
      });

      const operation = request.operation;

      if (operation === 'catalog-list') {
        if (request.kind === 'resource') {
          return [
            {
              id: 'res-1',
              snapshot: { name: 'Community Hall' },
            },
          ];
        }
        if (request.kind === 'program') {
          return [
            {
              id: 'prog-1',
              snapshot: { title: 'Summer Camp' },
            },
          ];
        }
        return [];
      }

      if (operation === 'bookings-list') {
        return [];
      }

      if (operation === 'sessions-list') {
        return [];
      }

      if (operation === 'list-participants') {
        return [];
      }

      if (operation === 'household-registrations') {
        return [];
      }

      if (operation === 'attachment-list') {
        return { items: [], overflow: false };
      }

      if (operation === 'obligation-receipt') {
        return {
          schema_version: 1,
          currency: 'USD',
          entity: {
            id: String(request.id ?? ''),
            entity_kind: 'booking',
            entity_id: String(request.id ?? ''),
            currency: 'USD',
            amount_cents: 5000,
            deposit_cents: 0,
          },
          ledger: [],
          totals: {
            paid_cents: 5000,
            refunded_cents: 0,
            net_paid_cents: 5000,
            balance_cents: 0,
            deposit_cents: 0,
          },
        };
      }

      if (operation.includes('payment-settings')) {
        return {
          configured: false,
          provider: null,
        };
      }

      throw new Error(`Unexpected parks operation ${operation}`);
    };

    const { createParksView } = await import('/src/parks/view.ts');

    const view = createParksView(invoke as any, {
      get isAdmin() {
        return Boolean(w.options.isAdmin);
      },
      openRecords: (id: string) => {
        w.openedRecords = id;
      },
      openServiceRequest: () => undefined,
    } as any);

    w.view = view;
    document.body.innerHTML = view.render();
    view.bind(document);
  }, { admin: isAdmin });
}

async function operations(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    ((window as any).calls as RecordedCall[]).map((entry) => entry.operation),
  );
}

async function findCall(
  page: Page,
  operation: string,
): Promise<RecordedCall | undefined> {
  return page.evaluate(
    (wanted) =>
      ((window as any).calls as RecordedCall[]).find(
        (entry) => entry.operation === wanted,
      ),
    operation,
  );
}

test('createParksView renders, binds through the real parks_request envelope, and loads initial catalog/bookings/sessions without JS errors', async ({
  page,
}) => {
  const errors = await installErrorCapture(page);
  await bootParks(page, false);

  await expect
    .poll(async () => operations(page))
    .toContain('catalog-list');

  expect(await operations(page)).not.toContain('bookings-list');
  expect(await operations(page)).not.toContain('sessions-list');

  await expect(page.locator('[data-booking-resource] option[value="res-1"]')).toHaveCount(1);
  await page.selectOption('[data-booking-resource]', 'res-1');

  await expect
    .poll(async () => operations(page))
    .toContain('bookings-list');

  await expect(page.locator('[data-session-program] option[value="prog-1"]')).toHaveCount(1);
  await page.selectOption('[data-session-program]', 'prog-1');

  await expect
    .poll(async () => operations(page))
    .toContain('sessions-list');

  const catalogCalls = await page.evaluate(() =>
    ((window as any).calls as RecordedCall[]).filter(
      (entry) => entry.operation === 'catalog-list',
    ),
  );

  expect(
    catalogCalls.some((entry) => entry.request.kind === 'resource'),
  ).toBe(true);
  expect(
    catalogCalls.some((entry) => entry.request.kind === 'program'),
  ).toBe(true);

  const initialSettingsCalls = await page.evaluate(() =>
    ((window as any).calls as RecordedCall[]).filter((entry) =>
      entry.operation.includes('payment-settings'),
    ),
  );
  expect(initialSettingsCalls).toHaveLength(0);

  await expect(page.locator('[data-parks-view]')).toBeVisible();
  await expect(page.locator('[data-resource-list]')).toBeVisible();
  await expect(page.locator('[data-program-list]')).toBeVisible();

  expect(errors).toEqual([]);
});

test('createParksView reads isAdmin dynamically after sign-in and only calls payment settings for the admin render', async ({
  page,
}) => {
  const errors = await installErrorCapture(page);
  await bootParks(page, false);

  await expect
    .poll(async () => operations(page))
    .toContain('catalog-list');

  await expect
    .poll(async () =>
      page.evaluate(() =>
        ((window as any).calls as RecordedCall[]).some((entry) =>
          entry.operation.includes('payment-settings'),
        ),
      ),
    )
    .toBe(false);

  await page.evaluate(() => {
    const w = window as any;
    w.options.isAdmin = true;
    document.body.innerHTML = w.view.render();
    w.view.bind(document);
  });

  await expect
    .poll(async () =>
      page.evaluate(() =>
        ((window as any).calls as RecordedCall[]).some((entry) =>
          entry.operation.includes('payment-settings'),
        ),
      ),
    )
    .toBe(true);

  await expect(page.locator('[data-parks-view]')).toBeVisible();

  expect(errors).toEqual([]);
});

test('createParksView does not double-bind controls when bind is called again for the same root', async ({
  page,
}) => {
  const errors = await installErrorCapture(page);
  await bootParks(page, false);

  await expect
    .poll(async () => operations(page))
    .toContain('catalog-list');
  await expect(page.locator('[data-parks-view]')).toBeVisible();

  const before = await page.evaluate(() => {
    const calls = (window as any).calls as RecordedCall[];
    return {
      resourceCatalogCalls: calls.filter(
        (entry) =>
          entry.operation === 'catalog-list' && entry.request.kind === 'resource',
      ).length,
      buttons: document.querySelectorAll('[data-parks-view] button').length,
    };
  });

  await page.evaluate(() => {
    (window as any).view.bind(document);
  });

  await page.waitForTimeout(100);

  const after = await page.evaluate(() => {
    const calls = (window as any).calls as RecordedCall[];
    return {
      resourceCatalogCalls: calls.filter(
        (entry) =>
          entry.operation === 'catalog-list' && entry.request.kind === 'resource',
      ).length,
      buttons: document.querySelectorAll('[data-parks-view] button').length,
    };
  });

  expect(after.resourceCatalogCalls).toBe(before.resourceCatalogCalls);
  expect(after.buttons).toBe(before.buttons);

  expect(errors).toEqual([]);
});

test('archive selection listens on the common parks root and uses the selected household for registrations', async ({
  page,
}) => {
  const errors = await installErrorCapture(page);
  await bootParks(page, false);

  await expect
    .poll(async () => operations(page))
    .toContain('catalog-list');

  await page.selectOption('[data-archive-kind]', 'registration');

  await page.evaluate(() => {
    const parksRoot = document.querySelector('[data-parks-view]');
    if (!parksRoot) {
      throw new Error('Expected common parks root for household selection event');
    }

    parksRoot.dispatchEvent(
      new CustomEvent('parks-household-selected', {
        detail: { id: 'hh-1' },
        bubbles: true,
        composed: true,
      }),
    );
  });

  await expect
    .poll(async () => findCall(page, 'household-registrations'))
    .toBeTruthy();

  const registrationCall = await findCall(page, 'household-registrations');
  expect(registrationCall?.request.household_id).toBe('hh-1');

  expect(errors).toEqual([]);
});

test('clearing private booking selection resets the finance selection without stale receipt state', async ({
  page,
}) => {
  const errors = await installErrorCapture(page);
  await bootParks(page, false);

  await expect
    .poll(async () => operations(page))
    .toContain('catalog-list');
  await expect(page.locator('[data-parks-view]')).toBeVisible();

  await page.evaluate(() => {
    const financeSelected = document.querySelector('[data-finance-selected]');
    if (!financeSelected) {
      throw new Error('Expected finance selection region');
    }

    financeSelected.dispatchEvent(
      new CustomEvent('parks-booking-selected', {
        detail: { obligation_id: 'ob-1' },
        bubbles: true,
        composed: true,
      }),
    );
  });

  await expect
    .poll(async () => findCall(page, 'obligation-receipt'))
    .toBeTruthy();

  const receiptCall = await findCall(page, 'obligation-receipt');
  expect(receiptCall?.request.id).toBe('ob-1');

  await expect(page.locator('[data-finance-selected]')).toContainText('ob-1');

  await page.evaluate(() => {
    const financeSelected = document.querySelector('[data-finance-selected]');
    if (!financeSelected) {
      throw new Error('Expected finance selection region');
    }

    financeSelected.dispatchEvent(
      new CustomEvent('selection-cleared', {
        bubbles: true,
        composed: true,
      }),
    );
  });

  await expect(page.locator('[data-finance-selected]')).toContainText(
    'No booking or registration selected.',
  );
  await expect(page.locator('[data-finance-selected]')).not.toContainText('ob-1');

  expect(errors).toEqual([]);
});
