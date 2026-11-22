// Exact installed candidate. Synthetic network chamber feed; no camera is assumed on CI.
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rmdir, unlink, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from '@playwright/test';

export async function stationRecorder({native, save, admin, longCapture = false, meetingId = null,
  disposableFixture = false, profileRoot = null, payloadRoot = null}) {
  assert(process.env.GITHUB_ACTIONS === 'true' || (disposableFixture && process.env.TOWNLIGHT_DISPOSABLE_INSTALLED_TEST === '1'));
  const profile=profileRoot || path.join(process.env.LOCALAPPDATA,'CivicSuite');
  const pairing=JSON.parse(await readFile(path.join(profile,'config/station.json'),'utf8'));
  assert.equal(pairing.configured,true,'Normal first-run did not configure Station');
  assert.equal((await native('station_action',{action:'status',selectedDirectory:null})).ready,true);
  const data=pairing.data_directory;
  const payload=payloadRoot || path.join(process.env.ProgramFiles,'Townlight','_up_','runtime','payload');
  const proof=()=>readFile(path.join(profile,'config/local-session.json'),'utf8').then(x=>JSON.parse(x).session_hash);
  const request=async(origin,url,body)=>{
    const response=await fetch(origin+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Townlight-Session':await proof(),'Origin':origin,'X-Station-UI':'1'},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok)throw Error(url+' '+response.status+' '+await response.text());
    return response.json();
  };
  const suite='http://127.0.0.1:15480',station='http://127.0.0.1:8756';
  const capacity=await request(station,'/operator/storage');
  assert.equal(capacity.max_seconds,28800); assert.equal(capacity.max_bytes,64*1024**3); assert(capacity.ready);
  await writeFile(path.join(data,'live-sources.json'),JSON.stringify([{id:'installed-fixture',label:'Synthetic installed chamber',kind:'udp-mpegts',address:'127.0.0.1',port:18760}]));
  const meeting=meetingId ? await request(suite,`/desktop/v1/meetings/meetings/${meetingId}`) :
    await request(suite,'/desktop/v1/meetings/meetings',{title:'Synthetic installed recorder acceptance',scheduled_start:'2026-11-20T18:00:00-07:00',location:'Synthetic chamber',meeting_type:'regular'});
  const req=await request(suite,'/desktop/v1/requests',{requester:'Synthetic acceptance',summary:'Private recording handoff',deadline:'2026-12-20',deadlineBasis:'Staff reviewed fixture'});
  const ffmpeg=path.join(payload,'station/bin/ffmpeg.exe');
  const senderOptions={windowsHide:true,stdio:['ignore','ignore','pipe']};
  let sender,headless,context,page,rid,fixtureDirectory,fixture,latest;
  let senderError='';
  const connect=async()=>{
    const address=await native('station_action',{action:'open',selectedDirectory:null,meetingId:meeting.id});
    context=await headless.newContext(); page=await context.newPage();
    await page.goto(address.operator_url);
    await page.locator('#meeting-id').waitFor({timeout:30000});
    assert.equal(await page.locator('#meeting-id').inputValue(),meeting.id);
  };
  try {
    headless=await chromium.launch({headless:true,channel:'msedge'});
    await connect();
    await page.locator('#find-devices').click();
    await page.waitForFunction(()=>!document.querySelector('#find-devices').disabled);
    // Empty device inventory on a hosted runner is supported and actionable.
    await save('station-device-discovery',{message:await page.locator('#message').innerText(),devices:await request(station,'/operator/devices')});
    const testVideo=longCapture ? 'testsrc2=size=960x540:rate=30,noise=alls=20:allf=t+u' : 'testsrc=size=640x360:rate=25';
    const generate=['-f','lavfi','-i',testVideo,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000'];
    const encode=['-c:v','libopenh264','-g','30','-b:v',longCapture?'6500k':'700k','-pix_fmt','yuv420p','-c:a','aac'];
    let input=['-re',...generate,...encode];
    if(longCapture){
      // Avoid competing for CPU with the installed recorder during sustained capture.
      fixtureDirectory=await mkdtemp(path.join(tmpdir(),'townlight-station-feed-'));
      fixture=path.join(fixtureDirectory,'chamber.ts');
      await promisify(execFile)(ffmpeg,['-hide_banner','-loglevel','error',...generate,'-t','18',...encode,'-f','mpegts',fixture],{windowsHide:true,timeout:180000});
      input=['-re','-stream_loop','-1','-i',fixture,'-c','copy'];
    }
    sender=spawn(ffmpeg,['-hide_banner','-loglevel','error',...input,'-f','mpegts','udp://127.0.0.1:18760?pkt_size=1316'],senderOptions);
    sender.stderr.on('data',x=>{senderError=(senderError+x.toString()).slice(-12000);});
    sender.on('error',error=>{senderError=String(error);});
    await page.locator('#source').selectOption('installed-fixture');
    await page.locator('#start').click();
    const deadline=Date.now()+120000;
    while(Date.now()<deadline){
      const rows=await request(station,'/v1/recordings');
      const row=rows.find(r=>r.meeting_id===meeting.id);
      if(row){rid=row.id;latest=row;}
      if(row?.status==='failed')throw Error(JSON.stringify(row));
      if(row?.status==='running'&&row.live_progress?.bytes_written>0)break;
      if(sender.exitCode!==null)throw Error('Synthetic sender exited '+senderError);
      await new Promise(r=>setTimeout(r,1000));
    }
    assert(latest?.status==='running'&&latest.live_progress?.bytes_written>0,'Installed worker did not emit recording bytes');
    const renewal=await page.evaluate(async()=>{const r=await fetch('/operator/renew',{method:'POST',headers:{'Content-Type':'application/json','X-Station-UI':'1'},body:'{}'});return {status:r.status,body:await r.json()};});
    assert.equal(renewal.status,200);assert.equal(renewal.body.expires_in,900);
    await context.close(); // Recorder must outlive its browser, not restart it.
    assert.equal((await request(station,'/v1/recordings/'+rid)).status,'running');
    await connect();
    if (longCapture) {
      const captureDeadline=Date.now()+85*60*1000;
      const boundary=2*1024**3;
      let nextReport=0;
      let measured=0;
      while(Date.now()<captureDeadline) {
        const current=await request(station,'/v1/recordings/'+rid);
        latest=current;
        assert.equal(current.status,'running','Live capture stopped before crossing 2 GiB');
        measured=current.live_progress?.bytes_written||0;
        if(measured>boundary)break;
        if(sender.exitCode!==null)throw Error('Synthetic sender exited: '+senderError);
        if(Date.now()>=nextReport){
          console.log('Station live capture:',measured,'bytes');
          nextReport=Date.now()+5*60*1000;
        }
        await new Promise(r=>setTimeout(r,5000));
      }
      assert(measured>boundary,'Live recording never crossed 2 GiB');
    }
    const article=page.locator('[data-id="'+rid+'"]');
    await article.getByRole('button',{name:'Stop recording',exact:true}).click();
    let record;
    const finish=Date.now()+120000;
    while(Date.now()<finish){record=await request(station,'/v1/recordings/'+rid);if(['complete','failed','interrupted'].includes(record.status))break;await new Promise(r=>setTimeout(r,1000));}
    assert.equal(record.status,'complete',JSON.stringify(record));
    assert.equal(record.details.attempts.at(-1).end_reason,'operator-stop');
    if (longCapture) assert(record.details.size_bytes>2*1024**3);
    await article.getByRole('combobox',{name:'Records request',exact:true}).selectOption({label:req.summary||'Private recording handoff'});
    const [handoffResponse]=await Promise.all([
      page.waitForResponse(response=>response.url()===station+'/operator/handoff'&&response.request().method()==='POST',{timeout:15*60*1000}),
      article.getByRole('button',{name:'Attach privately to Records',exact:true}).click(),
    ]);
    assert.equal(handoffResponse.status(),200,await handoffResponse.text());
    const handoff=await handoffResponse.json();
    assert.equal(handoffResponse.request().postDataJSON().request_id,req.id);
    assert.equal(handoff.request.documents.length,1);
    await page.getByText('Attached privately to Private recording handoff.',{exact:false}).waitFor();
    const managed=handoff.request.documents[0];
    // The receipt plus independent file read proves durable copy, not just metadata.
    const source=path.join(data,'recordings',rid,record.details.output_file);
    const digest=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
    assert.equal(await digest(source),record.details.sha256);
    assert.notEqual(path.resolve(managed.stored_path),path.resolve(source));
    assert.equal(await digest(managed.stored_path),record.details.sha256);
    await promisify(execFile)(ffmpeg,['-hide_banner','-v','error','-xerror','-ss',
      String(Math.max(0,record.details.duration_seconds-8)),'-i',managed.stored_path,
      '-map','0:v:0','-map','0:a:0','-t','4','-f','null','-'],{windowsHide:true,timeout:90000});
    await save('station-recording-handoff',{passed:true,record,handoff,source_hash_verified:true,
      playback_decoded_near_end:true,renewal,reconnected_same_recording:true,configured_limits:capacity,
      actual_capture_over_2_gib:longCapture,fixture:'Paced synthetic UDP video and audio'});
    await native('auth_action',{action:'sign-out',payload:null});
    const revoked=await page.evaluate(async()=>{const r=await fetch('/operator/renew',{method:'POST',headers:{'X-Station-UI':'1'}});return r.status;});
    assert([401,403].includes(revoked),'Signed-out authority renewed');
    await admin();
    return {recording_id:rid,request_id:req.id,sha256:record.details.sha256,document:managed,station_data:data};
  } catch(error) {
    try {
      if(rid) latest=await request(station,'/v1/recordings/'+rid).catch(()=>latest);
      const attempt=latest?.details?.attempts?.at(-1)?.id;
      let workerLog;
      if(/^[a-f0-9-]{36}$/i.test(rid)&&/^[a-f0-9-]{36}$/i.test(attempt)){
        workerLog=await readFile(path.join(data,'recordings',rid,attempt+'.log'),'utf8').then(log=>log.slice(-12000),()=>undefined);
      }
      await save('station-recording-failure',{error:String(error),latest,workerLog,senderError,senderExitCode:sender?.exitCode});
    } catch(diagnosticError) {
      console.error('Station failure evidence could not be saved:',diagnosticError);
    }
    throw error;
  } finally {
    if(sender?.pid&&sender.exitCode===null&&sender.signalCode===null){
      await new Promise(resolve=>{sender.once('exit',resolve);if(!sender.kill())resolve();});
    }
    await headless?.close();
    if(fixture) await unlink(fixture).catch(error=>{if(error.code!=='ENOENT')console.error(error);});
    if(fixtureDirectory) await rmdir(fixtureDirectory).catch(console.error);
  }
}

// A separately labelled storage-boundary fixture, not claimed as a long capture.
// Keep it after backup/restore so recovery tests do not duplicate GiB fixtures.
export async function stationLargeHandoff(recording,save) {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  const payload=path.join(process.env.ProgramFiles,'Townlight','_up_','runtime','payload');
  const code=`
import sys,json,uuid,hashlib,copy
from pathlib import Path
import sqlalchemy as sa
from townlight_station.setup_windows import load_configuration
from townlight_station.store import Store,recordings
values=load_configuration(sys.argv[1]);store=Store(values['DATABASE_URL']);root=Path(values['DATA_ROOT'])
with store.engine.begin() as conn:
 row=dict(conn.execute(sa.select(recordings).where(recordings.c.id==sys.argv[2])).mappings().one())
 assert row['status']=='complete'
 identity=str(uuid.uuid4());folder=root/'recordings'/identity;folder.mkdir()
 original=root/'recordings'/row['id']/row['details']['output_file'];target=folder/'synthetic-scale.ts'
 # Original valid captured program plus MPEG-TS null packets beyond the old 2-GiB limit.
 import shutil
 shutil.copyfile(original,target)
 packet=bytes([0x47,0x1f,0xff,0x10])+bytes([0xff])*184;chunk=packet*8192
 with target.open('ab') as out:
  while out.tell()<=2*1024**3:out.write(chunk)
 with target.open('rb') as src:digest=hashlib.file_digest(src,'sha256').hexdigest()
 details=copy.deepcopy(row['details']);details.update(output_file=target.name,size_bytes=target.stat().st_size,sha256=digest,capture_kind='synthetic-storage-boundary-fixture')
 details['attempts'].append({'fixture':'Original short program with null padding; not long-meeting or endurance evidence'})
 row.update(id=identity,idempotency_key=identity,request_hash=hashlib.sha256(identity.encode()).hexdigest(),details=details)
 conn.execute(recordings.insert().values(**row))
 print(json.dumps({'id':identity,'sha256':digest,'size_bytes':target.stat().st_size}))
store.engine.dispose()
`;
  const result=await promisify(execFile)(path.join(payload,'python/python.exe'),['-I','-B','-c',code,path.join(recording.station_data,'settings.json'),recording.recording_id],{windowsHide:true,timeout:600000,maxBuffer:1048576});
  const fixture=JSON.parse(result.stdout.trim());assert(fixture.size_bytes>2*1024**3);
  const proof=JSON.parse(await readFile(path.join(process.env.LOCALAPPDATA,'CivicSuite/config/local-session.json'),'utf8')).session_hash;
  const response=await fetch('http://127.0.0.1:8756/operator/handoff',{method:'POST',headers:{'Content-Type':'application/json','Origin':'http://127.0.0.1:8756','X-Station-UI':'1','X-Townlight-Session':proof},body:JSON.stringify({request_id:recording.request_id,recording_id:fixture.id,expected_sha256:fixture.sha256}),signal:AbortSignal.timeout(1800000)});
  assert.equal(response.status,200,await response.clone().text());
  const handoff=await response.json();
  const document=handoff.request.documents.find(d=>d.sha256===fixture.sha256);
  assert(document);assert.equal(document.size_bytes,fixture.size_bytes);
  const hash=createHash('sha256');for await(const chunk of createReadStream(document.stored_path))hash.update(chunk);
  assert.equal(hash.digest('hex'),fixture.sha256);
  await save('station-large-handoff',{passed:true,fixture,document,fixture_kind:'Synthetic null-padded storage boundary fixture; actual >2-GiB HTTP stream and independent Records file hash verified; not an eight-hour recording'});
}
