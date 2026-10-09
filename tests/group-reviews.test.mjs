import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {readGroupReviewInPage,syncGroupReviews} from '../src/background/group-reviews.js';
import {emptyAccount} from '../src/background/domain.js';import {validateBackup} from '../src/background/migrations.js';
function page({count=1,cookie='ct0=csrf; twid=u%3D1',visible=true,status=200,errors}={}){
 const calls=[];const document={cookie,querySelectorAll:()=>[],querySelector:()=>visible?{}:null};
 const context={document,location:{origin:'https://x.com'},URL,AbortSignal,Date,fetch:async(url,options)=>{calls.push({url:String(url),options});return {ok:status===200,status,headers:{get:()=>null},json:async()=>({errors,data:{chat_by_conversation_id:{conversation:{get_group_join_requests:{total_count:count}}}}})};}};
 const run=input=>vm.runInNewContext('('+readGroupReviewInPage.toString()+')(input)',{...context,input});
 return {run,calls};
}
const input={origin:'https://x.com',accountId:'1',groupId:'g123',authorization:'Bearer public'};
test('group review uses only captured endpoint and variables, accepts zero without exposing applicants',async()=>{
 const {run,calls}=page({count:0});assert.equal((await run(input)).count,0);
 const url=new URL(calls[0].url);assert.equal(url.origin,'https://api.x.com');assert.equal(url.pathname,'/graphql/7maV7hhqFCfZn-aHJ3Ln0w/GetGroupJoinRequestsQuery');
 assert.deepEqual(JSON.parse(url.searchParams.get('variables')),{conversation_id:'g123',cursor:{}});assert.equal(calls[0].options.method,'GET');
});
test('invisible groups and switched accounts make no request; malformed results never become zero',async()=>{
 for(const options of [{visible:false},{cookie:'ct0=csrf; twid=u%3D2'}]){const {run,calls}=page(options);assert.ok((await run(input)).error);assert.equal(calls.length,0);}
 for(const count of [null,-1,1.5,'1'])assert.equal((await page({count}).run(input)).code,'REVIEW_UNAVAILABLE');
 assert.equal((await page({status:429}).run(input)).code,'HTTP_429');
});
test('review sync throttles per account, preserves count on failure, stops on limit and clears on confirmed zero',async()=>{
 const state={},s={accountId:'1'};let calls=0,saves=0;
 const adapter={groupReview:async()=>{calls++;return {count:1};}},checkpoint=async()=>saves++;
 await syncGroupReviews(s,state,adapter,checkpoint,['g1','g1'],{now:1000});assert.equal(calls,1);
 await syncGroupReviews(s,state,adapter,checkpoint,['g1'],{now:2000});assert.equal(calls,1);
 adapter.groupReview=async()=>{throw Object.assign(Error('限流'),{code:'HTTP_429',retryAt:200000});};
 await syncGroupReviews(s,state,adapter,checkpoint,['g1'],{now:70000});await syncGroupReviews(s,state,adapter,checkpoint,['g2'],{now:70001});assert.equal(state.groupReviews.g1.count,1);assert.equal(state.groupReviews.g2,undefined);
 adapter.groupReview=async()=>({count:0});await syncGroupReviews(s,state,adapter,checkpoint,['g1'],{now:200001});assert.equal(state.groupReviews.g1.count,0);assert.equal(saves,3);
});
test('session mismatch is not checkpointed and restored review data stays stale until rechecked',async()=>{
 let saves=0;await assert.rejects(syncGroupReviews({}, {},{groupReview:async()=>{throw Object.assign(Error('切换'),{code:'ACCOUNT_MISMATCH'});} },async()=>saves++,['g1']),/切换/);assert.equal(saves,0);
 const state=emptyAccount('1');state.groupReviews={g1:{count:1,updatedAt:100,nextAt:999999}};
 const restored=validateBackup(state,'1');assert.equal(restored.groupReviews.g1.nextAt,0);assert.equal(restored.groupReviews.g1.status,'error');
 state.groupReviews.g1.count=-1;assert.throws(()=>validateBackup(state,'1'),/审核数量/);
});
test('bounded review cache retains new failures so their cooldown survives pruning',async()=>{
 const state={groupReviews:Object.fromEntries(Array.from({length:200},(_,i)=>['g'+i,{count:0,updatedAt:1}]))};let calls=0;
 const adapter={groupReview:async()=>{calls++;throw Object.assign(Error('无权限'),{code:'HTTP_403'});}};
 await syncGroupReviews({},state,adapter,async()=>{},['g999'],{now:1000});assert.equal(Object.keys(state.groupReviews).length,200);assert.equal(state.groupReviews.g999.nextAt,601000);
 await syncGroupReviews({},state,adapter,async()=>{},['g999'],{now:2000});assert.equal(calls,1);
});
