import assert from 'node:assert';
import { requestUleLibraryPostExit } from './ule-host-control.mjs';
import { connectUleDesktop } from './ule-hosted-connect.mjs';
import { signInUleActor } from './ule-actors.mjs';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';

export async function reconnectUleAfterLibrary({ pending, getBrowser, setBrowser, setPage, native, run }) {
  const receipt = await requestUleLibraryPostExit(pending);

  try {
    await getBrowser().close();
  } catch {
    // The previous connection is already retired.
  }

  const browser = await connectUleDesktop();
  setBrowser(browser);

  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => !candidate.url().startsWith('devtools:'));

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