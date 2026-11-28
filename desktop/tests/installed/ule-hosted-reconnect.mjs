import assert from 'node:assert';
import { requestUleLibraryPostExit } from './ule-host-control.mjs';
import { connectUleDesktop } from './ule-hosted-connect.mjs';
import { signInUleActor } from './ule-actors.mjs';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';
import { setTimeout as delay } from 'node:timers/promises';

export async function waitForUleDesktopPage(browser, { timeout = 120000, poll = 250 } = {}) {
  const deadline = Date.now() + timeout;

  for (;;) {
    const observed = browser
      .contexts()
      .flatMap((context) => context.pages())
      .filter((candidate) => !candidate.isClosed())
      .map((candidate) => ({ page: candidate, url: candidate.url() }));

    const page = observed.find(({ url }) => !url.startsWith('devtools:'))?.page;
    if (page) {
      return page;
    }

    if (Date.now() >= deadline) {
      const urls = observed.map(({ url }) => url);
      throw new Error(
        `Expected an active browser page after reconnecting ULE desktop; observed pages: ${urls.length ? urls.join(', ') : '(none)'}`,
      );
    }

    await delay(poll);
  }
}

export async function reconnectUleAfterLibrary({ pending, getBrowser, setBrowser, setPage, native, run }) {
  const receipt = await requestUleLibraryPostExit(pending);

  try {
    await getBrowser().close();
  } catch {
    // The previous connection is already retired.
  }

  const browser = await connectUleDesktop();
  setBrowser(browser);

  const page = await waitForUleDesktopPage(browser);

  assert.ok(page, 'Expected an active browser page after reconnecting ULE desktop');
  setPage(page);

  await page.locator('.sidebar [data-area="home"]').waitFor({ state: 'visible', timeout: 600000 });
  await run('observer.js');
  await signInUleActor(page, createUleFixtureConfig().actors.communicationsApprover);

  await page.evaluate(async () => {
    await window.audit.click('[data-surface="Staff"]', { confirm: false });
    await window.audit.nav('communications');
  });

  await page.locator('[data-comms-view]').waitFor({ state: 'visible' });

  return { ...receipt, page, native };
}