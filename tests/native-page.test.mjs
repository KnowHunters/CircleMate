import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createServices } from '../src/background/services.js';
import { emptyAccount } from '../src/background/domain.js';
const context = { URL }; vm.createContext(context);
vm.runInContext(await readFile(new URL('../src/shared/native-page.js', import.meta.url),'utf8'), context);
const read = context.CircleMate.readNativePage;
const anchor = (href,text) => ({ textContent:text, getAttribute:()=>href, querySelector:()=>({textContent:text}) });
const cell = (username,following,followsYou=false) => ({ textContent:followsYou ? '关注了你' : '',
  querySelectorAll: selector => selector==='a[href]' ? [anchor('/'+username,'Name @'+username)] : [],
  querySelector: selector => selector.includes('-unfollow') ? following ? {textContent:'正在关注'} : null : selector.includes('-follow') ? !following ? {textContent:'回关'} : null : null });
const location = {origin:'https://x.com',pathname:'/owner/verified_followers'};
test('native counts read exact values, reject rounded labels and foreign profile',()=>{
  const document={querySelectorAll:selector=>selector==='a[href]' ? [anchor('/owner/following','626'),anchor('/owner/followers','440')] : []};
  assert.equal(read(document,location,{username:'owner'}).counts.followersCount,440);
  assert.equal(read(document,location,{username:'owner'}).counts.followingCount,626);
  document.querySelectorAll=selector=>selector==='a[href]' ? [anchor('/owner/followers','1.2K')] : [];
  assert.equal(read(document,location,{username:'owner'}).counts.followersCount,undefined);
  assert.equal(read(document,location,{username:'someone_else'}),null);
});
test('native follower rows preserve follow-back status and loaded scope without inventing IDs',()=>{
  const document={querySelectorAll:selector=>selector==='a[href]' ? [] : [cell('one',true),cell('two',false)]};
  const result=read(document,location,{username:'owner'});
  assert.equal(result.users[0].following,true); assert.equal(result.users[1].following,false);
  assert.equal(result.users[1].followedBy,true); assert.equal(result.users[1].id,undefined); assert.equal(result.complete,false);
});
test('native snapshot populates own counts and known members, protects confirmed follow writes',async()=>{
  const state=emptyAccount('1'); state.users['2']={id:'2',username:'one',following:false};
  state.users['3']={id:'3',username:'two',following:true,sources:{'follow-write':Date.now()},fieldSources:{following:{source:'follow-write',observedAt:Date.now()}}};
  const services=createServices({checkpoint:async()=>{},adapter:{nativeSnapshot:async()=>({owner:'owner',displayName:'Owner',kind:'followers',counts:{followingCount:626,followersCount:440},users:[{username:'one',following:true,followedBy:true},{username:'two',following:false}]})}});
  await services.GET_STATE({accountId:'1'},state);
  assert.equal(state.account.followersCount,440); assert.equal(state.account.id,'1');
  assert.equal(state.users['2'].following,true); assert.equal(state.users['3'].following,true);
  assert.equal(state.nativePage.complete,false); assert.equal(Object.keys(state.users).length,2);
});
