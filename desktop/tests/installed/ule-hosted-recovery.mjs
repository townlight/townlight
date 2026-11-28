import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createUleFixtureConfig } from './ule-fixture-config.mjs';
import { signInUleActor } from './ule-actors.mjs';
import { verifyUleRecovery } from './ule-recovery.mjs';
import { downloadRecordsAttachment } from './community-workflows.mjs';

export async function recoverUleHosted({ getPage, native, save, output }) {
  const config = createUleFixtureConfig();

  const page = await getPage();
  await signInUleActor(page, config.actors.administrator);

  const start = await native('supervisor_action', { action: 'start', serviceId: null });
  assert.equal(start.accepted, true);

  const expected = JSON.parse(
    await readFile(join(output, 'ule-recovery.json'), 'utf8')
  );

  await verifyUleRecovery({
    native,
    expected,
    downloadRecordsAttachment,
    save,
    stage: 'after-desktop-and-services-restart'
  });

  const backup = await native('supervisor_action', { action: 'backup', serviceId: null });
  assert.equal(backup.accepted, true);

  const restore = await native('supervisor_action', { action: 'restore', serviceId: null });
  assert.equal(restore.action, 'restore');
  if (!restore.accepted) {
    assert.equal(restore.status, 'Restore needs service start');
  }

  const restarted = await native('supervisor_action', { action: 'start', serviceId: null });
  assert.equal(restarted.accepted, true);

  const pageAfterRestore = await getPage();
  await signInUleActor(pageAfterRestore, config.actors.administrator);

  await verifyUleRecovery({
    native,
    expected,
    downloadRecordsAttachment,
    save,
    stage: 'after-backup-restore'
  });

  await save('backup-restore', {
    passed: true,
    restore,
    services_restarted: true,
    records_read_back: true
  });

  const stop = await native('supervisor_action', { action: 'stop', serviceId: null });
  assert.equal(stop.accepted, true);

  await save('ule-recovery-complete', {
    passed: true,
    at: new Date().toISOString()
  });
}