// SPDX-License-Identifier: AGPL-3.0-only
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const input = await new Promise((resolve, reject) => {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { data += chunk; });
  process.stdin.on('end', () => resolve(JSON.parse(data)));
  process.stdin.on('error', reject);
});
const base = input.base_url;
const origin = new URL(base).origin;
const expectedReferer = origin + '/';
const { chromium } = await import(pathToFileURL(input.module).href);

let browser;
let sink;
let stage = 'lookup';
const fail = label => { throw new Error(label); };
try {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.setDefaultNavigationTimeout(20000);

  const submit = async (path, fill, action) => {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' });
    await fill(page);
    const [response] = await Promise.all([
      page.waitForResponse(r => r.request().method() === 'POST' && r.url().startsWith(base + action)),
      page.evaluate(() => document.querySelector('form').requestSubmit()),
    ]);
    const request = response.request();
    if (response.status() !== 200) fail(action + ' status');
    const headers = request.headers();
    if (headers.origin !== origin) fail(action + ' origin');
    if (headers.referer !== expectedReferer) fail(action + ' referer');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => /being processed/i.test(document.body.innerText), null, { timeout: 20000 });
  };

  stage = 'lookup';
  await submit('/service-requests/track/?sensitive=synthetic-marker', async page => {
    await page.fill('[name="tracking"]', 'TL311-11111111111141118111111111111111');
    await page.fill('[name="access_token"]', 'A'.repeat(43));
  }, '/service-requests/track/');

  stage = 'household';
  await submit('/parks/household/new/?session=synthetic-marker', async page => {
    await page.fill('[name="contact_name"]', 'Synthetic Resident');
    await page.fill('[name="email"]', 'resident@example.invalid');
    const language = page.locator('[name="language"]');
    if (await language.evaluate(el => el.tagName === 'SELECT')) await language.selectOption('en');
    else await language.fill('en');
  }, '/parks/household/new/');

  stage = 'cross-origin';
  const sinkReferer = new Promise(resolve => {
    sink = http.createServer((req, res) => { resolve(req.headers.referer || ''); res.end(); });
    sink.listen(0, '127.0.0.1');
  });
  const sinkPort = await new Promise(resolve => sink.once('listening', () => resolve(sink.address().port)));
  await page.goto(base + '/service-requests/track/?sensitive=synthetic-marker', { waitUntil: 'domcontentloaded' });
  const sinkUrl = `http://127.0.0.1:${sinkPort}/sink`;
  await page.evaluate(url => fetch(url, { mode: 'no-cors' }), sinkUrl);
  if (await sinkReferer !== expectedReferer) fail('cross-origin privacy');

  stage = 'same-origin';
  let sameOriginReferer = '';
  await page.route(base + '/policy-probe**', async route => {
    sameOriginReferer = route.request().headers().referer || '';
    await route.fulfill({ status: 200, body: '' });
  });
  await page.evaluate(() => fetch('/policy-probe'));
  if (sameOriginReferer !== expectedReferer) fail('same-origin privacy');

  console.log(JSON.stringify({ lookup: true, household: true, sameOriginPrivacy: true, crossOriginPrivacy: true }));
} catch (error) {
  console.error('resident form browser failed: ' + stage);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (sink) await new Promise(resolve => {
    if (typeof sink.closeAllConnections === 'function') sink.closeAllConnections();
    sink.close(resolve);
  });
}
