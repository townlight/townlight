import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { clerkWorkflows } from './clerk-workflows.mjs';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {stationRecorder,stationLargeHandoff} from './station-recorder.mjs';
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Disposable hosted Windows only');
const [mode, output] = process.argv.slice(2);
assert(['seed', 'fresh', 'upgrade', 'recorder', 'community'].includes(mode));
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
  // WebView CDP becoming available precedes the app's first native state load.
  // On upgrade that load refreshes the runtime under the profile lifecycle gate.
  // Observe its rendered result before sending another native state request.
  await page.locator('.sidebar [data-area="home"]').waitFor({state:'visible',timeout:600000});
  await run('observer.js');
  let ids, communityIds;
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
    if(mode!=='recorder') {
      ids=await run('municipal-workflows.js');
      assert(ids.passed,'Installed municipal workflows failed');
      await save(mode+'-workflows',ids);
      await admin();
      await readback(ids);
    }
    if (mode==='community') {
      assert(process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT, 'Community fixture root is required');
      assert(process.env.TOWNLIGHT_COMMUNITY_PORTAL_URL, 'Community portal URL is required');
      // Imported only in community mode so historical fresh/upgrade/recorder
      // runs do not depend on the community harness.
      const { communityWorkflows, communityReadback } = await import('./community-workflows.mjs');
      const community = await communityWorkflows({
        page, native, save, meetingId: ids.meeting_id, output,
        fixtureRoot: process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT,
        portalBaseUrl: process.env.TOWNLIGHT_COMMUNITY_PORTAL_URL,
      });
      assert(community && typeof community === 'object', 'communityWorkflows returned no outcome');
      assert(community.passed === true, 'Community workflows failed');
      communityIds = community.ids;
      assert(communityIds && typeof communityIds === 'object', 'Community ids missing');
      const communityIdValues = Object.values(communityIds);
      assert(communityIdValues.length > 0 && communityIdValues.every(value => value !== undefined && value !== null && String(value).length > 0), 'Community ids contain empty values');
      await save('community-outcome', community);
      await save('community-actual-ids', {
        meeting_id: ids.meeting_id, board_id: ids.board_id,
        solicitation_id: ids.solicitation_id, contract_id: ids.contract_id,
        community: communityIds,
      });
      accepted(await native('supervisor_action',{action:'stop',serviceId:null}));
      accepted(await native('supervisor_action',{action:'start',serviceId:null}));
      await admin();
      const restartReadback = await communityReadback({native, ids: communityIds, save});
      await save('community-restart-readback', restartReadback);
    }
  }
  if (mode === "recorder") {
    await page.evaluate(async () => {
      const a = window.audit;
      if ((await a.native("get_app_state")).domain_authority !== "python-records") {
        await a.click('[data-surface="IT/Admin"]', { confirm: false });
        await a.nav("health");
        await a.click('[data-supervisor-action="activate-records"]', { timeout: 600000 });
        await a.until(async () => (await a.native("get_app_state")).domain_authority === "python-records", 600000);
      }
    });
    const domainAuthority = (await native("get_app_state")).domain_authority;
    await save("domain_authority", domainAuthority);
    if (domainAuthority !== "python-records") {
      throw new Error(`expected domain_authority python-records, got ${domainAuthority}`);
    }
  }
  if (mode === 'fresh') await clerkWorkflows({ page, native, save, meetingId: ids.meeting_id });
  let recording;
  if(mode==='recorder'||mode==='fresh') recording=await stationRecorder({native,save,admin,longCapture:mode==='fresh'});
  if (mode==='fresh'||mode==='recorder'||mode==='community') {
    accepted(await native('supervisor_action',{action:'backup',serviceId:null}));
    const restore=await native('supervisor_action',{action:'restore',serviceId:null});
    // Restore intentionally leaves services stopped. It is not accepted as
    // recovered until Start and independent saved-record readback succeed.
    assert.equal(restore.action,'restore');
    if (!restore.accepted) assert.equal(restore.status,'Restore needs service start',JSON.stringify(restore));
    accepted(await native('supervisor_action',{action:'start',serviceId:null}));
    await admin();
    if(recording) {
      const proof=JSON.parse(await readFile(path.join(process.env.LOCALAPPDATA,'CivicSuite/config/local-session.json'),'utf8')).session_hash;
      const response=await fetch('http://127.0.0.1:8756/v1/recordings/'+recording.recording_id,{headers:{'X-Townlight-Session':proof}});
      assert.equal(response.status,200);assert.equal((await response.json()).details.sha256,recording.sha256);
      const hash = createHash('sha256');
      for await (const bytes of createReadStream(recording.document.stored_path)) hash.update(bytes);
      assert.equal(hash.digest('hex'), recording.sha256);
      await save('station-after-restore',{passed:true,recording,restored_file_hash_verified:true});
    }
    if(ids) await readback(ids);
    if(communityIds) {
      const { communityReadback } = await import('./community-workflows.mjs');
      const restoredReadback = await communityReadback({native, ids: communityIds, save});
      await save('community-restored-readback', restoredReadback);
    }
    await save('backup-restore',{passed:true,restore,services_restarted:true,records_read_back:true});
  }
  if(recording) {
    if (mode === 'recorder') await stationLargeHandoff(recording,save);
    assert.equal((await native('station_action',{action:'stop',selectedDirectory:null})).stopped,true);
  }
  accepted(await native('supervisor_action',{action:'stop',serviceId:null}));
  await save(mode+'-complete',{passed:true,at:new Date().toISOString()});
} catch(error) {
  await save(mode+'-failure',{error:String(error),stack:error.stack,text:await page.locator('body').innerText().catch(()=>'' )});
  await page.screenshot({path:path.join(output,mode+'-failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally { await browser.close(); }
