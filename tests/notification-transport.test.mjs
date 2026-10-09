import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readInPage} from '../src/background/page-read.js';
test('MAIN transport admits verified notification GET, rejects unrelated operations and mismatched accounts',async()=>{
 let calls=0;
 const ctx={location:{origin:'https://x.com'},document:{cookie:'ct0=test; twid=u%3D1',documentElement:{lang:'en'}},URL,URLSearchParams,AbortSignal,
 fetch:async()=>{calls++;return {ok:true,status:200,json:async()=>({data:{}}),headers:{get:()=>null}};}};
 const read=vm.runInNewContext('('+readInPage.toString()+')',ctx);
 const input={origin:'https://x.com',accountId:'1',path:'/i/api/graphql/4TuDRWeusve2-BH2IqldBg/NotificationsTimeline',params:{variables:JSON.stringify({timeline_type:'All',count:20})},authorization:'test'};
 assert.equal((await read(input)).status,200);assert.equal(calls,1);
 assert.equal((await read({...input,path:'/i/api/graphql/id/UnknownOperation'})).handled,false);
 assert.equal((await read({...input,accountId:'2'})).code,'ACCOUNT_MISMATCH');assert.equal(calls,1);
});
