// SPDX-License-Identifier: AGPL-3.0-only
const fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const {chromium} = require(process.argv[2]);
const input = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
const output = process.argv[4], shots = path.join(path.dirname(output),'screenshots');
fs.mkdirSync(shots,{recursive:true});
(async () => {
  const result = {passed:false,checks:[],pageErrors:[],failedRequests:[]};
  const browser = await chromium.launch({headless:true,executablePath:process.argv[5]});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(input.base).origin ? route.continue() : route.abort());
    const page=await context.newPage();
    page.on('pageerror',e=>result.pageErrors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)result.failedRequests.push({url:r.url(),status:r.status()})});
    const views=[['/','home'],['/meetings/','archive'],[`/meetings/${input.pk}/`,'meeting'],['/public-records/','service']];
    for(const [url,name] of views){
      const r=await page.goto(input.base+url);assert.equal(r.status(),200);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' desktop overflow');
      assert.equal(await page.locator('h1').count(),1);
      await page.screenshot({path:path.join(shots,name+'-desktop.png'),fullPage:true});
    }
    result.checks.push('four actual Wagtail views render approved desktop layout and collected local assets');
    await page.goto(input.base+'/');
    await page.selectOption('#task-select',String(input.service_pk));await page.locator('.task-panel button').click();
    await page.waitForURL('**/public-records/');
    assert.match(await page.locator('.handoff-note').innerText(),/records.juniperfalls.example/);
    assert.equal(await page.locator('.service-copy a.button').getAttribute('href'),'https://records.juniperfalls.example/');
    result.checks.push('resident task finder opens real service page with explicit existing-service destination');
    await page.goto(input.base+'/meetings/');await page.getByRole('button',{name:'Past meetings',exact:true}).click();
    await page.locator('.meeting-row h2 a').filter({hasText:'Synthetic Council Session'}).click();
    assert.match(await page.locator('h1').innerText(),/Synthetic Council/);
    for(const [label,expected] of [['Agenda','Synthetic Public Agenda'],['Meeting packet','Synthetic public packet'],['Approved minutes','Synthetic minutes text']]){
      await page.getByRole('link',{name:label+' Approved public text',exact:true}).click();
      assert.match(await page.locator('.document-paper').innerText(),new RegExp(expected));
      await page.getByRole('link',{name:'Back to meeting'}).click();
    }
    await page.locator('video').evaluate(async video=>{video.muted=true;await video.play()});
    await page.waitForFunction(()=>document.querySelector('video').currentTime>0.1,null,{timeout:15000});
    result.checks.push('archive opens actual meeting, all three approved documents and decodable MP4');
    await page.goto(input.base+'/search/?q=Synthetic');
    assert.match(await page.locator('.search-results').innerText(),/Synthetic Council Session/);
    assert.doesNotMatch(await page.locator('body').innerText(),/PRIVATE INTERNAL MEETING SENTINEL|Private Synthetic Resident/);
    await page.goto(input.base+'/meetings/');await page.fill('#meeting-search','not-a-real-title');await page.getByRole('button',{name:'Apply',exact:true}).click();
    assert.equal(await page.locator('.empty-state').count(),1);
    result.checks.push('public title search and archive empty state work without private source text');
    await page.setViewportSize({width:390,height:844});
    for(const [url,name] of views){await page.goto(input.base+url);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' phone overflow');await page.screenshot({path:path.join(shots,name+'-mobile.png'),fullPage:true});}
    await page.goto(input.base+'/');await page.getByRole('button',{name:'Menu',exact:true}).click();
    assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('Escape');assert.equal(await page.locator('.menu-toggle').getAttribute('aria-expanded'),'false');
    await page.getByRole('button',{name:'Menu',exact:true}).click();await page.locator('#main-nav').getByRole('link',{name:'Meetings & recordings',exact:true}).click();
    result.checks.push('four phone layouts fit; mobile menu, Escape and navigation work');
    const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}), plain=await nojs.newPage();
    await plain.goto(input.base+'/');assert.equal(await plain.locator('#main-nav').isVisible(),true);
    await plain.selectOption('#task-select','meetings');await plain.locator('.task-panel button').click();await plain.waitForURL('**/meetings/');
    await plain.getByRole('button',{name:'Past meetings',exact:true}).click();assert.equal(await plain.locator('.meeting-row').count(),1);
    await nojs.close();result.checks.push('resident navigation, task finder and filtering work with JavaScript disabled');
    await page.setViewportSize({width:1440,height:1000});await page.goto(input.base+'/admin/login/');
    await page.locator('[name=username]').fill('publisher');await page.locator('[name=password]').fill(input.password);await page.locator('button[type=submit]').click();
    await page.goto(`${input.base}/admin/pages/${input.service_pk}/edit/`);
    await page.locator('[name=heading]').fill('Find a record. Ask a question.');await page.locator('[name=summary]').fill('Find public records and request information.');
    await page.locator('footer').getByRole('button',{name:'More actions',exact:true}).click();
    await page.locator('[name=action-publish]').click();
    await page.goto(input.base+'/public-records/');assert.match(await page.locator('.page-banner').innerText(),/Find public records and request information/);
    result.checks.push('Wagtail staff publishes editable service presentation; resident sees saved content');
    await page.goto(`${input.base}/admin/townlight-publication/?request_id=${input.selection.request_id}`);
    await page.locator(`a[href*="archive_id=${input.selection.archive_id}"]`).click();
    assert.equal(await page.locator('[name=release_copy_id]').inputValue(),input.selection.release_copy_id);
    assert.equal(await page.locator('[name=approve_publication]').isChecked(),false);
    await page.locator('[name=approve_publication]').check();await page.getByRole('button',{name:'Apply publication action'}).click();await page.getByText('Publication action completed.').waitFor();
    result.checks.push('Wagtail superuser lookup retains separate explicit publication approval');
    assert.deepEqual(result.pageErrors,[]);assert.deepEqual(result.failedRequests,[]);
    result.passed=true;
  }catch(error){result.error=String(error.stack);throw error}
  finally{fs.writeFileSync(output,JSON.stringify(result,null,2));await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
