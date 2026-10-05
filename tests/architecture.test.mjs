import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {emptyAccount,upsertUser,projectAccount,completeSnapshot} from '../src/background/domain.js';
import {enqueueWrite,controlQueue,finishWrite} from '../src/background/write-queue.js';
import {Scheduler} from '../src/background/scheduler.js';
import {AccountRepository} from '../src/background/repository.js';
import {validateBackup} from '../src/background/migrations.js';
import {parseAnalytics, XWebAdapter} from '../src/background/x-adapter.js';
import {EndpointRegistry} from '../src/background/endpoint-registry.js';
import {createServices} from '../src/background/services.js';
const fixture=JSON.parse(await readFile(new URL('./fixtures/x-live-2026-10-05.json',import.meta.url),'utf8'));
const storage=()=>{const data={},writes=[];return{data,writes,async get(keys){return Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(data[k])]));},async set(v){writes.push(Object.keys(v));Object.assign(data,structuredClone(v));}};};
test('live response uses previous_totals and preserves missing follow metric values',()=>{
 const parsed=parseAnalytics({data:{viewer_v2:{user_results:{result:fixture.analytics}}}},{from:1790553600000,to:1791158400000});
 assert.equal(parsed.totals.Displayed,573);assert.equal(parsed.previousTotals.Displayed,508);
 assert.equal(parsed.totals.Follow,null);assert.equal(parsed.totals.Unfollow,null);assert.equal(parsed.daily['2026-09-29'].Unfollow,1);
 assert.equal(parsed.daily['2026-09-28'].Follow,0);assert.equal(parsed.totals.Engagement,undefined);assert.equal(parsed.totals.ProfileVisit,undefined);
});
test('live verified user retains server relations; snapshot start governs every projection',()=>{
 const state=emptyAccount('1');upsertUser(state,fixture.verifiedUser,'followers',150);
 state.groups.g1={id:'g1',userIds:['2'],lastSeen:1};
 state.lists.following={ids:[],complete:true,startedAt:100,fetchedAt:200};state.lists.followers={ids:['2'],complete:true,startedAt:100,fetchedAt:200};
 assert.equal(projectAccount(state).groups[0].users[0].following,true);assert.equal(projectAccount(state).followBack.length,0);
 state.lists.following.startedAt=160;
 assert.equal(projectAccount(state).groups[0].users[0].following,false);assert.deepEqual(projectAccount(state).followBack.map(u=>u.id),['2']);
});
test('durable queue deduplicates across group and follow-back; controls retain active request',()=>{
 const state=emptyAccount('1');upsertUser(state,fixture.verifiedUser,'profile',1);
 const a=enqueueWrite(state,{action:'FOLLOW',userId:'2',groupId:'g1'},10,100);
 assert.equal(enqueueWrite(state,{action:'FOLLOW_BACK',userId:'2'},11,101),a);
 a.status='running';controlQueue(state,'cancel');assert.equal(a.status,'running');
 finishWrite(state,a,{code:'WRITE_UNCONFIRMED',message:'uncertain',retryAt:2000},200);
 assert.equal(a.status,'unconfirmed');assert.throws(()=>enqueueWrite(state,{action:'FOLLOW',userId:'2'},10,300),/先核实/);
 assert.equal(JSON.parse(JSON.stringify(state)).writeQueue.jobs[0].status,'unconfirmed');
});
test('queue retries only HTTP 429 and uses persisted bounded random intervals',()=>{
 const state=emptyAccount('1');const job=enqueueWrite(state,{action:'FOLLOW',username:'fixture_user'},10,100);
 finishWrite(state,job,{code:'HTTP_429',message:'limited',retryAt:1000},200);assert.equal(job.status,'cooling');assert.equal(state.writeQueue.nextAt,1000);
 finishWrite(state,job,{code:'PROFILE_MISSING',message:'missing',retryAt:9000},1000,()=>1);assert.equal(job.status,'failed');assert.equal(state.writeQueue.nextAt,8000);
});
test('scheduler yields to user actions between background passes',async()=>{
 const scheduler=new Scheduler(),order=[];let release;
 const first=scheduler.add(async()=>{await new Promise(r=>release=r);order.push('current');});
 const background=scheduler.add(()=>order.push('background'),-1),user=scheduler.add(()=>order.push('user'),3);
 release();await Promise.all([first,background,user]);assert.deepEqual(order,['current','user','background']);
});
test('repository migrates once, writes only changed member buckets and isolates projections',async()=>{
 const store=storage(),repo=new AccountRepository(store),state=emptyAccount('1');state.schemaVersion=3;upsertUser(state,fixture.verifiedUser,'profile',1);
 store.data.circlemate_account_v3_1=structuredClone(state);
 const migrated=await repo.load('1');assert.equal(migrated.schemaVersion,4);assert.ok(store.data.circlemate_migration_backup_1);
 await repo.save(migrated);assert.ok(store.data.circlemate_account_v3_1.userBuckets);
 const loaded=await repo.load('1');assert.equal(loaded.users['2'].blueVerified,true);
 await repo.save(loaded);assert.equal(store.writes.at(-1).some(k=>k.includes('_users_')),false);
 loaded.users['2'].following=false;await repo.save(loaded);assert.equal(store.writes.at(-1).filter(k=>k.includes('_users_')).length,1);
 await repo.save(emptyAccount('9'));assert.equal(store.data.circlemate_view_1.accountId,'1');assert.equal(store.data.circlemate_view_9.accountId,'9');
});
test('backup rejects another account and does not execute imported queue intents',()=>{
 const state=emptyAccount('1');enqueueWrite(state,{action:'FOLLOW',username:'fixture_user'},10,100);
 assert.throws(()=>validateBackup(state,'9'),/账号不匹配/);
 const imported=validateBackup(state,'1');assert.equal(imported.writeQueue.jobs[0].status,'cancelled');assert.equal(imported.writeQueue.paused,true);
});
test('confirmed frozen response and missing response have distinct classifications',async()=>{
 const adapter=new XWebAdapter({fetch:()=>{},sessions:{},registry:{find:()=>({})}});
 adapter.graphql=async()=>({data:{user:{result:fixture.frozen}}});await assert.rejects(()=>adapter.profile({},'fixture_user'),e=>e.code==='ACCOUNT_UNAVAILABLE'&&e.reason==='Suspended');
 adapter.graphql=async()=>({data:{user:{}}});await assert.rejects(()=>adapter.profile({},'fixture_user'),e=>e.code==='PROFILE_MISSING');
});
test('endpoint candidates cannot replace verified configurations after failed requests',()=>{
 const registry=new EndpointRegistry({});const prior=registry.find('following');const url='https://x.com/i/api/graphql/not_verified/Following';
 registry.observe({url,method:'GET',tabId:1,requestId:'failed'});registry.completed({url,tabId:1,requestId:'failed',statusCode:404});assert.equal(registry.find('following'),prior);
});
test('read-only recheck recovers anomalies and resolves uncertain writes without a POST',async()=>{
 const state=emptyAccount('1');upsertUser(state,fixture.verifiedUser,'profile');state.groups.g1={userIds:['2']};state.unavailableAccounts={fixture_user:{availability:'unavailable'}};
 const job=enqueueWrite(state,{action:'FOLLOW',userId:'2'},10);job.status='unconfirmed';
 let reads=0;const services=createServices({checkpoint:async()=>{},adapter:{profile:async()=>{reads++;return fixture.verifiedUser;}}});
 await services.RECHECK_MEMBER({accountId:'1'},state,{accountId:'1',groupId:'g1',username:'fixture_user'});
 assert.equal(reads,1);assert.equal(state.users['2'].availability,'available');assert.equal(job.status,'complete');assert.equal(state.unavailableAccounts.fixture_user,undefined);
});
test('403 remains a request error unless a verified profile response confirms suspension',async()=>{
 const state=emptyAccount('1');upsertUser(state,{...fixture.verifiedUser,relationship_perspectives:{following:false}},'profile');state.groups.g1={userIds:['2']};
 const services=createServices({checkpoint:async()=>{},adapter:{follow:async()=>{throw Object.assign(new Error('403'),{code:'HTTP_403'});},profile:async()=>{throw Object.assign(new Error('suspended'),{code:'ACCOUNT_UNAVAILABLE',reason:'Suspended'});}}});
 await assert.rejects(()=>services.FOLLOW({accountId:'1'},state,{accountId:'1',groupId:'g1',userId:'2'}),e=>e.code==='ACCOUNT_UNAVAILABLE');
 assert.equal(state.unavailableAccounts.fixture_user.reason,'Suspended');assert.equal(projectAccount(state).groups[0].users[0].availability,'unavailable');
});
test('unverified unfollow endpoint cannot send a POST',async()=>{
 let requests=0;const adapter=new XWebAdapter({fetch:()=>{requests++;},sessions:{},registry:{hasWriteEvidence:()=>false}});
 assert.throws(()=>adapter.unfollow({},'2'),e=>e.code==='UNFOLLOW_NOT_VERIFIED');assert.equal(requests,0);
});
test('queue identity upgrades deduplicate username-only jobs and reject opposite intents',()=>{
 const state=emptyAccount('1');const job=enqueueWrite(state,{action:'FOLLOW',username:'fixture_user'},10);
 assert.equal(enqueueWrite(state,{action:'FOLLOW',userId:'2',username:'fixture_user'},11),job);
 assert.throws(()=>enqueueWrite(state,{action:'UNFOLLOW',userId:'2',username:'fixture_user'},11),/相反操作/);
});
