import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAnalytics, XWebAdapter } from '../src/background/x-adapter.js';
test('previous analytics window aggregates disjoint verification partitions without backfill overlap',()=>{
 const from=Date.UTC(2026,9,1),to=Date.UTC(2026,9,8);
 const row=(count,verified,timestamp)=>({count,is_engaging_user_verified:verified,engagement_type:'Fav',timestamp});
 const data=parseAnalytics({data:{viewer_v2:{user_results:{result:{current_time_series:[row(10,'true',from)],previous_totals:[row(2,'true',from-86400000),row(3,'false',from-86400000),row(99,'true',from)]}}}}},{from,to});
 assert.equal(data.totals.Fav,10);assert.equal(data.previousTotals.Fav,5);assert.equal(data.previousTotals.ProfileVisit,undefined);
});
import { createServices } from '../src/background/services.js';
import { emptyAccount } from '../src/background/domain.js';
const range = {from:Date.parse('2026-10-01T00:00:00Z'),to:Date.parse('2026-10-04T00:00:00Z')};
test('analytics separates verified partitions and excludes overlapping hourly backfill', () => {
  const row = (count,verified,type='Reply') => ({count,is_engaging_user_verified:verified,engagement_type:type,timestamp:range.from});
  const output = parseAnalytics({data:{viewer_v2:{user_results:{result:{current_time_series:[row(2,'true'),row(3,'false'),row(4,'true','ReplyCreate'),row(-1,'true'),row(7,'unknown')],hourly_backfill:[row(500,'true')],verified_follower_count:'20',relationship_counts:{followers:25},realtime_active_followers:{active_count:10,is_approximate:true}}}}}},range);
  assert.equal(output.totals.Reply,5); assert.equal(output.totals.ReplyCreate,4); assert.equal(output.invalidRows,2);
  assert.equal(output.verifiedFollowers,20); assert.equal(output.activeApproximate,true); assert.equal(output.timeZone,'UTC');
  assert.equal(output.daily['2026-10-01'].Reply,5); assert.equal(output.totals.Displayed,undefined);
});
test('analytics rejects missing schema and constructs matching UTC request windows', async () => {
  assert.throws(()=>parseAnalytics({data:{}},range));
  let vars;
  const adapter = new XWebAdapter({registry:{find:()=>({operation:'accountOverviewDailyQuery'})}});
  adapter.graphql = async (_s,_r,v)=> {vars=v;return {data:{viewer_v2:{user_results:{result:{current_time_series:[]}}}}};};
  await adapter.analytics({});
  assert.equal(vars.current_to-vars.current_from,7*86400000);
  assert.equal(Date.parse(vars.current_from_iso),vars.current_from);
  assert.equal(vars.prev_to,vars.current_from); assert.equal(vars.backfill_to,vars.current_to);
});
test('creator checkpoints each page, resumes failed kind and stores no text', async () => {
  const state=emptyAccount('1'); let fail=true; const calls=[]; let saved;
  const now=new Date().toISOString();
  const services=createServices({checkpoint:async (_s,v)=>{saved=structuredClone(v);},adapter:{async creatorPage(_s,kind,cursor){
    calls.push([kind,cursor]);
    if(kind==='replies'&&fail) throw Object.assign(new Error('limited'),{code:'HTTP_429',retryAt:1});
    return {tweets:kind==='posts'?[{id_str:'2',created_at:now,full_text:'DO NOT STORE'}]:[],complete:Boolean(cursor)||kind!=='posts',cursor:!cursor&&kind==='posts'?'next':null};
  }}});
  await assert.rejects(services.CREATOR({},state));
  assert.equal(saved.creator.replies,null); assert.equal(saved.creator.reposts,null); assert.equal(saved.tasks.creator.status,'error'); assert.equal(saved.creator.posts,1); assert.equal(saved.tasks.creator.coverage.posts.cursor,'next');
  assert.equal(JSON.stringify(saved).includes('DO NOT STORE'),false);
  fail=false;await services.CREATOR({},state);
  assert.deepEqual(calls.slice(2).map(x=>x[0]),['posts','replies','reposts']);
  assert.equal(state.creator.complete,true); assert.equal(state.creator.posts,1);
});
test('group membership comes from explicit references and enrichment checkpoints partial failures', async () => {
  const state=emptyAccount('1'); state.users['2']={id:'2',username:'known'};state.users['9']={id:'9',username:'outsider'};
  let count=0;
  const services=createServices({checkpoint:async()=>{},adapter:{async profile(_s,username){count++;if(username==='missing')throw new Error('unavailable');return {id:'3',username,following:false};}}});
  await services.ROSTER_REFERENCES({},state,{groupId:'g1',usernames:['known','newbie','missing','known','bad name']});
  assert.deepEqual(state.groups.g1.userIds,['2']); assert.equal(state.groups.g1.complete,false);
  await services.ENRICH_GROUP({},state,{groupId:'g1'});
  assert.equal(count,1);await services.ENRICH_GROUP({},state,{groupId:'g1'});
  assert.deepEqual(state.groups.g1.userIds,['2','3']);assert.equal(count,2);assert.equal(state.groups.g1.error,'unavailable');
  await services.ENRICH_GROUP({},state,{groupId:'g1'});assert.equal(count,2);
  await services.ENRICH_GROUP({},state,{groupId:'g1',retryFailed:true});assert.equal(count,3);
  await assert.rejects(services.ROSTER_REFERENCES({},state,{groupId:'__proto__',usernames:['known']}));
});
test('inline enrichment progresses past unknown relations and processes later registered members',async()=>{
 const state=emptyAccount('1');let calls=[];
 const services=createServices({checkpoint:async()=>{},adapter:{profile:async(_s,name)=>{calls.push(name);return{id:String(100+Number(name.slice(1))),username:name,following:name==='u0'?null:false};}}});
 await services.ROSTER_REFERENCES({},state,{groupId:'g1',usernames:Array.from({length:10},(_,i)=>'u'+i)});
 for(let i=0;i<10;i++)await services.ENRICH_GROUP({accountId:'1'},state,{groupId:'g1',refreshUnknown:true});
 assert.equal(calls.length,10);assert.equal(state.groups.g1.failedReferences.u0.code,'RELATION_UNKNOWN');
 await services.ROSTER_REFERENCES({},state,{groupId:'g1',usernames:Array.from({length:16},(_,i)=>'u'+(10+i))});
 for(let i=0;i<17;i++)await services.ENRICH_GROUP({accountId:'1'},state,{groupId:'g1',refreshUnknown:true});
 assert.equal(calls.length,26);assert.equal(state.groups.g1.userIds.length,26);assert.equal(calls.filter(n=>n==='u0').length,1);
});

test('inline enrichment prioritizes visible registered members without adding outsiders',async()=>{
 const state=emptyAccount('1');let calls=[];const services=createServices({checkpoint:async()=>{},adapter:{profile:async(_s,name)=>{calls.push(name);return{id:String(100+Number(name.slice(1))),username:name,following:false};}}});
 await services.ROSTER_REFERENCES({},state,{groupId:'g1',usernames:Array.from({length:12},(_,i)=>'u'+i)});
 await services.ENRICH_GROUP({accountId:'1'},state,{groupId:'g1',refreshUnknown:true,priorityUsernames:['outsider','u11']});
 assert.equal(calls[0],'u11');assert.equal(calls.length,1);assert.ok(!calls.includes('outsider'));
});

test('creator head refresh detects a new reply while preserving committed today records',async()=>{
 const state=emptyAccount('1'); let reply=false; const cursors=[];
 const services=createServices({checkpoint:async()=>{},adapter:{async creatorPage(_s,kind,cursor){
 cursors.push(cursor); return {tweets:kind==='replies'&&reply?[{id_str:'9',created_at:new Date().toISOString(),in_reply_to_status_id_str:'8'}]:[],complete:false,cursor:'next'};
 }}});
 await services.CREATOR({},state); assert.equal(state.creator.replies,0);
 reply=true; await services.CREATOR({},state,{refreshHead:true});
 assert.equal(state.creator.replies,1); assert.deepEqual(cursors,[undefined,undefined,undefined,undefined,undefined,undefined]);
});
