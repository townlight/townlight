import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

export async function installedData({page, native, startPortal, publicOrigin}) {
  const call = (operation, args = {}) =>
    native('municipal_staff_request', {request: {operation, ...args}});
  const register = async title => (await call('register-contract', {payload: {
    title, vendor_name: 'Fixture Vendor', owner: 'PRIVATE OWNER', start_date: '2027-01-01',
    expiration_date: '2027-12-31', renewal_due: '2027-10-01', document_name: 'fixture.pdf',
    document_content: Buffer.from('%PDF-1.7\nPRIVATE PDF').toString('base64'),
  }})).id;
  const waitForJob = async (state, action) => {
    const deadline = Date.now() + 60_000;
    let job;
    do {
      job = (await call('data')).publications[0];
      if (job?.state === state && job.action === action) return job;
      if (job?.state === 'rejected') break;
      await delay(500);
    } while (Date.now() < deadline);
    throw new Error('Publication did not reach ' + state + ': ' + JSON.stringify(job));
  };
  const files = ['dataset.csv', 'dataset.json', 'data-dictionary.json'];
  const download = (job, file) => fetch(new URL('/datasets/' + job.meeting_id + '/' + file, publicOrigin), {
    signal: AbortSignal.timeout(5000),
  });

  const id = await register('Public Fixture');
  await page.evaluate(async () => {
    await window.audit.click('[data-surface="Staff"]', {confirm: false});
    await window.audit.nav('data');
  });
  await page.locator('[data-choice="' + id + '"]').check();
  await page.locator('[data-action="preview"]').click();
  await page.getByText('Preview ready', {exact: true}).waitFor();
  const preview = (await call('data')).revisions[0];
  const rows = (await call('review-data', {id: preview.id})).rows;
  assert.deepEqual(Object.keys(rows[0]).sort(), ['contract_id', 'expiration_date', 'start_date', 'title', 'vendor_name']);
  await page.locator('[data-role="confirm-publish"]').check();
  await page.locator('[data-action="publish"]').click();
  await waitForJob('retrying', 'publish');
  await startPortal();
  const first = await waitForJob('delivered', 'publish');
  const replay = await call('publish-data', {payload: {id: preview.id, expected_sha256: preview.sha256, confirm: true}});
  assert.equal(replay.sequence, first.sequence, 'Retry must preserve the delivery sequence');
  const correctedId = await register('Corrected Fixture');
  const correction = await call('preview-data', {payload: {agreement_ids: [correctedId]}});
  await call('publish-data', {payload: {id: correction.id, expected_sha256: correction.sha256, confirm: true}});
  const corrected = await waitForJob('delivered', 'publish');
  assert(corrected.sequence > first.sequence);
  for (const file of files) {
    const response = await download(corrected, file);
    assert.equal(response.status, 200, file);
    const text = await response.text();
    if (file !== 'data-dictionary.json') assert.match(text, /Corrected Fixture/);
    assert.doesNotMatch(text, /PRIVATE|renewal_due|Public Fixture/);
  }
  await call('withdraw-data', {payload: {confirm: true}});
  const withdrawn = await waitForJob('delivered', 'withdraw');
  for (const file of files) assert.equal((await download(withdrawn, file)).status, 404, file);
  return {passed: true, first: first.sequence, corrected: corrected.sequence, withdrawn: withdrawn.sequence};
}
