// Exact installed candidate. Synthetic network chamber feed; no camera is assumed on CI.
import assert from 'node:assert/strict';
import {readFile, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {chromium} from '@playwright/test';

export async function stationRecorder({native, save, admin}) {
  assert.equal(process.env.GITHUB_ACTIONS,'true');
  const profile=path.join(process.env.LOCALAPPDATA,'CivicSuite');
  const pairing=JSON.parse(await readFile(path.join(profile,'config/station.json'),'utf8'));
  assert.equal(pairing.configured,true,'Normal first-run did not configure Station');
  assert.equal((await native('station_action',{action:'status',selectedDirectory:null})).ready,true);
  const data=pairing.data_directory;
  const payload=path.join(process.env.ProgramFiles,'Townlight','_up_','runtime','payload');
  const proof=()=>readFile(path.join(profile,'config/local-session.json'),'utf8').then(x=>JSON.parse(x).session_hash);
  const request=async(origin,url,body)=>{
    const response=await fetch(origin+url,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json','X-Townlight-Session':await proof()},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok)throw Error(url+' '+response.status+' '+await response.text());
    return response.json();
  };
  const suite='http://127.0.0.1:15480',station='http://127.0.0.1:8756';
  const capacity=await request(station,'/operator/storage');
  assert.equal(capacity.max_seconds,28800); assert.equal(capacity.max_bytes,64*1024**3); assert(capacity.ready);
  await writeFile(path.join(data,'live-sources.json'),JSON.stringify([{id:'installed-fixture',label:'Synthetic installed chamber',kind:'udp-mpegts',address:'127.0.0.1',port:18760}]));
  const meeting=await request(suite,'/desktop/v1/meetings/meetings',{title:'Synthetic installed recorder acceptance',scheduled_start:'2026-11-20T18:00:00-07:00',location:'Synthetic chamber',meeting_type:'regular'});
  const req=await request(suite,'/desktop/v1/requests',{requester:'Synthetic acceptance',summary:'Private recording handoff',deadline:'2026-12-20',deadlineBasis:'Staff reviewed fixture'});
  let sender,headless,context,page,rid;
  const connect=async()=>{
    const ticket=await request(station,'/v1/operator-ticket',{});
    context=await headless.newContext(); page=await context.newPage();
    await page.goto(station+'/#ticket='+ticket.ticket);
    await page.locator('#meeting-id').waitFor({timeout:30000});
  };
  try {
    headless=await chromium.launch({headless:true});
    await connect();
    await page.locator('#find-devices').click();
    await page.waitForFunction(()=>!document.querySelector('#find-devices').disabled);
    // Empty device inventory on a hosted runner is supported and actionable.
    await save('station-device-discovery',{message:await page.locator('#message').innerText(),devices:await request(station,'/operator/devices')});
    sender=spawn(path.join(payload,'station/bin/ffmpeg.exe'),['-hide_banner','-loglevel','error','-re','-f','lavfi','-i','testsrc=size=640x360:rate=25','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-f','mpegts','udp://127.0.0.1:18760?pkt_size=1316'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
    let senderError='';sender.stderr.on('data',x=>{senderError+=x.toString();});
    await page.locator('#meeting-id').selectOption(meeting.id);
    await page.locator('#source').selectOption('installed-fixture');
    await page.locator('#start').click();
    const deadline=Date.now()+120000;
    while(Date.now()<deadline){
      const rows=await request(station,'/v1/recordings');
      const row=rows.find(r=>r.meeting_id===meeting.id);
      if(row?.status==='failed')throw Error(JSON.stringify(row));
      if(row?.status==='running'&&row.live_progress?.bytes_written>0){rid=row.id;break;}
      if(sender.exitCode!==null)throw Error('Synthetic sender exited '+senderError);
      await new Promise(r=>setTimeout(r,1000));
    }
    assert(rid,'Installed worker did not emit recording bytes');
    const renewal=await page.evaluate(async()=>{const r=await fetch('/operator/renew',{method:'POST',headers:{'Content-Type':'application/json','X-Station-UI':'1'},body:'{}'});return {status:r.status,body:await r.json()};});
    assert.equal(renewal.status,200);assert.equal(renewal.body.expires_in,900);
    await context.close(); // Recorder must outlive its browser, not restart it.
    assert.equal((await request(station,'/v1/recordings/'+rid)).status,'running');
    await connect();
    const article=page.locator('[data-id="'+rid+'"]');
    await article.getByRole('button',{name:'Stop recording',exact:true}).click();
    let record;
    const finish=Date.now()+120000;
    while(Date.now()<finish){record=await request(station,'/v1/recordings/'+rid);if(['complete','failed','interrupted'].includes(record.status))break;await new Promise(r=>setTimeout(r,1000));}
    assert.equal(record.status,'complete',JSON.stringify(record));
    assert.equal(record.details.attempts.at(-1).end_reason,'operator-stop');
    const handoff=await request(station,'/operator/handoff',{request_id:req.id,recording_id:rid,expected_sha256:record.details.sha256});
    assert.equal(handoff.request.documents.length,1);
    const managed=handoff.request.documents[0];
    // The receipt plus independent file read proves durable copy, not just metadata.
    const source=path.join(data,'recordings',rid,record.details.output_file);
    const digest=async file=>{const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');};
    assert.equal(await digest(source),record.details.sha256);
    assert.notEqual(path.resolve(managed.stored_path),path.resolve(source));
    assert.equal(await digest(managed.stored_path),record.details.sha256);
    await save('station-recording-handoff',{passed:true,record,handoff,source_hash_verified:true,renewal,reconnected_same_recording:true,configured_limits:capacity,fixture:'Synthetic UDP video and audio; not an eight-hour endurance test'});
    await native('auth_action',{action:'sign-out',payload:null});
    const revoked=await page.evaluate(async()=>{const r=await fetch('/operator/renew',{method:'POST',headers:{'X-Station-UI':'1'}});return r.status;});
    assert([401,403].includes(revoked),'Signed-out authority renewed');
    await admin();
    return {recording_id:rid,request_id:req.id,sha256:record.details.sha256,document:managed,station_data:data};
  } finally {
    if(sender&&sender.exitCode===null){sender.kill();await new Promise(r=>sender.once('exit',r));}
    await headless?.close();
  }
}
