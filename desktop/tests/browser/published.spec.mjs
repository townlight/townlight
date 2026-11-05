import {expect,test} from '@playwright/test';

async function mount(page,product){
  await page.route('http://127.0.0.1:5174/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/');
  await page.evaluate(async product=>{
    const {createPublishedView}=await import('/src/published/view.js');
    window.__calls=[];
    window.__view=createPublishedView(async(command,{request})=>{
      window.__calls.push({command,request});
      if(request.operation==='meetings-search')return {records:[{id:'11111111-1111-4111-8111-111111111111',title:'<img src=x onerror=alert(1)>'}]};
      if(request.operation==='meetings-record')return {title:'Published record',posted_agenda:'Public agenda',posted_packet:'Public packet',approved_minutes:'Adopted minutes'};
      return {status:'ok',citation:'Official section 7',body_text:'Published Code text'};
    },product);
    document.body.innerHTML=window.__view.render();window.__view.bind();
  },product);
}
test('public Meetings controls read published records without staff commands or HTML injection',async({page})=>{
  await mount(page,'meetings');
  await expect(page.locator('[data-meetings-create]')).toHaveCount(0);
  await page.getByRole('button',{name:'Search archive'}).click();
  await expect(page.locator('[data-published-records]')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('img')).toHaveCount(0);
  await page.getByRole('button',{name:'Read public record'}).click();
  for(const text of ['Public agenda','Public packet','Adopted minutes'])await expect(page.locator('[data-published-output]')).toContainText(text);
  expect(await page.evaluate(()=>window.__calls.every(c=>c.command==='published_domain_request'))).toBe(true);
});
test('public Code offers read operations and clears stale asynchronous output on reset',async({page})=>{
  await mount(page,'code');
  await expect(page.locator('[data-code-action="importBundle"]')).toHaveCount(0);
  for(const action of ['code-lookup','code-citation','code-export']){
    const form=page.locator(`[data-published-action="${action}"]`);
    await form.locator('[name="section_number"]').fill('7');await form.locator('button').click();
    await expect(page.locator('[data-published-output]')).toContainText('Official section 7');
  }
  expect(await page.evaluate(()=>window.__calls.map(c=>c.command))).toEqual(Array(3).fill('published_domain_request'));
  await page.evaluate(async()=>{
    const {createPublishedView}=await import('/src/published/view.js');
    let finish;const waiting=new Promise(resolve=>finish=resolve);
    const view=createPublishedView(()=>waiting,'code');
    document.body.innerHTML=view.render();view.bind();
    const form=document.querySelector('[data-published-action="code-search"]');form.elements.query.value='7';form.requestSubmit();
    view.reset();document.body.innerHTML=view.render();view.bind();finish({private:'stale prior response'});
  });
  await expect(page.locator('body')).not.toContainText('stale prior response');
});
