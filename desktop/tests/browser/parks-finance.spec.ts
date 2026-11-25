import { test, expect } from '@playwright/test';

async function gotoFixture(page: any): Promise<void> {
  await page.route('**/parks-fixture', (route: any) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body></body></html>',
    }),
  );
  await page.goto('/parks-fixture');
}

async function fieldValue(page: any, label: string): Promise<string | null> {
  return page.evaluate((wanted: string) => {
    const dts = Array.from(document.querySelectorAll('[data-finance-selected] dt'));
    const dt = dts.find((el) => el.textContent === wanted);
    return dt ? dt.nextElementSibling?.textContent ?? null : null;
  }, label);
}

async function currencyText(page: any, amount: number): Promise<string> {
  return page.evaluate(
    (value: number) =>
      new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(value),
    amount,
  );
}

test('finance binds actual obligation receipt, retains idempotency key through transport failure, refreshes authoritative totals, and clears private content', async ({ page }) => {
  await gotoFixture(page);

  await page.evaluate(async () => {
    const w = window as any;
    w.calls = [];
    w.receiptLoads = 0;
    w.failNextOfflinePayment = false;
    w.refundGetState = 'pending';
    w.preparePayload = null;
    w.receiptState = {
      currency: 'USD',
      entity: {
        entity_kind: 'booking',
        entity_id: 'bk-1',
        amount_cents: 12000,
        deposit_cents: 2000,
      },
      ledger: [
        {
          id: 'led-1',
          operation: 'payment',
          amount_cents: 12000,
          reference: 'ref-pay',
          created_at: '2024-05-01T10:00:00.000Z',
        },
      ],
      totals: {
        paid_cents: 12000,
        refunded_cents: 0,
        net_paid_cents: 12000,
        balance_cents: 0,
        deposit_cents: 2000,
      },
    };
    w.reconRows = [
      {
        obligation_id: 'obl-1',
        entity_kind: 'booking',
        entity_id: 'bk-1',
        currency: 'USD',
        amount_cents: 12000,
        paid_cents: 17000,
        refunded_cents: 2000,
        balance_cents: 0,
        created_at: '2024-05-01T10:00:00.000Z',
      },
      {
        obligation_id: 'obl-2',
        entity_kind: 'registration',
        entity_id: 'reg-9',
        currency: 'USD',
        amount_cents: 5000,
        paid_cents: 0,
        refunded_cents: 0,
        balance_cents: 5000,
        created_at: '2024-05-03T10:00:00.000Z',
      },
    ];

    const clone = (value: any) => JSON.parse(JSON.stringify(value));

    const invoke = async (op: string, extra: any = {}) => {
      w.calls.push({ op, extra: clone(extra) });

      if (op === 'obligation-receipt') {
        if (extra.id !== 'obl-1') throw new Error('Unexpected receipt id ' + extra.id);
        w.receiptLoads += 1;
        return clone(w.receiptState);
      }

      if (op === 'offline-payment') {
        if (extra.id !== 'obl-1') throw new Error('Unexpected payment id ' + extra.id);
        if (w.failNextOfflinePayment) {
          w.failNextOfflinePayment = false;
          throw new Error('simulated transport failure');
        }
        const payload = extra.payload;
        w.receiptState.ledger.push({
          id: 'led-2',
          operation: 'payment',
          amount_cents: payload.amount_cents,
          reference: payload.reference,
          created_at: '2024-05-02T10:00:00.000Z',
        });
        w.receiptState.totals.paid_cents += payload.amount_cents;
        w.receiptState.totals.net_paid_cents += payload.amount_cents;
        return { ok: true };
      }

      if (op === 'offline-refund') {
        if (extra.id !== 'obl-1') throw new Error('Unexpected refund id ' + extra.id);
        const payload = extra.payload;
        w.receiptState.ledger.push({
          id: 'led-3',
          operation: 'refund',
          amount_cents: payload.amount_cents,
          reference: payload.reference,
          created_at: '2024-05-04T10:00:00.000Z',
        });
        w.receiptState.totals.refunded_cents += payload.amount_cents;
        w.receiptState.totals.net_paid_cents -= payload.amount_cents;
        return { ok: true };
      }

      if (op === 'reconciliation') {
        return clone(w.reconRows);
      }

      if (op === 'refund-prepare') {
        w.preparePayload = clone(extra.payload);
        return { id: 'ref-1', state: 'pending' };
      }

      if (op === 'refund-get') {
        return { id: 'ref-1', state: w.refundGetState };
      }

      throw new Error('Unexpected native finance op ' + op);
    };

    const finance = await import('/src/parks/finance.ts');
    const render = await import('/src/parks/finance-render.ts');
    document.body.innerHTML = render.renderFinance(false);
    const root = document.querySelector('.finance-render') as HTMLElement;
    finance.bindFinance(root, {
      call: invoke,
      run: async (_label: string, task: () => Promise<any>) => await task(),
      status: () => {},
    });
  });

  await expect(page.locator('.finance-render')).toBeVisible();
  await expect(page.locator('[data-payment-settings]')).toHaveCount(0);

  const root = page.locator('.finance-render');
  const selected = root.locator('[data-finance-selected]');
  const receiptRows = root.locator('[data-finance-receipt-rows]');
  const ledgerSelect = root.locator('[data-payment-ledger]');

  await page.evaluate(() => {
    const el = document.querySelector('.finance-render') as HTMLElement;
    el.dispatchEvent(
      new CustomEvent('parks-booking-selected', { detail: { obligation_id: 'obl-1' } }),
    );
  });

  await expect.poll(() => page.evaluate(() => (window as any).receiptLoads)).toBe(1);
  await expect(selected).toContainText('obl-1');
  await expect(selected).toContainText('booking:bk-1');
  await expect(selected).toContainText('USD');
  expect(await fieldValue(page, 'Paid')).toBe(await currencyText(page, 120));
  expect(await fieldValue(page, 'Net paid')).toBe(await currencyText(page, 120));

  await expect(receiptRows.locator('tr')).toHaveCount(1);
  await expect(receiptRows.locator('tr').first().locator('td').nth(0)).toHaveText('led-1');
  await expect(receiptRows.locator('tr').first().locator('td').nth(3)).toHaveText('ref-pay');
  await expect(ledgerSelect.locator('option[value="led-1"]')).toHaveCount(1);

  const payForm = root.locator('form[data-offline-payment]');
  await payForm.getByLabel('Amount (cents)', { exact: true }).fill('5000');
  await payForm.getByLabel('Reference', { exact: true }).fill('offline-1');
  await page.evaluate(() => {
    (window as any).failNextOfflinePayment = true;
  });

  await payForm.getByRole('button', { name: 'Record offline payment' }).click();
  await expect(payForm.locator('.finance-status')).toHaveText('simulated transport failure');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).calls.filter((entry: any) => entry.op === 'offline-payment')
            .length,
      ),
    )
    .toBe(1);

  await expect(payForm.getByLabel('Amount (cents)', { exact: true })).toHaveValue('5000');
  await expect(payForm.getByLabel('Reference', { exact: true })).toHaveValue('offline-1');

  await payForm.getByRole('button', { name: 'Record offline payment' }).click();
  await expect(payForm.locator('.finance-status')).toHaveText('Payment recorded.');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).calls.filter((entry: any) => entry.op === 'offline-payment')
            .length,
      ),
    )
    .toBe(2);

  const paymentPayloads = await page.evaluate(() =>
    (window as any).calls
      .filter((entry: any) => entry.op === 'offline-payment')
      .map((entry: any) => entry.extra.payload),
  );
  expect(paymentPayloads).toHaveLength(2);
  expect(typeof paymentPayloads[0].idempotency_key).toBe('string');
  expect(paymentPayloads[0].idempotency_key.length).toBeGreaterThan(0);
  expect(paymentPayloads[1].idempotency_key).toBe(paymentPayloads[0].idempotency_key);
  expect(paymentPayloads[1].amount_cents).toBe(5000);
  expect(paymentPayloads[1].reference).toBe('offline-1');

  await expect.poll(() => page.evaluate(() => (window as any).receiptLoads)).toBe(2);
  await expect(receiptRows.locator('tr')).toHaveCount(2);
  expect(await fieldValue(page, 'Paid')).toBe(await currencyText(page, 170));
  await expect(ledgerSelect.locator('option[value="led-2"]')).toHaveCount(1);

  const refundForm = root.locator('form[data-offline-refund]');
  await refundForm.getByLabel('Amount (cents)', { exact: true }).fill('2000');
  await refundForm.getByLabel('Reference', { exact: true }).fill('offline-refund-1');
  await refundForm.getByRole('button', { name: 'Record offline refund' }).click();
  await expect(refundForm.locator('.finance-status')).toHaveText('Refund recorded.');

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).calls.filter((entry: any) => entry.op === 'offline-refund')
            .length,
      ),
    )
    .toBe(1);
  const refundPayload = await page.evaluate(
    () =>
      (window as any).calls.find((entry: any) => entry.op === 'offline-refund')?.extra
        .payload,
  );
  expect(refundPayload.amount_cents).toBe(2000);
  expect(refundPayload.reference).toBe('offline-refund-1');
  expect(typeof refundPayload.idempotency_key).toBe('string');

  await expect.poll(() => page.evaluate(() => (window as any).receiptLoads)).toBe(3);
  await expect(receiptRows.locator('tr')).toHaveCount(3);
  expect(await fieldValue(page, 'Refunded')).toBe(await currencyText(page, 20));
  expect(await fieldValue(page, 'Net paid')).toBe(await currencyText(page, 150));

  const hostedForm = root.locator('form[data-hosted-refund]');
  const refundStatus = root.locator('[data-refund-status]');
  await hostedForm.getByLabel('Payment ledger entry', { exact: true }).selectOption('led-2');
  await hostedForm.getByLabel('Amount (cents)', { exact: true }).fill('1000');
  await hostedForm.getByLabel('Reason', { exact: true }).fill('damaged');
  await hostedForm.getByRole('button', { name: 'Prepare hosted refund' }).click();

  await expect.poll(() => page.evaluate(() => Boolean((window as any).preparePayload))).toBe(true);
  const preparePayload = await page.evaluate(() => (window as any).preparePayload);
  expect(preparePayload.payment_ledger_id).toBe('led-2');
  expect(preparePayload.amount_cents).toBe(1000);
  expect(preparePayload.reason).toBe('damaged');
  expect(typeof preparePayload.command_key).toBe('string');
  expect(preparePayload.command_key.length).toBeGreaterThan(0);
  await expect(refundStatus).toContainText('pending');

  await page.evaluate(() => {
    (window as any).refundGetState = 'processing';
  });
  await root.getByRole('button', { name: 'Refresh pending refunds' }).click();
  await expect(refundStatus).toContainText('processing');
  expect(await page.evaluate(() => (window as any).receiptLoads)).toBe(3);

  await page.evaluate(() => {
    (window as any).refundGetState = 'succeeded';
  });
  await root.getByRole('button', { name: 'Refresh pending refunds' }).click();
  await expect(refundStatus).toContainText('succeeded');
  await expect.poll(() => page.evaluate(() => (window as any).receiptLoads)).toBe(4);

  await root.getByRole('button', { name: 'Refresh reconciliation' }).click();
  const reconBody = root.locator('[data-reconciliation]');
  const reconTable = page.locator('table', { has: page.locator('[data-reconciliation]') });
  await expect(reconBody.locator('tr')).toHaveCount(2);
  await expect(reconTable.locator('thead th')).toHaveText([
    'Obligation',
    'Entity',
    'Amount',
    'Paid',
    'Refunded',
    'Balance',
    'Created',
  ]);

  const firstReconRow = reconBody.locator('tr').nth(0);
  await expect(firstReconRow.locator('td')).toHaveCount(7);
  await expect(firstReconRow.locator('td').nth(0)).toHaveText('obl-1');
  await expect(firstReconRow.locator('td').nth(1)).toHaveText('booking:bk-1');
  expect(await firstReconRow.locator('td').nth(2).textContent()).toBe(
    await currencyText(page, 120),
  );
  expect(await firstReconRow.locator('td').nth(3).textContent()).toBe(
    await currencyText(page, 170),
  );
  expect(await firstReconRow.locator('td').nth(4).textContent()).toBe(
    await currencyText(page, 20),
  );
  expect(await firstReconRow.locator('td').nth(5).textContent()).toBe(
    await currencyText(page, 0),
  );
  const expectedCreated = await page.evaluate(() =>
    new Date('2024-05-01T10:00:00.000Z').toLocaleString(),
  );
  await expect(firstReconRow.locator('td').nth(6)).toHaveText(expectedCreated);

  const secondReconRow = reconBody.locator('tr').nth(1);
  await expect(secondReconRow.locator('td').nth(0)).toHaveText('obl-2');
  await expect(secondReconRow.locator('td').nth(1)).toHaveText('registration:reg-9');
  expect(await secondReconRow.locator('td').nth(5).textContent()).toBe(
    await currencyText(page, 50),
  );

  await page.evaluate(() => {
    const el = document.querySelector('.finance-render') as HTMLElement;
    el.dispatchEvent(new CustomEvent('selection-cleared'));
  });

  await expect(selected).toHaveText(/No booking or registration selected\./);
  await expect(selected).not.toContainText('obl-1');
  await expect(receiptRows.locator('tr')).toHaveCount(1);
  await expect(receiptRows.locator('tr td')).toHaveText('No receipt loaded.');
  await expect(ledgerSelect.locator('option')).toHaveCount(1);
  await expect(hostedForm.getByLabel('Amount (cents)', { exact: true })).toHaveValue('');
  await expect(refundStatus).toHaveText('');
  await expect(page.locator('body')).not.toContainText('led-2');
  await expect(page.locator('body')).not.toContainText('ref-pay');
});

test('admin payment settings refresh exposes only safe fields and a failed save never renders the typed secret', async ({ page }) => {
  await gotoFixture(page);

  await page.evaluate(async () => {
    const w = window as any;
    w.settingsCalls = [];
    w.runLabels = [];
    w.putFails = true;
    w.lastPutPayload = null;
    w.settingsState = { enabled: true, mode: 'live', has_secret: true };

    const clone = (value: any) => JSON.parse(JSON.stringify(value));

    const invoke = async (op: string, extra: any = {}) => {
      w.settingsCalls.push({ op, extra: clone(extra) });

      if (op === 'payment-settings-get') {
        return {
          ...w.settingsState,
          provider: 'stripe',
          secret_key: 'sk_live_should_not_render',
          secret_configured: false,
        };
      }

      if (op === 'payment-settings-put') {
        w.lastPutPayload = clone(extra.payload);
        if (w.putFails) {
          throw new Error(
            'upstream echoed ' + (extra.payload?.secret_key ?? '') + ' in failure',
          );
        }
        return { ok: true };
      }

      throw new Error('Unexpected payment settings op ' + op);
    };

    const settings = await import('/src/parks/payment-settings.ts');
    const render = await import('/src/parks/finance-render.ts');
    document.body.innerHTML = render.renderFinance(true);
    const root = document.querySelector('.finance-render') as HTMLElement;
    settings.bindPaymentSettings(root, {
      call: invoke,
      run: async (label: string, task: () => Promise<any>) => {
        w.runLabels.push(label);
        return await task();
      },
      status: () => {},
    });
  });

  await expect(page.locator('.finance-render')).toBeVisible();
  expect(await page.evaluate(() => (window as any).settingsCalls.length)).toBe(0);

  const root = page.locator('.finance-render');
  const settingsForm = root.locator('[data-payment-settings]');
  const enabled = settingsForm.getByLabel('Enable online payments', { exact: true });
  const secret = settingsForm.getByLabel('Stripe secret key', { exact: true });
  const status = root.locator('[data-payment-settings-status]');

  await root.getByRole('button', { name: 'Refresh settings' }).click();
  await expect(status).toHaveText('Online payments enabled. Mode: live. Secret configured.');
  await expect(enabled).toBeChecked();
  await expect(secret).toHaveValue('');
  await expect(root).not.toContainText('sk_live_should_not_render');

  expect(
    await page.evaluate(() =>
      (window as any).settingsCalls.filter((entry: any) => entry.op === 'payment-settings-get')
        .length,
    ),
  ).toBe(1);

  await secret.fill('sk_test_123');
  await expect(secret).toHaveValue('sk_test_123');
  await settingsForm.getByRole('button', { name: 'Save payment settings' }).click();

  await expect(status).toHaveText('Could not save payment settings.');
  await expect(secret).toHaveValue('');
  await expect(enabled).toBeChecked();
  await expect(status).not.toContainText('sk_test_123');
  await expect(page.locator('body')).not.toContainText('sk_test_123');

  const putPayload = await page.evaluate(() => (window as any).lastPutPayload);
  expect(putPayload).toEqual({
    enabled: true,
    clear_secret: false,
    secret_key: 'sk_test_123',
  });

  expect(
    await page.evaluate(() =>
      (window as any).settingsCalls.filter((entry: any) => entry.op === 'payment-settings-put')
        .length,
    ),
  ).toBe(1);
  expect(await page.evaluate(() => (window as any).runLabels)).toEqual([
    'payment-settings-refresh',
    'payment-settings-save',
  ]);
});
