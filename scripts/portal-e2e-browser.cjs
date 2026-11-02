// SPDX-License-Identifier: AGPL-3.0-only
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {chromium} = require(process.argv[2]);
const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const output = process.argv[4];
(async () => {
  const result = {passed: false, checks: []};
  const browser = await chromium.launch({headless: true, executablePath: process.argv[5]});
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(input.base).origin ? route.continue() : route.abort());
    const page = await context.newPage();
    await page.goto(`${input.base}/meetings/${input.pk}/`);
    assert.match(await page.locator('h1').innerText(), /Synthetic Council/);
    await page.locator('video').evaluate(async video => { video.muted = true; await video.play(); });
    await page.waitForFunction(() => document.querySelector('video').currentTime > 0.1, null, {timeout: 15000});
    result.checks.push('headless browser decoded and played approved MP4');
    await page.goto(`${input.base}/admin/login/`);
    await page.locator('[name=username]').fill('publisher');
    await page.locator('[name=password]').fill(input.password);
    await page.locator('button[type=submit]').click();
    await page.goto(`${input.base}/admin/townlight-publication/?request_id=${input.selection.request_id}`);
    await page.locator(`a[href*="archive_id=${input.selection.archive_id}"]`).click();
    assert.equal(await page.locator('[name=release_copy_id]').inputValue(), input.selection.release_copy_id);
    assert.equal(await page.locator('[name=approve_publication]').isChecked(), false);
    await page.locator('[name=approve_publication]').check();
    await page.getByRole('button', {name:'Apply publication action'}).click();
    await page.getByText('Publication action completed.').waitFor();
    result.checks.push('Wagtail superuser submitted explicit publication form');
    result.passed = true;
  } catch (error) {result.error=String(error.stack); throw error;}
  finally {fs.writeFileSync(output, JSON.stringify(result,null,2)); await browser.close();}
})().catch(error => {console.error(error); process.exitCode=1;});
