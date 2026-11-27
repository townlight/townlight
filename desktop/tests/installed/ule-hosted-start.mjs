import assert from 'assert';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';
import { signInUleActor } from './ule-actors.mjs';
import { prepareUleHosted } from './ule-hosted-setup.mjs';
import { readUleUpgrade } from './ule-upgrade-seed.mjs';
import { downloadRecordsAttachment } from './community-workflows.mjs';

export async function startUleHosted({ getPage, native, save, run, mode, output, fixtureRoot, portalBaseUrl }) {
  if (mode === 'ule') {
    const setup = await run('setup.js');
    assert.equal(setup.final.first_run.finished, true);
    await save('ule-setup', setup);
  }

  await signInUleActor(getPage(), createUleFixtureConfig().actors.administrator);

  if (mode === 'ule-upgrade') {
    const actualNative = await native('supervisor_action', { action: 'start', serviceId: null });
    assert.equal(actualNative.accepted, true);

    const seed = JSON.parse(await readFile(join(output, 'ule-upgrade-seed.json'), 'utf8'));
    await readUleUpgrade({
      native,
      ...seed,
      downloadRecordsAttachment,
      save,
      stage: 'after-upgrade'
    });
  }

  await getPage().evaluate(async () => {
    const a = window.audit;
    if ((await a.native('get_app_state')).domain_authority !== 'python-records') {
      await a.click('[data-surface="IT/Admin"]', { confirm: false });
      await a.nav('health');
      await a.click('[data-supervisor-action="activate-records"]', { timeout: 600000 });
      await a.until(async () => (await a.native('get_app_state')).domain_authority === 'python-records', 600000);
    }
  });

  return await prepareUleHosted({
    page: getPage(),
    getPage,
    native,
    save,
    fixtureRoot,
    portalBaseUrl
  });
}