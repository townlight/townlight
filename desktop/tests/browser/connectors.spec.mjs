import { expect, test } from '@playwright/test';

test('connector controls preserve partial coverage and require explicit canonical save', async ({ page }) => {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { renderConnectors, bindConnectors } = await import('/src/meetings/connectors.js');
    document.body.innerHTML = renderConnectors();
    window.connectorCalls = [];
    const source = { source_id: 's1', source: { provider: 'escribe', url: 'https://example.test/' } };
    const captured = { result_id: 'r1', status: 'partial', record_count: 1 };
    bindConnectors(document, { connector: async (operation, payload) => {
      window.connectorCalls.push({ operation, payload });
      if (operation === 'providers') return { status: 'completed', data: { providers: [source], formats: [{ connector: 'escribe', input_format: 'escribe-calendar-json', label: 'eSCRIBE' }] } };
      if (operation === 'sources') return { status: 'completed', data: { sources: [source], results: [captured], can_write: false } };
      if (operation === 'discover') return { status: 'partial', data: { result_id: 'r1' }, coverage: { failures: ['one page unavailable'] } };
      if (operation === 'preview') return { status: 'completed', data: { selections: [{ selection_id: 'p1', expected_sha256: 'a'.repeat(64), title: 'Council' }] } };
      return { status: 'completed', data: {} };
    } });
  });
  await expect(page.locator('[data-connector-status]')).toContainText('1 providers');
  await expect(page.locator('[value="plan_write"]')).toBeDisabled();
  await expect(page.locator('[value="save_meeting"]')).toBeDisabled();
  await page.locator('[value="discover"]').click();
  await expect(page.locator('[data-connector-status]')).toContainText('Coverage is incomplete');
  expect(await page.evaluate(() => window.connectorCalls.some(call => call.operation === 'save_meeting'))).toBe(false);
  await page.locator('[value="preview"]').click();
  await expect(page.locator('[value="save_meeting"]')).toBeEnabled();
  await page.locator('[value="save_meeting"]').click();
  const saved = await page.evaluate(() => window.connectorCalls.find(call => call.operation === 'save_meeting'));
  expect(saved.payload).toEqual({ selection_id: 'p1', expected_sha256: 'a'.repeat(64) });
  await page.locator('[value="export"]').click();
  expect(await page.evaluate(() => window.connectorCalls.find(call => call.operation === 'export').payload.format)).toBe('zip');
});

test('mock write commits only after the displayed plan is approved', async ({ page }) => {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { renderConnectors, bindConnectors } = await import('/src/meetings/connectors.js');
    document.body.innerHTML = renderConnectors();
    window.connectorCalls = [];
    bindConnectors(document, { connector: async (operation, payload) => {
      window.connectorCalls.push({ operation, payload });
      if (operation === 'providers') return { status: 'completed', data: { providers: [{}], formats: [{ connector: 'legistar', input_format: 'meeting-export', label: 'Legistar' }] } };
      if (operation === 'sources') return { status: 'completed', data: { sources: [{ source_id: 's1', source: { provider: 'legistar', url: 'https://example.test/' } }], results: [], can_write: true } };
      if (operation === 'plan_write') return { status: 'completed', data: { plan_id: 'plan1', plan_hash: 'b'.repeat(64) } };
      return { status: 'completed', data: {} };
    } });
  });
  await expect(page.locator('[value="plan_write"]')).toBeEnabled();
  await page.locator('[value="plan_write"]').click();
  await expect(page.locator('[name="plan_id"]')).toHaveValue('plan1');
  await page.locator('[value="commit_write"]').click();
  await expect(page.locator('[data-connector-status]')).toContainText('explicitly approve');
  expect(await page.evaluate(() => window.connectorCalls.some(call => call.operation === 'commit_write'))).toBe(false);
  await page.locator('[name="approve"]').check();
  await page.locator('[value="commit_write"]').click();
  const commit = await page.evaluate(() => window.connectorCalls.find(call => call.operation === 'commit_write'));
  expect(commit.payload).toEqual({ plan_id: 'plan1', plan_hash: 'b'.repeat(64) });
  await expect(page.locator('[name="approve"]')).not.toBeChecked();
});

test('account fetch preserves explicit namespace and provider fields', async ({ page }) => {
  await page.route('http://127.0.0.1:5174/', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('/');
  await page.evaluate(async () => {
    const { renderConnectors, bindConnectors } = await import('/src/meetings/connectors.js');
    document.body.innerHTML = renderConnectors();
    window.connectorCalls = [];
    bindConnectors(document, { connector: async (operation, payload) => {
      window.connectorCalls.push({ operation, payload });
      if (operation === 'providers') return { status: 'completed', data: { providers: [{}], formats: [{ connector: 'telvue', input_format: 'telvue-playlist-html', label: 'TelVue' }] } };
      if (operation === 'sources') return { status: 'completed', data: { sources: [{ source_id: 's1', source: { provider: 'telvue', url: 'https://connect.telvue.com' } }], results: [], can_write: false } };
      if (operation === 'configure_source') return { status: 'completed', data: { source_id: 's1' } };
      return { status: 'partial', data: {}, coverage: { schema_mapping: 'partial' } };
    } });
  });
  await expect(page.locator('[data-connector-status]')).toContainText('1 providers');
  await page.locator('[data-connector-config] [name="url"]').fill('https://connect.telvue.com');
  await page.locator('[data-connector-config] summary').click();
  await page.locator('[data-connector-config] [name="namespace"]').fill('fixture-account');
  await page.locator('[data-connector-config] [name="options"]').fill('{"tenant_hint":"synthetic"}');
  await page.locator('[data-connector-config] button[type="submit"]').click();
  await expect.poll(() => page.evaluate(() => window.connectorCalls.some(call => call.operation === 'configure_source'))).toBe(true);
  const configured = await page.evaluate(() => window.connectorCalls.find(call => call.operation === 'configure_source'));
  expect(configured.payload.source.namespace).toBe('fixture-account');
  expect(configured.payload.source.options).toEqual({ tenant_hint: 'synthetic' });
  await page.locator('[data-connector-work] summary').click();
  await page.locator('[name="fetch_options"]').fill('{"api_resource":"videos"}');
  await page.locator('[name="date_from"]').fill('2026-01-01');
  await page.locator('[value="fetch"]').click();
  await expect(page.locator('[data-connector-status]')).toContainText('Coverage is incomplete');
  const fetched = await page.evaluate(() => window.connectorCalls.find(call => call.operation === 'fetch'));
  expect(fetched.payload.fetch_options).toEqual({ api_resource: 'videos' });
  expect(fetched.payload.bounds).toEqual({});
});
