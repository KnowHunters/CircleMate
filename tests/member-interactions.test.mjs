import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseNotifications,interactionProjection,syncNotifications} from '../src/background/member-interactions.js';
const user=id=>({user_results:{result:{rest_id:id}}});
const target=(id,owner='1')=>({tweet_results:{result:{rest_id:id,core:user(owner)}}});
const like=(actors=['2'],targets=[target('10')])=>({entryId:'notification-like',content:{clientEventInfo:{element:'users_liked_your_tweet'},itemContent:{timestamp_ms:'2026-10-08T02:00:00Z',template:{from_users:actors.map(user),target_objects:targets}}}});
const reply=(owner='1')=>({entryId:'tweet-20',content:{clientEventInfo:{element:'user_replied_to_your_tweet'},itemContent:{tweet_results:{result:{rest_id:'20',core:user('2'),legacy:{in_reply_to_user_id_str:owner,in_reply_to_status_id_str:'10',created_at:'Thu Oct 08 02:10:00 +0000 2026'}}}}}});
const payload=(entries,cursor=null)=>({data:{viewer_v2:{user_results:{result:{notification_timeline:{timeline:{instructions:[{entries:[...entries,...(cursor?[{content:{cursorType:'Bottom',value:cursor}}]:[])]}]}}}}}}});
test('native notification shapes associate likes and direct replies, exclude other owners and ambiguous pairs',()=>{
  const result=parseNotifications(payload([like(['2','3']),reply(),reply('4'),like(['2','3'],[target('10'),target('11')]),like(['4'],[target('12','5')])]),'1');
  assert.equal(result.events.length,3);assert.deepEqual(result.events.map(e=>e.type),['like','like','reply']);
  assert.equal(result.events[0].at,Date.parse('2026-10-08T02:00:00Z'));
  assert.throws(()=>parseNotifications({},'1'),/结构/);
});
test('persisted cursor resumes across passes and repeated pages do not double counts; absent user stays absent',async()=>{
  const state={accountId:'1'},requests=[],s={accountId:'1'};let saved=0;
  const adapter={notifications:async(_s,c)=>{requests.push(c);return payload([like(),reply()],'next');}};
  const checkpoint=async()=>{saved++;};
  await syncNotifications(s,state,adapter,checkpoint,{now:100000});
  const restored=structuredClone(state);
  await syncNotifications(s,restored,adapter,checkpoint,{now:104000});
  assert.deepEqual(requests,[null,'next']);assert.equal(saved,4);
  const view=interactionProjection(restored.memberInteractions);
  assert.deepEqual(view.members['2'],{likes:1,replies:1});assert.equal(view.members['3'],undefined);assert.equal(view.partial,true);
  assert.equal(restored.memberInteractions.cursor,null);
  await syncNotifications(s,restored,adapter,checkpoint,{now:105000});assert.equal(requests.length,2);
});
test('429 or schema failure retains records and persisted cooldown suppresses manual and automatic reads',async()=>{
  const state={accountId:'1',memberInteractions:{events:{a:{userId:'2',type:'like'}},seen:[],cursor:null,pages:0}};let calls=0;
  const adapter={notifications:async()=>{calls++;throw Object.assign(new Error('限流'),{retryAt:300000});}};
  await syncNotifications({accountId:'1'},state,adapter,async()=>{},{now:100000});
  assert.equal(state.memberInteractions.retryAt,300000);assert.equal(state.memberInteractions.status,'error');
  await syncNotifications({accountId:'1'},state,adapter,async()=>{},{now:200000,force:true});assert.equal(calls,1);assert.equal(interactionProjection(state.memberInteractions).members['2'].likes,1);
});
