import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PostInteractions} from '../src/background/post-interactions.js';
import {XWebAdapter} from '../src/background/x-adapter.js';
import {writeReplyInPage} from '../src/background/page-read.js';
import {nativeReplyRequest} from '../src/background/reply-request.js';
const payload=JSON.parse(await readFile(new URL('./fixtures/reply-native-2026-10-07.json',import.meta.url)));
const s={accountId:'1638101918869524482',origin:'https://x.com',tabId:1};
const message={accountId:s.accountId,username:'knowhunters',tweetId:'2106224569686368292',text:'CircleMate 内嵌回复功能测试，测试后删除。',token:'test-token-12345'};
test('native reply response verifies author, target and text',async()=>{
  let sends=0;
  const adapter=new XWebAdapter({sessions:{assertCurrent:async()=>{}},chrome:{scripting:{executeScript:async()=>{sends++;return [{result:{status:200,data:payload}}];}}}});
  adapter.transactions={get:async()=> 'signature'};
  assert.equal((await adapter.reply(s,message.tweetId,message.text)).replyId,'2107695618135376114');
  await assert.rejects(adapter.reply(s,'123',message.text),/未确认/);
  assert.equal(sends,2);
});
test('completed reply token returns prior result and ambiguous reply survives worker restart',async()=>{
  let sends=0;const adapter={reply:async()=>{sends++;return {confirmed:true,replyId:'456'};}};
  const service=new PostInteractions(adapter);service.read=async()=>({username:'knowhunters',posts:[{id:message.tweetId,limited:false}]});
  const state={},checkpoint=async()=>{};
  await service.reply(s,message,state,checkpoint);await service.reply(s,message,state,checkpoint);assert.equal(sends,1);
  adapter.reply=async()=>{sends++;throw new Error('timeout');};
  await assert.rejects(service.reply(s,{...message,token:'another-token'},state,checkpoint));
  const restarted=new PostInteractions(adapter);restarted.read=service.read;
  await assert.rejects(restarted.reply(s,{...message,token:'third-token'},state,checkpoint),/未确认/);assert.equal(sends,2);
});
test('failed preflight permits retry without retaining a sent intent',async()=>{
  const service=new PostInteractions({reply:async()=>{throw Object.assign(new Error('signature unavailable'),{code:'WRITE_NOT_SENT'});}});
  service.read=async()=>({posts:[{id:message.tweetId}]});const state={};
  await assert.rejects(service.reply(s,message,state,async()=>{}));assert.deepEqual(state.replyIntents,{});
});
test('page transport sends captured reply shape once and rejects account mismatch',async()=>{
  const previous={location:globalThis.location,document:globalThis.document,fetch:globalThis.fetch};let calls=0;
  globalThis.location={origin:s.origin};globalThis.document={cookie:`twid=u%3D${s.accountId}; ct0=csrf`,documentElement:{lang:'zh'}};
  globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/i/api/graphql/5pUpVEnRC2yGK7jaguF11w/CreateTweet');assert.deepEqual(JSON.parse(options.body),body);return {status:200,json:async()=>payload};};
  const body=structuredClone(nativeReplyRequest);body.variables.tweet_text=message.text;body.variables.reply.in_reply_to_tweet_id=message.tweetId;
  try{await writeReplyInPage({...s,body,authorization:'test',transactionId:'sig'});const result=await writeReplyInPage({...s,accountId:'2',body});assert.equal(result.code,'WRITE_NOT_SENT');assert.equal(calls,1);}finally{Object.assign(globalThis,previous);}
});
