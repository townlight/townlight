import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { installedData } from './data-workflow.mjs';

assert.equal(process.platform, 'win32');
assert.equal(process.env.GITHUB_ACTIONS, 'true');
const publicOrigin = process.env.TOWNLIGHT_PUBLISHER_PUBLISH_ORIGIN;
assert.equal(publicOrigin, 'http://127.0.0.1:8871');

let receiver;
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', {timeout: 60_000});
const page = browser.contexts().flatMap(context => context.pages())
  .find(candidate => !candidate.url().startsWith('devtools:'));
assert(page, 'The installed Townlight WebView is absent');
const native = (command, args = {}) =>
  page.evaluate(async ({command, args}) => {
    try {
      return await window.__TAURI_INTERNALS__.invoke(command, args);
    } catch (error) {
      const detail = error && typeof error === 'object'
        ? [error.code, error.message].filter(value => value !== undefined && value !== null && value !== '').join(': ')
        : String(error);
      throw new Error(`${command}${detail ? `: ${detail}` : ''}`);
    }
  }, {command, args});

async function startPortal() {
  receiver = spawn('python', ['manage.py', 'runserver', '127.0.0.1:8871', '--noreload'], {
    cwd: new URL('../../../portal/', import.meta.url), stdio: 'inherit', windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    receiver.once('spawn', resolve);
    receiver.once('error', reject);
  });
  const deadline = Date.now() + 30_000;
  while (receiver.exitCode === null && Date.now() < deadline) {
    const response = await fetch(publicOrigin + '/datasets/', {signal: AbortSignal.timeout(2000)}).catch(() => null);
    if (response?.ok) return;
    await delay(500);
  }
  throw new Error('The disposable resident portal did not start');
}

try {
  await page.locator('.sidebar [data-area="home"]').waitFor({timeout: 600_000});
  await page.evaluate(await readFile(new URL('observer.js', import.meta.url), 'utf8'));
  const setup = await page.evaluate(await readFile(new URL('setup.js', import.meta.url), 'utf8'));
  assert(setup.final.first_run.finished, 'Installed setup did not complete');
  if ((await native('get_app_state')).domain_authority !== 'python-records') {
    const activation = await native('supervisor_action', {action: 'activate-records', serviceId: null});
    assert.equal(activation.accepted, true, activation.message);
  }
  const contractsDeadline = Date.now() + 30_000;
  let contractsError;
  while (Date.now() < contractsDeadline) {
    try {
      await native('municipal_staff_request', {request: {operation: 'contracts'}});
      contractsError = undefined;
      break;
    } catch (error) {
      contractsError = error;
      await delay(500);
    }
  }
  if (contractsError) throw contractsError;
  console.log(JSON.stringify(await installedData({page, native, startPortal, publicOrigin})));
} finally {
  await native('supervisor_action', {action: 'stop', serviceId: null}).catch(() => {});
  if (receiver?.exitCode === null) receiver.kill();
  await browser.close();
}
