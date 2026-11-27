import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {inspectMail,assertMail,mailContainsFinalContent} from './communications-postexit.mjs';

test('actual MIME CRLF compares as LF while content, recipient and URL remain exact',()=>{
 const recipient='fixture@example.test';
 const url='https://portal.example.test/communications/synthetic/';
 const pending={body:'Alpha\n\nBeta',recipient_sha256:createHash('sha256').update(recipient).digest('hex'),due_at:'2026-01-01T00:01:00Z'};
 const stopped={at:'2026-01-01T00:00:00Z'};
 const record={recipients:[recipient],received_at:'2026-01-01T00:02:00Z',headers:{'message-id':['<synthetic@example.test>']}};
 const bytes=Buffer.from(`From: ${recipient}\r\nTo: ${recipient}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nAlpha\r\n\r\nBeta\r\n${url}\r\n`);
 const parts=inspectMail(bytes);
 assert.ok(parts.some(text=>text.includes('Alpha\r\n\r\nBeta')),'actual Python MIME parser retains CRLF');
 assert.equal(mailContainsFinalContent(parts,pending,url),true);
 assertMail(record,parts,pending,stopped,url);
 const changed={...pending,body:'Alpha\n\nBetX'};
 assert.equal(mailContainsFinalContent(parts,changed,url),false);
 assert.throws(()=>assertMail(record,parts,changed,stopped,url));
 assert.throws(()=>assertMail({...record,recipients:['other@example.test']},parts,pending,stopped,url));
 assert.equal(mailContainsFinalContent(parts,pending,url+'wrong'),false);
 assert.throws(()=>assertMail(record,parts,pending,stopped,url+'wrong'));
 assert.equal(mailContainsFinalContent([`Alpha\r\rBeta\n${url}`],pending,url),false,'lone CR is not normalized');
 assert.equal(mailContainsFinalContent([`Alpha\n\n Beta\n${url}`],pending,url),false,'whitespace remains exact');
 assert.equal(mailContainsFinalContent(['Alpha\n\nBeta',url],pending,url),false,'body and URL must occur in same part');
});
