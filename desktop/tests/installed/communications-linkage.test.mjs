import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareUnattended} from './communications-unattended.mjs';
import {assertArchive, assertArchiveIdentity, assertMail, assertPublished, verifyUnattended} from './communications-postexit.mjs';
const hash = v => createHash('sha256').update(v).digest('hex');
const id = '11111111-1111-4111-8111-111111111111';
const source = {kind:'meetings',id:'22222222-2222-4222-8222-222222222222',eligible:true,revision:hash('"source snapshot"'),sha256:hash('"source snapshot"'),title:'Synthetic minutes',url:'/public/meetings/data/22222222-2222-4222-8222-222222222222'};
const recipient = 'synthetic@example.test';
const oldHash = hash('corrected content');
const archives = {original:{articleId:id,revision:2,contentSha256:hash('original content'),requestId:'old-request',attachmentId:'old-attachment',sha256:hash('original archive'),sizeBytes:16},corrected:{articleId:id,revision:3,contentSha256:oldHash,requestId:'corrected-request',attachmentId:'corrected-attachment',sha256:hash('corrected archive'),sizeBytes:17}};
const previous = {id,state:'withdrawn',kind:'meeting_summary',current_revision:3,revision:{sha256:oldHash,title:'Synthetic article',body:'Corrected communication',language:'en',source_refs:[source]},history:[{id:'original-publication',article_id:id,revision:2,action:'publish',state:'published'},{id:'correction-publication',article_id:id,revision:3,action:'correct',state:'published'}]};
const linkage = {articleId:id,sourceId:source.id,recipientSha256:hash(recipient),archives};
async function prepared(mode) {
  let article=structuredClone(previous),saved,calls=[];
  const native=async (_, {request:r})=>{
    calls.push(r.operation);
    if(r.operation==='article') return structuredClone(article);
    if(r.operation==='source') return {reference:structuredClone(source)};
    if(r.operation==='edit') {assert.equal(r.id,id);article.current_revision=4;article.revision.body=r.payload.body;article.revision.sha256=hash(r.payload.body);article.state='draft';if(mode==='wrong-source') article.revision.source_refs[0].id='wrong';return article;}
    if(r.operation==='review'){assert.equal(article.state,'draft');article.state='in_review';return article;}
    if(r.operation==='approve'){assert.equal(article.state,'in_review');article.state='approved';return article;}
    if(r.operation==='schedule') {article.history.push({id:'final-publication',article_id:id,revision:4,action:'publish',state:'pending',channels:['website','email'],due_at:r.payload.due_at});if(mode==='wrong-schedule') article.history.at(-1).revision=99;if(mode==='duplicate') article.history.push({...article.history.at(-1)});return article;}
    throw Error(r.operation);
  };
  const pending=await prepareUnattended({native,save:async(_,value)=>{saved=value;},linkage});
  assert.deepEqual(saved,pending);
  return {pending,article,calls};
}
test('normal prepare preserves same article, flat schedule ID, review and three distinct digests',async()=>{
 const {pending,calls}=await prepared();
 assert.equal(pending.id,id);assert.equal(pending.publication_id,'final-publication');
 assert.equal(new Set([pending.sha256,pending.source_ref.sha256,archives.corrected.sha256]).size,3);
 assert.deepEqual(calls,['article','source','edit','article','review','approve','schedule']);
});
for(const mode of ['wrong-source','wrong-schedule','duplicate'])test(`prepare rejects ${mode}`,async()=>{await assert.rejects(prepared(mode));});
function published(pending,article) {
 const row=article.history.at(-1);row.state='published';row.website_receipt={status:'delivered',url:`https://portal.example.test/communications/${id}/`};row.email_summary={sent:1,remaining:0,failed:0,uncertain:0};article.state='published';return row;
}
function zip(pending,row) {
 const script=`import io,json,zipfile,sys
+p=json.load(sys.stdin)
+a=dict(article_id=p['pending']['id'],revision=p['pending']['revision'],sha256=p['pending']['sha256'],body=p['pending']['body'],source_refs=[p['pending']['source_ref']],source_snapshots=[dict(reference=p['pending']['source_ref'],content='source snapshot')])
+r=dict(article_id=a['article_id'],revision=a['revision'],content_sha256=a['sha256'],publication_receipts=[p['row']])
+inner=io.BytesIO()
+with zipfile.ZipFile(inner,'w') as z: z.writestr('article.json',json.dumps(a))
+outer=io.BytesIO()
+with zipfile.ZipFile(outer,'w') as z:
+ z.writestr('publication-receipts.json',json.dumps(r))
+ z.writestr('published-content.zip',inner.getvalue())
+sys.stdout.buffer.write(outer.getvalue())`.replaceAll('\n+','\n');
 return execFileSync(process.env.TOWNLIGHT_TEST_PYTHON||'python',['-c',script],{input:JSON.stringify({pending,row})});
}
test('controlled post-exit normal verifier authenticates, verifies MIME/public/source/three Records archives and signs out',async()=>{
 const {pending,article}=await prepared();const row=published(pending,article);
 pending.due_at=new Date(Date.now()-1000).toISOString();row.due_at=pending.due_at;
 const bytes=zip(pending,row);const archive={records_request_id:'final-request',attachment_id:'final-attachment',sha256:hash(bytes),size:bytes.length};
 const stopped={exited:true,pid:12345,at:new Date(Date.now()-2000).toISOString()};
 const root=await mkdtemp(join(tmpdir(),'comms-postexit-'));let signedOut=false;const requests=[];
 try {
  await mkdir(join(root,'mail'));
  await writeFile(join(root,'communications-unattended-pending.json'),JSON.stringify(pending));
  await writeFile(join(root,'communications-app-stopped.json'),JSON.stringify(stopped));
  const url=`https://portal.example.test/communications/${id}/`;
  const metadata={recipients:[recipient],received_at:new Date().toISOString(),headers:{'message-id':['<real-capture@example.test>']},eml:'final.eml'};
  await writeFile(join(root,'mail','final.json'),JSON.stringify(metadata));
  await writeFile(join(root,'mail','final.eml'),`From: fixture@example.test\r\nTo: ${recipient}\r\nMessage-ID: <real-capture@example.test>\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(pending.body+'\n'+url).toString('base64')}\r\n`);
  const fixtureBytes={'final-request':bytes};
  for(const a of Object.values(pending.archives)){const b=zip({...pending,revision:a.revision,sha256:a.contentSha256},row);a.sha256=hash(b);a.sizeBytes=b.length;fixtureBytes[a.requestId]=b;}
  await writeFile(join(root,'communications-unattended-pending.json'),JSON.stringify(pending));
  const fetchImpl=async(input,init={})=>{
   const u=new URL(input);requests.push(`${init.method||'GET'} ${u.pathname}`);
   const json=v=>new Response(JSON.stringify(v),{status:200});
   if(u.pathname==='/ready'){const response=json({status:'ready'});Object.defineProperty(response,'url',{value:u.href});return response;}
   if(u.pathname==='/staff/v1/session') {if(init.method==='DELETE')signedOut=true;return json({proof:'controlled-session'});}
   if(u.hostname==='portal.example.test')return new Response(u.pathname.endsWith('/sources/0/')?'&quot;source snapshot&quot;':pending.body.split('\n\n').join('</p>\n\n<p>'));
   assert.equal(init.headers['X-Townlight-Session'],'controlled-session');
   if(u.pathname.endsWith(`/communications/articles/${id}`))return json(article);
   if(u.pathname.endsWith('/records')){assert.match(init.headers['X-Townlight-Operation'],/^[0-9a-f-]{36}$/);return json(archive);}
   const match=/\/requests\/([^/]+)\/(view|documents\/[^/]+\/content)$/.exec(u.pathname);assert.ok(match,u.pathname);
   const a=match[1]==='final-request'?{requestId:'final-request',attachmentId:'final-attachment',revision:pending.revision,sha256:archive.sha256,sizeBytes:archive.size}:Object.values(pending.archives).find(a=>a.requestId===match[1]);
   if(match[2]==='view')return json({documents:[{attachment_id:a.attachmentId,sha256:a.sha256,size_bytes:a.sizeBytes,original_path:''}]});
   return new Response(fixtureBytes[match[1]]);
  };
  const receipt=await verifyUnattended({output:root,fixtureRoot:root,portalBaseUrl:'https://portal.example.test',fetchImpl,timeoutMs:1000});
  assert.equal(receipt.passed,true);assert.equal(signedOut,true);assert.equal(receipt.captured_mail.meaning,'SMTP acceptance only');
  assert.ok(requests.includes(`POST /staff/v1/api/desktop/v1/communications/articles/${id}/records`));
  assert.equal(JSON.parse(await readFile(join(root,'communications-unattended.json'),'utf8')).records.sha256,hash(bytes));
  for(const field of ['id','revision','sha256']){const bad=structuredClone(pending);bad[field]=field==='revision'?99:'wrong';assert.throws(()=>assertPublished(article,bad));}
  const badSource=structuredClone(pending);badSource.source_ref.sha256='0'.repeat(64);assert.throws(()=>assertPublished(article,badSource));
  assert.throws(()=>assertMail({...metadata,recipients:['other@example.test']},[pending.body+' '+url],pending,stopped,url));
  assert.throws(()=>assertMail({...metadata,received_at:stopped.at},[pending.body+' '+url],pending,stopped,url));
  const identity={articleId:id,revision:pending.revision,contentSha256:pending.sha256,sha256:archive.sha256,sizeBytes:archive.size};
  assertArchiveIdentity(bytes,identity,pending);
  for(const field of ['articleId','revision','contentSha256'])assert.throws(()=>assertArchiveIdentity(bytes,{...identity,[field]:field==='revision'?99:'wrong'},pending));
  const tampered=Buffer.from(bytes);tampered[0]^=1;assert.throws(()=>assertArchive(tampered,archive,pending,row));
  const wrongRef=structuredClone(pending);wrongRef.source_ref.sha256='0'.repeat(64);assert.throws(()=>assertArchive(bytes,archive,wrongRef,row));
 }finally{await rm(root,{recursive:true,force:true});}
});

// Exercise the actual draft helper against the editorial state transitions: an
// edited approved revision cannot be approved until it has re-entered review.
test('draft helper sends edited revision through review before second approval',async()=>{
 const {createApprovedCommunication}=await import('./communications-draft.mjs');
 let article;let body='';let title='';let reviewCount=0;let approvals=0;let saved=false;
 const page={
  locator:()=>({waitFor:async()=>{},getAttribute:async()=>id}),
  fill:async(selector,value)=>{if(selector.includes('[name="body"]'))body=value;if(selector.includes('[name="title"]'))title=value;},
  selectOption:async()=>{},check:async()=>{},waitForFunction:async()=>{},
  click:async selector=>{
   if(selector.includes('form[data-draft] button')){
    const revision=(article?.current_revision||0)+1;
    article={id,state:'draft',current_revision:revision,revision:{sha256:hash(body),body,title,source_refs:[source]},history:[]};saved=true;
   }
   if(selector.includes('form[data-review] button')){assert.equal(article.state,'draft');article.state='in_review';reviewCount++;}
   if(selector==='[data-approve]'){assert.equal(article.state,'in_review','edited revision requires review');article.state='approved';approvals++;}
  },
 };
 const native=async(_, {request})=>{
  if(request.operation==='source')return {reference:source};
  if(request.operation==='article'){assert.equal(saved,true);return structuredClone(article);}
  if(request.operation==='schedule'){assert.notEqual(article.state,'approved');throw Error('revision not approved');}
  throw Error(request.operation);
 };
 const result=await createApprovedCommunication({page,native,meetingId:source.id});
 assert.equal(result.id,id);assert.equal(result.revision,2);assert.equal(reviewCount,2);assert.equal(approvals,2);
});
