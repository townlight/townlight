import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Disposable hosted Windows only');
const [mode, output] = process.argv.slice(2);
assert(['seed', 'fresh', 'upgrade'].includes(mode));
await mkdir(output, {recursive:true});
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222', {timeout:60000});
const page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith('devtools:'));
assert(page, 'Installed WebView page is absent');
const run = async name => page.evaluate(await readFile(new URL(name, import.meta.url), 'utf8'));
const native = (command, args={}) => page.evaluate(({command,args}) => window.__TAURI_INTERNALS__.invoke(command,args), {command,args});
const accepted = result => { assert.equal(result?.accepted, true, JSON.stringify(result)); return result; };
const save = async (name, value) => writeFile(path.join(output,name+'.json'), JSON.stringify(value,null,2));
const admin = async () => {
  await native('auth_action',{action:'sign-out',payload:null});
  accepted(await native('auth_action',{action:'sign-in',payload:{email:'audit-admin@example.invalid',passcode:'Audit-fixture-2026-11-04!'}}));
};
const municipal = operation => native('municipal_staff_request',{request:{operation}});
const readback = async ids => {
  const boards = await municipal('boards');
  assert(boards.boards.some(b => b.board_id===ids.board_id), 'Saved board missing');
  const contracts = await municipal('contracts');
  assert(contracts.some(c => c.id===ids.contract_id), 'Procurement contract handoff missing');
  const procurement = await municipal('procurement');
  const source = JSON.stringify(procurement);
  assert(source.includes(ids.solicitation_id), 'Saved procurement missing');
  await save(mode+'-readback',{passed:true,ids,boards,contracts,procurement});
};
try {
  await run('observer.js');
  let ids;
  if (mode==='upgrade') {
    ids=JSON.parse(await readFile(path.join(output,'seed-workflows.json'),'utf8'));
    await admin();
    accepted(await native('supervisor_action',{action:'start',serviceId:null}));
    await readback(ids);
    const state=await native('get_app_state');
    assert.equal(state.first_run.finished,true,'Upgrade lost completed setup');
    await save('upgrade-app-state',state);
  } else {
    const setup=await run('setup.js');
    assert(setup.final.first_run.finished, 'Installed first-run incomplete');
    await save(mode+'-setup',setup);
    ids=await run('municipal-workflows.js');
    assert(ids.passed,'Installed municipal workflows failed');
    await save(mode+'-workflows',ids);
    await admin();
    await readback(ids);
  }
  if (mode==='fresh') {
    accepted(await native('supervisor_action',{action:'backup',serviceId:null}));
    const restore=accepted(await native('supervisor_action',{action:'restore',serviceId:null}));
    await save('backup-restore',{passed:true,restore});
    accepted(await native('supervisor_action',{action:'start',serviceId:null}));
    await readback(ids);
  }
  accepted(await native('supervisor_action',{action:'stop',serviceId:null}));
  await save(mode+'-complete',{passed:true,at:new Date().toISOString()});
} catch(error) {
  await save(mode+'-failure',{error:String(error),stack:error.stack,text:await page.locator('body').innerText().catch(()=>'' )});
  await page.screenshot({path:path.join(output,mode+'-failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally { await browser.close(); }
