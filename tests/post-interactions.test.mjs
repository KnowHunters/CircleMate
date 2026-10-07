import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PostInteractions} from '../src/background/post-interactions.js';
const session={accountId:'1'},post={id:'10',liked:false},message={accountId:'1',username:'alice',tweetId:'10',liked:true};
function setup(){let likes=0,reads=0,profiles=0,time=0;const state={};const adapter={profile:async()=>{profiles++;return {rest_id:'7',core:{screen_name:'alice'}};},recentPosts:async()=>{reads++;return [structuredClone(post)];},setPostLike:async(s,id,liked)=>{likes++;post.liked=liked;}};const service=new PostInteractions(adapter,{now:()=>time});return {service,adapter,state,checkpoint:async()=>{},setTime:t=>time=t,counts:()=>({likes,reads,profiles})};}
test('post cache is scoped to viewer and member, refreshed explicitly and bounded',async()=>{
 post.liked=false;const x=setup();await x.service.read(session,'Alice');await x.service.read(session,'alice');assert.equal(x.counts().reads,1);
 await x.service.read({accountId:'2'},'alice');assert.equal(x.counts().reads,2);
 x.setTime(60001);await x.service.read(session,'alice');assert.equal(x.counts().reads,3);
 await x.service.read(session,'alice',true);assert.equal(x.counts().reads,4);
});
test('like uses fresh target state, submits once, verifies independently and clears durable intent',async()=>{
 post.liked=false;const x=setup();await x.service.like(session,message,x.state,x.checkpoint);
 assert.deepEqual(x.counts(),{likes:1,reads:2,profiles:2});assert.deepEqual(x.state.postLikeIntents,{});
 await x.service.like(session,message,x.state,x.checkpoint);assert.equal(x.counts().likes,1);
});
test('persisted intent blocks replay after ambiguous failure, including worker restart',async()=>{
 post.liked=false;const x=setup();x.adapter.setPostLike=async()=>{throw new Error('lost response');};
 await assert.rejects(x.service.like(session,message,x.state,x.checkpoint),/lost/);assert.equal(x.state.postLikeIntents['10'].liked,true);
 const restarted=new PostInteractions(x.adapter);await assert.rejects(restarted.like(session,message,x.state,x.checkpoint),/仍未确认/);
 post.liked=true;await restarted.like(session,message,x.state,x.checkpoint);assert.deepEqual(x.state.postLikeIntents,{});
});
test('wrong account, missing target and unknown like status cannot issue writes',async()=>{
 post.liked=false;const x=setup();await assert.rejects(x.service.like({accountId:'2'},message,x.state,x.checkpoint),/不匹配/);
 await assert.rejects(x.service.like(session,{...message,tweetId:'11'},x.state,x.checkpoint),/不能点赞/);
 post.liked=null;await assert.rejects(x.service.like(session,message,x.state,x.checkpoint),/不能点赞/);assert.equal(x.counts().likes,0);
});
test('rate limiting cools new reads and writes instead of flooding the endpoint',async()=>{
 post.liked=false;const x=setup();x.adapter.recentPosts=async()=>{throw Object.assign(new Error('limited'),{retryAt:1000});};
 await assert.rejects(x.service.read(session,'alice'),/limited/);await assert.rejects(x.service.read(session,'alice'),/冷却/);
});
import {writePostInPage} from '../src/background/page-read.js';
test('JSON like transport matches captured body, blocks changed accounts and never retries a lost write',async()=>{
 const old={location:globalThis.location,document:globalThis.document,fetch:globalThis.fetch};let calls=0,seen;
 globalThis.location={origin:'https://x.com'};globalThis.document={cookie:'twid=u%3D1; ct0=test',documentElement:{lang:'zh'}};
 globalThis.fetch=async(url,options)=>{calls++;seen={url,body:JSON.parse(options.body),method:options.method};return {status:200,json:async()=>({data:{favorite_tweet:'Done'}}),headers:{get:()=>null}};};
 try{
  const args={origin:'https://x.com',accountId:'1',authorization:'test',operation:'FavoriteTweet',tweetId:'10'};
  assert.equal((await writePostInPage(args)).status,200);assert.deepEqual(seen,{url:'/i/api/graphql/lI07N6Otwv1PhnEgXILM7A/FavoriteTweet',body:{variables:{tweet_id:'10'},queryId:'lI07N6Otwv1PhnEgXILM7A'},method:'POST'});
  assert.equal((await writePostInPage({...args,accountId:'2'})).code,'ACCOUNT_MISMATCH');assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;throw new Error('timeout');};assert.equal((await writePostInPage(args)).code,'WRITE_UNCONFIRMED');assert.equal(calls,2);
  assert.equal((await writePostInPage({...args,operation:'CreateTweet'})).handled,false);assert.equal(calls,2);
 }finally{Object.assign(globalThis,old);}
});
test('explicit X rate rejection clears intent but retains cooldown',async()=>{
 post.liked=false;const x=setup();x.adapter.setPostLike=async()=>{throw Object.assign(new Error('limited'),{code:'HTTP_429',retryAt:1000});};
 await assert.rejects(x.service.like(session,message,x.state,x.checkpoint),/limited/);assert.deepEqual(x.state.postLikeIntents,{});
 await assert.rejects(x.service.like(session,message,x.state,x.checkpoint),/冷却/);
});
