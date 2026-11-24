import assert from 'node:assert/strict';

export async function clerkWorkflows({ page, native, save, meetingId }) {
  const meetingTitle = 'Synthetic Boards linkage meeting';
  const meetings = request => native('meetings_domain_request', { request });
  const code = request => native('code_domain_request', { request });
  const nav = area => page.locator('.sidebar [data-area="' + area + '"]').click();
  const title = 'Synthetic ordinance workflow';
  const items = [];
  for (const title of ['Synthetic first agenda item', 'Synthetic second agenda item']) {
    const item = await meetings({ operation: 'create-agenda-item', payload: { title, department_name: 'Clerk' } });
    assert(item.id, 'Agenda item was not saved');
    items.push(item);
  }

  await page.locator('[data-surface="Staff"]').click();
  await nav('meetings');
  const clerk = page.locator('[data-clerk-workspace]');
  await clerk.getByLabel('Search meetings').fill('Synthetic Boards linkage');
  await clerk.getByRole('button', { name: 'Search', exact: true }).click();
  const meetingChoice = clerk.getByLabel('Saved meeting');
  await meetingChoice.locator('option', { hasText: meetingTitle }).waitFor({ state: 'attached' });
  await meetingChoice.selectOption({ label: await meetingChoice.locator('option', { hasText: meetingTitle }).textContent() });
  assert.equal(await meetingChoice.inputValue(), meetingId);
  const agendaChoice = clerk.getByLabel('Unassigned agenda item');
  for (const item of items) {
    await agendaChoice.selectOption({ label: item.title });
    await clerk.getByRole('button', { name: 'Place on this agenda' }).click();
    await clerk.locator('[aria-live="polite"]').filter({ hasText: 'Agenda item assigned' }).waitFor();
  }
  const packetOrder = clerk.getByLabel('Packet order (top to bottom)');
  await packetOrder.selectOption({ label: items[1].title });
  await clerk.getByRole('button', { name: 'Move up' }).press('Enter');
  await clerk.getByRole('button', { name: 'Save packet' }).click();
  await clerk.locator('[aria-live="polite"]').filter({ hasText: 'Saved packet with 2 agenda items.' }).waitFor();
  const proceedings = await meetings({ operation: 'get-proceedings', id: meetingId });
  const packet = proceedings.packets.find(p => JSON.stringify(p.agenda_item_ids) === JSON.stringify([items[1].id, items[0].id]));
  assert(packet, 'Saved packet does not contain the selected items in the confirmed order');

  await clerk.getByRole('button', { name: 'Deliver saved packet files' }).click();
  await clerk.locator('[aria-live="polite"]').filter({ hasText: 'Saved packet files delivered' }).waitFor();
  const delivered = await meetings({ operation: 'get-proceedings', id: meetingId });
  assert(delivered.packets.find(p => p.id === packet.id)?.delivery_history.length, 'Packet delivery is not recorded');

  const fixture = {
    job_id: 'synthetic_clerk_code', connector_type: 'csv_bundle',
    source: { source_id: 'clerk_code_export', name: 'Synthetic City Clerk export', publisher: 'City Clerk',
      source_type: 'official_file_drop', source_category: 'municipal_code', file_reference: 'file-drop/synthetic.csv',
      retrieved_at: '2026-04-27T12:00:00Z', retrieval_method: 'official_file_drop', source_owner: 'City Clerk',
      is_official: true, status: 'active' },
    titles: [{ title_id: 'clerk_title', title_number: '6', title_name: 'Animals', sort_order: 6 }],
    chapters: [{ chapter_id: 'clerk_chapter', title_id: 'clerk_title', chapter_number: '6.12', chapter_name: 'Urban Livestock', sort_order: 12 }],
    sections: [{ section_id: 'clerk_section', chapter_id: 'clerk_chapter', section_number: '6.12.040', section_heading: 'Backyard chickens', sort_order: 40 }],
    versions: [{ version_id: 'clerk_initial_version', section_id: 'clerk_section', source_id: 'clerk_code_export',
      version_label: 'Synthetic base version', body: 'Residents may keep six backyard chickens.', effective_start: '2026-01-01', effective_end: '2026-11-30',
      status: 'adopted', is_current: true }],
    provenance: { fixture_name: 'clerk-workflows.mjs', retrieval_method: 'official_file_drop' },
  };
  await code({ operation: 'import', payload: fixture });
  await nav('code');
  await page.getByText('Ordinance proposals and meeting decisions', { exact: true }).click();
  const proposal = page.locator('[data-code-action="sendProposal"]');
  const section = proposal.getByLabel('Current code section');
  await section.selectOption({ label: '6.12.040 · Backyard chickens · Synthetic base version' });
  const codeMeetingChoice = proposal.locator('select[name="meeting_id"]');
  await codeMeetingChoice.locator('option', { hasText: meetingTitle }).waitFor({ state: 'attached' });
  await codeMeetingChoice.selectOption({ label: await codeMeetingChoice.locator('option', { hasText: meetingTitle }).textContent() });
  await proposal.getByLabel('Title', { exact: true }).fill(title);
  await proposal.getByLabel('Ordinance number').fill('SYN-001');
  const proposed = 'Residents may keep seven backyard chickens.';
  await proposal.getByLabel('Proposed text').fill(proposed);
  await proposal.getByRole('button', { name: 'Send proposal to Meetings' }).click();
  await page.locator('[data-code-output]').filter({ hasText: 'Awaiting a recorded decision.' }).waitFor();
  await page.getByRole('button', { name: 'Open this proposal in Meetings' }).click();
  // The proposal list can populate before the handoff finishes opening the
  // proposal and its meeting. Wait for the action rendered by that handoff.
  const openInCode = page.locator('[data-meetings-links]').getByRole('button', { name: 'Open this proposal in Code' });
  await openInCode.waitFor();
  const decision = page.locator('[data-meetings-action="recordCodeDecision"]');
  const decisionProposal = decision.getByLabel('Proposal for this decision');
  await decisionProposal.selectOption({ label: title });
  const proposalId = await decisionProposal.inputValue();
  await decision.getByLabel('Outcome').selectOption({ label: 'Adopted' });
  const vote = 'Council adopted the ordinance.';
  await decision.getByLabel('Decision text').fill(vote);
  const decisionStatus = page.locator('[data-meetings-status]');
  try {
    await decision.getByRole('button', { name: 'Record Code decision' }).click();
    await decisionStatus.filter({ hasText: 'Decision: adopted' }).waitFor();
  } catch (error) {
    const savedDecision = await meetings({ operation: 'code-connection', id: proposalId })
      .then(result => ({
        current_decision_id: result.current_decision_id,
        outcome: result.decisions.find(item => item.input.id === result.current_decision_id)?.input.outcome,
      }))
      .catch(cause => ({ read_error: String(cause) }));
    await save('installed-clerk-decision-failure', {
      error: String(error), proposalId, savedDecision,
      status: await decisionStatus.textContent({ timeout: 1000 }).catch(() => null),
    });
    throw error;
  }
  await openInCode.click();
  const close = page.locator('[data-code-action="closeConnection"]');
  await close.getByLabel('Recorded adoption').selectOption({ label: vote });
  await close.getByLabel('Codification source').selectOption({ label: fixture.source.name });
  await close.getByLabel('Version label').fill('Synthetic adopted version');
  await close.getByLabel('Codified body').fill(proposed);
  await close.getByLabel('Effective start').fill('2026-12-01');
  await close.getByRole('button', { name: 'Record codification closeout' }).click();
  await page.locator('[data-code-output]').filter({ hasText: 'Codification recorded' }).waitFor();
  const id = await close.getByLabel('Proposal to codify').inputValue();
  const saved = await code({ operation: 'connection', id });
  assert.equal(saved.proposal.meeting_id, meetingId);
  assert.equal(saved.decisions.find(d => d.input.id === saved.current_decision_id).input.outcome, 'adopted');
  assert(saved.closeout, 'Codification closeout was not saved');
  await save('installed-clerk-workflows', { passed: true, meetingId, packet, saved });
}

