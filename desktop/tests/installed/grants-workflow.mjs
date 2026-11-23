export async function installedGrants({ page, native }) {
  const { createHash, randomUUID } = await import('node:crypto');
  const { readFile } = await import('node:fs/promises');
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const call = (operation, args = {}) => native('municipal_staff_request', { request: { operation, ...args } });

  const adopted = (await call('budget')).find(x => x.adopted_at);
  assert(adopted, 'adopted budget');
  const contract = (await call('contracts')).find(x => x.status === 'signed');
  assert(contract, 'signed contract');

  const records = await native('records_domain_request', {
    request: {
      operation: 'create',
      payload: {
        requester: 'Fixture',
        summary: 'Grants fixture',
        deadline: '2027-12-01',
        deadlineBasis: 'Fixture'
      }
    }
  });
  const recordsRequestId = records.request_id;
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(recordsRequestId), 'records request_id');

  const title = `Grants fixture ${randomUUID()}`;
  const base = {
    title,
    funding_area: 'Fixture',
    deadline: '2027-12-01',
    project_name: 'Fixture project',
    city_need: 'Fixture need',
    budget_revision_id: adopted.id,
    contract_id: contract.id,
    records_request_id: recordsRequestId
  };

  await page.evaluate(() => window.audit.nav('grants'));
  const form = page.locator('[data-create-grant]');
  await form.waitFor();
  const set = async (name, value) => {
    const field = form.locator(`[name="${name}"]`);
    if ((await field.evaluate(e => e.tagName)) === 'SELECT') await field.selectOption(String(value));
    else await field.fill(String(value));
  };
  for (const [name, value] of Object.entries(base)) await set(name, value);
  await form.getByRole('button', { name: 'Create grant', exact: true }).click();
  const status = page.getByText('Grant created.', {exact: true});
  await status.waitFor();
  assert((await status.innerText()).trim(), 'grant status');

  let bad;
  try {
    await call('create-grant', {
      payload: { ...base, title: `Bad ${title}`, records_request_id: randomUUID() }
    });
  } catch (error) {
    bad = error;
  }
  assert(bad && /invalid-input/.test(String(bad)), 'nonexistent Records request is rejected');

  const grants = await call('grants');
  const grant = grants.find(g => g.title === title);
  assert(grant, 'created grant');
  const id = grant.id;
  assert(grant.budget_revision_id === adopted.id, 'budget revision link');
  assert(grant.contract_id === contract.id, 'contract link');
  assert(grant.records_request_id === recordsRequestId, 'records request link');

  const assignee = (await call('grant-assignees'))[0];
  assert(assignee && assignee.id, 'grant assignee');
  await call('assign-grant', { id, payload: { user_id: assignee.id } });
  await call('review-grant', { id, payload: { note: 'Fixture review' } });
  await call('award-grant', {
    id,
    payload: {
      award_reference: `AWARD-${randomUUID()}`,
      award_amount_cents: 100000,
      report_due: '2028-01-01',
      reporting_frequency: 'quarterly'
    }
  });
  await call('report-grant', { id, payload: { note: 'Fixture report' } });
  await call('closeout-grant', { id, payload: {} });
  const archived = await call('archive-grant', { id });
  assert(typeof archived.manifest === 'string', 'archive manifest');
  assert(archived.sha256 === createHash('sha256').update(archived.manifest).digest('hex'), 'archive sha256');

  const manifest = JSON.parse(archived.manifest);
  assert(manifest.budget_revision_id === adopted.id, 'archive budget link');
  assert(manifest.contract_id === contract.id, 'archive contract link');
  assert(manifest.records_request_id === recordsRequestId, 'archive Records link');

  const closed = await call('get-grant', {id});
  assert(closed, 'closed grant');
  assert(closed.stage === 'closed', 'grant closed');
  assert(closed.assigned_to === assignee.id, 'grant assignment');
  assert(closed.last_actor, 'grant actor');
  assert(closed.workpapers.actions.some(action => action.action === "report" && action.actor_id), 'grant audit');
  assert(closed.budget_revision_id === adopted.id, 'closed budget revision');
  assert(closed.contract_id === contract.id, 'closed contract');
  assert(closed.records_request_id === recordsRequestId, 'closed records request');

  await page.evaluate(async () => {
    await window.audit.nav('home');
    await window.audit.nav('grants');
  });
  await page.getByRole('row').filter({hasText: title}).getByRole('button', {name: 'Open'}).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Download verified archive'}).click();
  const download = await downloadEvent;
  assert(createHash('sha256').update(await readFile(await download.path())).digest('hex') === archived.sha256,
    'downloaded archive SHA-256');
  return { scenario: 'grants', passed: true, id, sha256: archived.sha256 };
}