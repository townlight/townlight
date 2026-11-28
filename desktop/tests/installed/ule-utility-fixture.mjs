export async function createUtilityCategory(page, categoryCode) {
  await page.evaluate(async () => {
    const a = window.audit;
    await a.click('[data-surface="Staff"]', { confirm: false });
    await a.nav('service-requests');
  });

  const form = page.locator('[data-service-requests-view] [data-category]');
  await form.waitFor({ state: 'visible' });

  await form.locator('[name=code]').fill(categoryCode);
  await form.locator('[name=name]').fill('Synthetic utility payment options');
  await form.locator('[name=department]').fill('Utilities');
  await form.locator('[name=active]').check();
  await form.locator('button[type=submit]').click();

  await page.waitForFunction(() =>
    document.querySelector('[data-service-requests-view] [data-status]')?.textContent?.includes('Category saved.')
  );

  return categoryCode;
}

export async function registerUtilityPolicy(page, policy) {
  await page.evaluate(async () => {
    const a = window.audit;
    await a.click('[data-surface="Staff"]', { confirm: false });
    await a.nav('utilities');
  });

  const details = page.locator('[data-role=admin-details]');
  await details.waitFor({ state: 'visible' });
  if (await details.getAttribute('open') === null) {
    await details.locator('summary').click();
  }

  const form = page.locator('[data-role=register-form]');
  await form.locator('[data-role=reg-id]').fill(policy.policy_id);
  await form.locator('[data-role=reg-version]').fill(String(policy.version));
  await form.locator('[data-role=reg-title]').fill(policy.title);
  await form.locator('[data-role=reg-text]').fill(policy.text);
  await form.locator('[data-role=reg-citation]').fill(policy.citation);
  await form.locator('button[data-action=register]').click();

  await page.waitForFunction(() =>
    document.querySelector('[data-utilities-view] [data-role=status]')?.textContent?.includes('Policy registered.')
  );

  return { policyId: policy.policy_id, policyVersion: policy.version, citation: policy.citation };
}