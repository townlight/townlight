import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { clerkWorkflows } from './clerk-workflows.mjs';
import { chromium } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {stationRecorder,stationLargeHandoff} from './station-recorder.mjs';
import {connectUleDesktop} from './ule-hosted-connect.mjs';
if (process.env.GITHUB_ACTIONS !== 'true' || process.platform !== 'win32') throw Error('Disposable hosted Windows only');
const [mode, output] = process.argv.slice(2);
assert(['seed', 'fresh', 'upgrade', 'recorder', 'community', 'ule', 'ule-upgrade', 'ule-recovery'].includes(mode));
await mkdir(output, {recursive:true});
let browser = mode==='ule-recovery' ? await connectUleDesktop() : await chromium.connectOverCDP('http://127.0.0.1:9222', {timeout:60000});
let page = browser.contexts().flatMap(c => c.pages()).find(p => !p.url().startsWith('devtools:'));
assert(page, 'Installed WebView page is absent');
const run = async name => page.evaluate(await readFile(new URL(name, import.meta.url), 'utf8'));
const native = (command, args={}) => page.evaluate(async ({command,args}) => {
  try {
    return await window.__TAURI_INTERNALS__.invoke(command,args);
  } catch (error) {
    if (typeof error === 'string') throw new Error(error);
    const safe = {};
    if (error && typeof error === 'object') {
      for (const key of ['code','message','retryable','status']) {
        if (error[key] !== undefined) safe[key] = error[key];
      }
    }
    const detail = typeof safe.message === 'string' ? safe.message
      : safe.code !== undefined ? String(safe.code)
      : 'Native command failed';
    const wrapped = new Error(detail);
    if (safe.code !== undefined) wrapped.code = safe.code;
    if (safe.retryable !== undefined) wrapped.retryable = safe.retryable;
    if (safe.status !== undefined) wrapped.status = safe.status;
    throw wrapped;
  }
}, {command,args});
const accepted = result => { assert.equal(result?.accepted, true, JSON.stringify(result)); return result; };
const save = async (name, value) => writeFile(path.join(output,name+'.json'), JSON.stringify(value,null,2));
const admin = async () => {
  await page.evaluate(async () => {
    const a = window.audit;
    const app = () => a.native('get_app_state');
    const settings = async () => {
      await a.click('[data-surface="IT/Admin"]', {confirm:false});
      await a.nav('settings');
    };
    await settings();
    await a.click('[data-auth-action="sign-out"]');
    await settings();
    a.fill('[data-access-field="email"]', 'audit-admin@example.invalid');
    a.fill('[data-access-field="passcode"]', 'Audit-fixture-2026-11-04!');
    await a.click('[data-auth-action="sign-in"]');
    await a.until(async () => {
      const {access} = await app();
      return access.signed_in && access.role === 'local-admin';
    });
    await a.until(() => !!document.querySelector('[data-auth-action="sign-out"]'));
  });
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
let pendingContext;
let pendingFunctions;
try {
  // WebView CDP becoming available precedes the app's first native state load.
  // On upgrade that load refreshes the runtime under the profile lifecycle gate.
  // Observe its rendered result before sending another native state request.
  await page.locator('.sidebar [data-area="home"]').waitFor({state:'visible',timeout:600000});
  await run('observer.js');
  if (['ule','ule-upgrade','ule-recovery'].includes(mode)) {
    const {recoverUleHosted}=await import('./ule-hosted-recovery.mjs');
    const {runUleHosted}=await import('./ule-hosted-run.mjs');
    const {reconnectUleAfterLibrary}=await import('./ule-hosted-reconnect.mjs');
    if (mode==='ule-recovery') {
      await recoverUleHosted({getPage:()=>page,native,save,output});
    } else {
      const fixtureRoot=process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT;
      const portalBaseUrl=process.env.TOWNLIGHT_COMMUNITY_PORTAL_URL;
      if(!fixtureRoot) throw new Error('TOWNLIGHT_COMMUNITY_FIXTURE_ROOT is required');
      if(!portalBaseUrl) throw new Error('TOWNLIGHT_COMMUNITY_PORTAL_URL is required');
      await runUleHosted({getPage:()=>page,native,save,run,mode,output,fixtureRoot,portalBaseUrl,afterLibrarySchedule:pending=>reconnectUleAfterLibrary({pending,getBrowser:()=>browser,setBrowser:value=>{browser=value},setPage:value=>{page=value},native,run})});
    }
    await save(mode+'-complete',{passed:true,at:new Date().toISOString()});
  } else {
  let ids, communityIds, communityMeetingId, communityExpected, communityBaseline, communityUnattended;
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
      if (mode==='community') {
        // Earlier exact-candidate municipal receipts remain preserved evidence;
        // community mode creates only its own canonical meeting fixture.
        await admin();
        // Full-profile first-run leaves legacy Records activation to this documented operator action.
        await page.evaluate(async () => {
          const a = window.audit;
          const app = () => a.native('get_app_state');
          if ((await app()).domain_authority !== 'python-records') {
            await a.click('[data-surface="IT/Admin"]', {confirm:false});
            await a.nav('health');
            await a.click('[data-supervisor-action="activate-records"]', {timeout:600000});
            await a.until(async () => (await app()).domain_authority === 'python-records', 600000);
          }
        });
        const created = await native('meetings_domain_request',{request:{operation:'create-meeting',
          payload:{
            title:'Synthetic Community linkage meeting',
            scheduled_start:new Date(Date.now()+86400000).toISOString(),
            location:'Synthetic chamber',
            meeting_type:'regular',
          },
        }});
        communityMeetingId = created.id;
        assert.match(String(communityMeetingId), /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Community meeting creation returned no UUID');
        const communityMeetingReadback = await native('meetings_domain_request',{request:{operation:'get-meeting', id: communityMeetingId}});
        assert.equal(communityMeetingReadback?.id, communityMeetingId, 'Community meeting readback id');
        assert.equal(communityMeetingReadback?.title, created.title, 'Community meeting readback title');
        await save('community-source-fixture',{meetingId: communityMeetingId, created, readback: communityMeetingReadback});
      } else {
        ids=await run('municipal-workflows.js');
        assert(ids.passed,'Installed municipal workflows failed');
        await save(mode+'-workflows',ids);
        await admin();
        await readback(ids);
      }
    }
    if (mode==='community') {
      assert(process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT, 'Community fixture root is required');
      assert(process.env.TOWNLIGHT_COMMUNITY_PORTAL_URL, 'Community portal URL is required');
      // Imported only in community mode so historical fresh/upgrade/recorder
      // runs do not depend on the community harness.
      const { communityWorkflows, communityReadback } = await import('./community-workflows.mjs');
      const community = await communityWorkflows({
        page, native, save, meetingId: communityMeetingId, output,
        fixtureRoot: process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT,
        portalBaseUrl: process.env.TOWNLIGHT_COMMUNITY_PORTAL_URL,
      });
      assert(community && typeof community === 'object', 'communityWorkflows returned no outcome');
      assert(community.passed === true, 'Community workflows failed');
      communityIds = community.ids;
      communityUnattended = community.unattended;
      assert(communityIds && typeof communityIds === 'object', 'Community ids missing');
      const communityIdValues = Object.values(communityIds);
      assert(communityIdValues.length > 0 && communityIdValues.every(value => value !== undefined && value !== null && String(value).length > 0), 'Community ids contain empty values');
      await save('community-outcome', community);
      await save('community-actual-ids', {
        meeting_id: communityMeetingId,
        community: communityIds,
      });
      const { preparePendingNotification, readPendingNotification, deliverPendingNotification, restorePendingNotificationSettings } = await import('./pending-notification-recovery.mjs');
      pendingFunctions = { readPendingNotification, deliverPendingNotification, restorePendingNotificationSettings };
      pendingContext = await preparePendingNotification({
        native,
        requestId: communityIds.residentRequest,
        fixtureRoot: process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT,
        quiesce: async () => {
          accepted(await native('supervisor_action', { action: 'stop', serviceId: 'python-services' }));
          accepted(await native('supervisor_action', { action: 'start', serviceId: 'python-services' }));
          await admin();
        },
      });
      await save('community-pending-before-restart', await readPendingNotification(pendingContext));
      communityExpected = community.recovery;
      communityBaseline = await communityReadback({native, ids: communityIds, expected: communityExpected});
      await save('community-before-restart', communityBaseline);
      accepted(await native('supervisor_action',{action:'stop',serviceId:null}));
      accepted(await native('supervisor_action',{action:'start',serviceId:null}));
      await admin();
      const restartReadback = await communityReadback({native, ids: communityIds, save, expected: communityExpected});
      assert.deepEqual(restartReadback, communityBaseline, 'community restart readback must match baseline');
      await save('community-restart-readback', restartReadback);
      await save('community-pending-after-restart', await pendingFunctions.readPendingNotification(pendingContext));
    }
  }
  if (process.env.TOWNLIGHT_ULE_UPGRADE_SEED === '1' && mode === 'seed') {
    const fixtureRoot = process.env.TOWNLIGHT_COMMUNITY_FIXTURE_ROOT;
    const portalBaseUrl = process.env.TOWNLIGHT_COMMUNITY_PORTAL_URL;
    if (!fixtureRoot || !portalBaseUrl) throw new Error('ULE seed requires TOWNLIGHT_COMMUNITY_FIXTURE_ROOT and TOWNLIGHT_COMMUNITY_PORTAL_URL');
    await page.evaluate(async () => {
      const a = window.audit;
      const app = () => a.native('get_app_state');
      if ((await app()).domain_authority !== 'python-records') {
        await a.click('[data-surface="IT/Admin"]', {confirm:false});
        await a.nav('health');
        await a.click('[data-supervisor-action="activate-records"]', {timeout:600000});
        await a.until(async () => (await app()).domain_authority === 'python-records', 600000);
      }
    });
    const { seedUleUpgrade } = await import('./ule-upgrade-seed.mjs');
    const { downloadRecordsAttachment } = await import('./community-workflows.mjs');
    await seedUleUpgrade({ page, native, save, meetingId: ids.meeting_id, fixtureRoot, portalBaseUrl, downloadRecordsAttachment });
  }
  if (process.env.TOWNLIGHT_ULE_UPGRADE_SEED === '1' && mode === 'upgrade') {
    const seed = JSON.parse(await readFile(path.join(output, 'ule-upgrade-seed.json'), 'utf8'));
    if (!seed.ids || !seed.expected) throw new Error('ULE upgrade seed missing ids or expected');
    const { readUleUpgrade } = await import('./ule-upgrade-seed.mjs');
    const { downloadRecordsAttachment } = await import('./community-workflows.mjs');
    await readUleUpgrade({ native, ids: seed.ids, expected: seed.expected, downloadRecordsAttachment, save, stage: 'after-upgrade' });
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
      const restoredReadback = await communityReadback({native, ids: communityIds, save, expected: communityExpected});
      assert.deepEqual(restoredReadback, communityBaseline, 'community restored readback must match baseline');
      await save('community-restored-readback', restoredReadback);
      await save('community-pending-after-restore', await pendingFunctions.readPendingNotification(pendingContext));
      await save('community-pending-delivered', await pendingFunctions.deliverPendingNotification(pendingContext));
    }
    await save('backup-restore',{passed:true,restore,services_restarted:true,records_read_back:true});
  }
  if(recording) {
    if (mode === 'recorder') await stationLargeHandoff(recording,save);
    assert.equal((await native('station_action',{action:'stop',selectedDirectory:null})).stopped,true);
  }
  if(mode==="community"){
    const {prepareUnattended}=await import("./communications-unattended.mjs");
    await prepareUnattended({native,save,linkage:communityUnattended});
  }
  accepted(await native('supervisor_action',{action:'stop',serviceId:null}));
  await save(mode+'-complete',{passed:true,at:new Date().toISOString()});
  }
} catch(error) {
  const failure = {error:String(error),stack:error.stack};
  if(!['community','ule','ule-upgrade','ule-recovery'].includes(mode)) failure.text = await page.locator('body').innerText().catch(()=>'' );
  await save(mode+'-failure',failure);
  if(!['community','ule','ule-upgrade','ule-recovery'].includes(mode)) await page.screenshot({path:path.join(output,mode+'-failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {
  try {
    if (pendingContext && !pendingContext.restored) {
      try {
        const receipt = await pendingFunctions.restorePendingNotificationSettings(pendingContext);
        await save('community-pending-settings-cleanup', receipt);
      } catch {
        await save('community-pending-settings-cleanup', { passed: false, error: 'pending notification settings cleanup incomplete' });
        throw new Error('pending notification settings cleanup incomplete');
      }
    }
  } finally {
    await browser.close();
  }
}
