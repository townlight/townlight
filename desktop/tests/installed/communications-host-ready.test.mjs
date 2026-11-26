import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {waitForStaffReady} from './communications-host-ready.mjs';
import {verifyUnattended} from './communications-postexit.mjs';
const listen = server => new Promise(resolve => server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
async function close(server) { server.closeAllConnections(); if (server.listening) await new Promise(resolve=>server.close(resolve)); }
async function freePort(){const server=http.createServer();await listen(server);const port=server.address().port;await close(server);return port;}
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
test('real delayed bind and not-ready responses precede readiness',async()=>{
 const port=await freePort();let count=0;
 const server=http.createServer((req,res)=>{assert.equal(req.url,'/ready');count++;json(res,count<=2?503:200,{status:count<=2?'not-ready':'ready'});});
 const timer=setTimeout(()=>server.listen(port,'127.0.0.1'),120);
 try {const result=await waitForStaffReady({staffBaseUrl:`http://127.0.0.1:${port}`,timeoutMs:2000,attemptTimeoutMs:100,pollMs:25});assert.equal(result.passed,true);assert.ok(result.attempts>3);assert.equal(count,3);}
 finally {clearTimeout(timer);await close(server);}
});
test('dead listener is bounded by monotonic startup deadline',async()=>{
 const port=await freePort();const start=performance.now();
 await assert.rejects(waitForStaffReady({staffBaseUrl:`http://127.0.0.1:${port}`,timeoutMs:200,attemptTimeoutMs:50,pollMs:20}),/timed out/);
 assert.ok(performance.now()-start<900);
});
for(const [label,status,body] of [['unauthorized',401,'{}'],['malformed',503,'invalid-json'],['wrong-service',200,'{"status":"other"}'],['redirect',302,'{}']]){
 test(`readiness fails immediately for ${label}`,async()=>{
  let count=0;const server=http.createServer((req,res)=>{count++;res.writeHead(status,{'Content-Type':'application/json','Location':'http://127.0.0.1:1/ready'});res.end(body);});const base=await listen(server);
  try {await assert.rejects(waitForStaffReady({staffBaseUrl:base,timeoutMs:500,attemptTimeoutMs:100,pollMs:20}));assert.equal(count,1);}finally{await close(server);}
 });
}
test('actual verifier sends one credential POST after readiness and never retries auth rejection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'townlight-postexit-ready-'));let ready=0,auth=0;
 const server=http.createServer((req,res)=>{if(req.url==='/ready'){ready++;json(res,200,{status:'ready'});}else if(req.url==='/staff/v1/session'&&req.method==='POST'){auth++;json(res,401,{detail:'Rejected synthetic credential'});}else json(res,500,{});});const base=await listen(server);
 try {
  await writeFile(join(root,'communications-unattended-pending.json'),JSON.stringify({id:'11111111-1111-4111-8111-111111111111',recipient_sha256:'a'.repeat(64),due_at:new Date(Date.now()+60000).toISOString()}));
  await writeFile(join(root,'communications-app-stopped.json'),JSON.stringify({exited:true,pid:12345,at:new Date(Date.now()-1000).toISOString()}));
  await assert.rejects(verifyUnattended({output:root,fixtureRoot:root,portalBaseUrl:'https://example.invalid',staffBaseUrl:base,timeoutMs:500}),/401/);
  assert.equal(ready,1);assert.equal(auth,1);
 }finally{await close(server);assert.ok(resolve(root).startsWith(resolve(tmpdir())+'\\')||resolve(root).startsWith(resolve(tmpdir())+'/'));await rm(root,{recursive:true,force:true});}
});
