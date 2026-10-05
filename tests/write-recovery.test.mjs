import {test} from 'node:test';
import assert from 'node:assert/strict';
import {recoverWrite} from '../src/background/write-recovery.js';
import {emptyAccount,upsertUser,projectAccount} from '../src/background/domain.js';
import {createServices} from '../src/background/services.js';
const session={accountId:'1'};
const member={id:'2',username:'member',following:true};
const job=()=>({userId:'2',username:'member',action:'FOLLOW',status:'running'});
test('restart reconciliation respects profile cooldown without replaying writes',async()=>{
 const state=emptyAccount('1'),task=job();state.profileRetryAt=200;
 await recoverWrite(session,state,task,{profile(){throw Error('unexpected read');}},100);
 assert.equal(task.status,'unconfirmed');assert.equal(task.retryAt,200);
});
test('restart suspension evidence persists and leaves the active queue',async()=>{
 const state=emptyAccount('1'),task=job();upsertUser(state,member,'group',1);state.groups.g1={userIds:['2']};
 await recoverWrite(session,state,task,{profile:async()=>{throw Object.assign(Error('frozen'),{code:'ACCOUNT_UNAVAILABLE',reason:'Suspended'});}},100);
 assert.equal(task.status,'failed');assert.equal(state.unavailableAccounts.member.reason,'Suspended');
 assert.equal(projectAccount(state).groups[0].users[0].availability,'unavailable');
});
test('restart confirms relationship and snapshot without sending a write',async()=>{
 const state=emptyAccount('1'),task=job();state.lists.following={complete:true,ids:[]};
 await recoverWrite(session,state,task,{profile:async()=>member},100);
 assert.equal(task.status,'complete');assert.deepEqual(state.lists.following.ids,['2']);assert.equal(state.users['2'].followedAt,100);
});
test('captured stale destroy response is verified once and never retried',async()=>{
 const state=emptyAccount('1');upsertUser(state,member,'group');state.groups.g1={userIds:['2']};state.lists.following={complete:true,ids:['2']};
 let writes=0,reads=0;
 const services=createServices({checkpoint:async()=>{},adapter:{unfollow:async()=>{writes++;return{id_str:'2',screen_name:'member',following:true};},profile:async()=>{reads++;return{...member,following:false};}}});
 await services.UNFOLLOW(session,state,{accountId:'1',groupId:'g1',userId:'2'});
 assert.equal(writes,1);assert.equal(reads,1);assert.equal(state.users['2'].following,false);assert.deepEqual(state.lists.following.ids,[]);
});
