import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export async function prepareBudget({ native }) {
  const call = (operation, args = {}) =>
    native('municipal_staff_request', { request: { operation, ...args } });

  // 1. Snapshot the current revision count.
  const initial = await call('budget');
  assert.ok(Array.isArray(initial), 'budget() must return an array');
  const countBefore = initial.length;

  // 2. Invalid CSV (non-numeric dollar amount) must be rejected without changing state.
  const invalidCsv = [
    'department,account_code,description,prior_year_amount,proposed_amount',
    'Public Works,1000,Salaries,1234.56,2345.67',
    'Public Works,2000,Supplies,not-a-number,890.12',
    '',
  ].join('\n');

  const rejected = await call('import-budget', {
    payload: { fiscal_year: 2027, csv_text: invalidCsv },
  });

  assert.ok(
    rejected && Array.isArray(rejected.errors) && rejected.errors.length > 0,
    'invalid CSV must report parse errors: ' + JSON.stringify(rejected),
  );
  assert.equal(rejected.id, undefined, 'invalid CSV must not create a revision');

  const afterReject = await call('budget');
  assert.ok(Array.isArray(afterReject), 'budget() must return an array');
  assert.equal(
    afterReject.length,
    countBefore,
    'rejected import must leave the revision count unchanged',
  );

  // 3. Import an exact two-row CSV with known cents.
  const priorA = 123456;
  const priorB = 78901;
  const proposedA = 234567;
  const proposedB = 89012;

  const validCsv = [
    'department,account_code,description,prior_year_amount,proposed_amount',
    'Public Works,1000,Salaries,1234.56,2345.67',
    'Public Works,2000,Supplies,789.01,890.12',
    '',
  ].join('\n');

  const imported = await call('import-budget', {
    payload: { fiscal_year: 2027, csv_text: validCsv },
  });

  assert.ok(imported?.id, 'valid import must return a revision id');
  assert.equal(Array.isArray(imported.lines) ? imported.lines.length : null, 2,
    'import must contain exactly two line items');
  assert.equal(imported.prior_year_total_cents, priorA + priorB);
  assert.equal(imported.proposed_total_cents, proposedA + proposedB);
  assert.match(imported.content_sha256, /^[0-9a-f]{64}$/);
  assert.equal(imported.finance_reviewed_at, null);

  // 4. Review the imported revision using its digest.
  const reviewed = await call('review-budget', {
    id: imported.id,
    payload: { content_sha256: imported.content_sha256, confirmed: true },
  });
  assert.ok(reviewed?.finance_reviewed_at,
    'review must set finance_reviewed_at: ' + JSON.stringify(reviewed));
  assert.equal(reviewed.content_sha256, imported.content_sha256);

  // 5. Verify the reviewed revision via get-budget before attaching.
  const fetched = await call('get-budget', { id: imported.id });
  assert.equal(fetched.content_sha256, reviewed.content_sha256);
  for (const title of [
    'Budget Narrative',
    'Hearing Packet Checklist',
    'Resident Summary',
  ]) {
    assert.ok(
      fetched.advisory_workpaper.includes(title),
      `advisory_workpaper must include ${title}`,
    );
  }

  // 6. Produce the hearing attachment for the reviewed revision.
  const attachment = await call('budget-attachment', { id: imported.id });

  assert.equal(typeof attachment?.text, 'string');
  assert.ok(attachment.text.length > 0, 'attachment text must not be empty');
  const attachmentSha256 = createHash('sha256')
    .update(attachment.text, 'utf8')
    .digest('hex');
  assert.equal(attachmentSha256, imported.content_sha256,
    'attachment text digest must match the reviewed revision');
  assert.equal(typeof attachment.file_name, 'string');
  assert.ok(attachment.file_name.length > 0);

  return { revision: reviewed, attachment };
}
