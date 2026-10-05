import assert from 'node:assert/strict';
import test from 'node:test';
import { TransactionHeaders } from '../src/background/transaction-headers.js';
import { ClientTransaction } from '../src/background/vendor/x-client-transaction/transaction.js';
const key = Buffer.from(Array.from({length:48},(_,i)=>i+1)).toString('base64');
const path='M0 0 L0 0C10 20 30 40 50 60 70 80 90 100 110';
const html=`<meta name="twitter-site-verification" content="${key}">${Array.from({length:4},(_,i)=>`<svg id="loading-x-anim-${i}"><path d="${path}"/></svg>`).join('')}"ondemand.s":"abc"`;
const asset='(a[1],16);(a[2],16);(a[3],16);(a[4],16)';
test('native transaction binds method and path and preserves public boot cache', async()=>{
 const generator=new ClientTransaction(html,asset);
 const id=await generator.generateTransactionId('GET','/i/api/graphql/test/Followers',null,null,null,12345);
 const bytes=Buffer.from(id,'base64'), mask=bytes[0], decoded=Array.from(bytes.subarray(1),v=>v^mask);
 assert.deepEqual(decoded.slice(0,48),Array.from({length:48},(_,i)=>i+1));
 assert.deepEqual(decoded.slice(48,52),[57,48,0,0]); assert.equal(decoded.at(-1),3);
 const other=await generator.generateTransactionId('GET','/i/api/graphql/test/Following',null,null,null,12345);
 const ob=Buffer.from(other,'base64'); assert.notDeepEqual(decoded.slice(52,68),Array.from(ob.subarray(53,69),v=>v^ob[0]));
 let calls=[]; const headers=new TransactionHeaders(async(url,options)=>{calls.push({url,options});return {ok:true,text:async()=>url.endsWith('/home')?html:asset};});
 await headers.get('https://x.com','GET','/a');await headers.get('https://x.com','GET','/b');
 assert.equal(calls.length,2);assert.equal(calls[1].options.credentials,'omit');
});
test('failed transaction initialization is retried rather than cached forever',async()=>{
 let calls=0; const headers=new TransactionHeaders(async()=>{calls++;return {ok:false};});
 await assert.rejects(headers.get('https://x.com','GET','/a'));await assert.rejects(headers.get('https://x.com','GET','/a'));assert.equal(calls,2);
});
