import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/shared/timeline-context.js';
import {PostInteractions} from '../src/background/post-interactions.js';
import {timelineTargetInPage} from '../src/background/timeline-target.js';
test('timeline support covers home tabs and profile routes while excluding details and chat',()=>{
  const supported=globalThis.CircleMate.isTimelinePath;
  for(const path of ['/home','/home/','/knowhunters','/jiaoxiawo/with_replies','/someone/media'])assert.equal(supported(path),true,path);
  for(const path of ['/explore','/search','/i/chat/g123/info','/someone/status/123','/compose/post','/bookmarks'])assert.equal(supported(path),false,path);
});
test('timeline reply verifies the visible post instead of limiting target to recent originals',async()=>{
  let checks=0,sends=0;const service=new PostInteractions({assertTimelineTarget:async()=>{checks++;},reply:async()=>{sends++;return {confirmed:true,replyId:'456'};}});
  service.read=async()=>{throw new Error('must not fetch originals');};
  const message={timeline:true,accountId:'1',username:'other',tweetId:'123',text:'test',token:'token-123456'};
  const state={};await service.reply({accountId:'1'},message,state,async()=>{});await service.reply({accountId:'1'},message,state,async()=>{});
  assert.equal(checks,1);assert.equal(sends,1);
});
test('timeline post lost before send leaves no intent and sends no request',async()=>{
  const service=new PostInteractions({assertTimelineTarget:async()=>{throw Object.assign(new Error('gone'),{code:'WRITE_NOT_SENT'});},reply:async()=>assert.fail('must not send')});
  const state={};await assert.rejects(service.reply({accountId:'1'},{timeline:true,accountId:'1',username:'other',tweetId:'123',text:'test',token:'token-123456'},state,async()=>{}),/gone/);assert.deepEqual(state.replyIntents,{});
});
test('native permalink target ignores quoted posts and disabled replies',()=>{
  const previous={location:globalThis.location,document:globalThis.document};
  globalThis.location={origin:'https://x.com'};let disabled=false;
  const article={querySelector:selector=>selector==='a[href] time'?{closest:()=>anchor}:{closest:()=>article,disabled,getAttribute:()=>null}};
  const anchor={href:'https://x.com/outer/status/123',closest:()=>article};globalThis.document={querySelectorAll:()=>[article]};
  try{assert.equal(timelineTargetInPage({origin:'https://x.com',username:'outer',tweetId:'123'}),true);assert.equal(timelineTargetInPage({origin:'https://x.com',username:'quoted',tweetId:'456'}),false);disabled=true;assert.equal(timelineTargetInPage({origin:'https://x.com',username:'outer',tweetId:'123'}),false);}finally{Object.assign(globalThis,previous);}
});
