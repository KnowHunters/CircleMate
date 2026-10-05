import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runWritePass} from '../src/background/write-runner.js';
import {enqueueWrite,nextWrite,pruneQueue} from '../src/background/write-queue.js';
import {Scheduler} from '../src/background/scheduler.js';
import {emptyAccount} from '../src/background/domain.js';

function harness(){
 const accounts=new Map([['1',emptyAccount('1')],['2',emptyAccount('2')]]),writes=[],alarms=[];
 let clock=1000;
 return {accounts,writes,alarms,setTime:t=>clock=t,deps:{
  now:()=>clock,sessions:{get:async tabId=>({tabId,accountId:tabId===20?'2':'1'})},
  repository:{load:async id=>structuredClone(accounts.get(id))},
  checkpoint:async(s,state)=>{assert.equal(s.accountId,state.accountId);accounts.set(s.accountId,structuredClone(state));},
  adapter:{profile:async()=>({id:'3',username:'member',following:true})},
  services:{FOLLOW:async(s,state,job)=>{writes.push({account:s.accountId,id:job.id,tab:s.tabId});}},
  armWrites:(tab,when)=>alarms.push({tab,when})
 }};
}
test('two tabs execute a single persisted intent once through the shared scheduler',async()=>{
 const h=harness();enqueueWrite(h.accounts.get('1'),{action:'FOLLOW',userId:'3',username:'member'},10,1);
 const scheduler=new Scheduler();await Promise.all([scheduler.add(()=>runWritePass(10,h.deps),2),scheduler.add(()=>runWritePass(11,h.deps),2)]);
 assert.equal(h.writes.length,1);assert.equal(h.accounts.get('1').writeQueue.jobs[0].status,'complete');
});
test('different account tab cannot drain another account queue, replacement tab can',async()=>{
 const h=harness();enqueueWrite(h.accounts.get('1'),{action:'FOLLOW',userId:'3',username:'member'},10,1);
 await runWritePass(20,h.deps);assert.equal(h.writes.length,0);
 await runWritePass(11,h.deps);assert.equal(h.writes.length,1);assert.equal(h.writes[0].account,'1');assert.equal(h.writes[0].tab,11);
});
test('persisted cooling survives wakeups until both deadlines have passed',async()=>{
 const h=harness(),state=h.accounts.get('1');const job=enqueueWrite(state,{action:'FOLLOW',username:'member'},10,1);
 job.status='cooling';job.retryAt=5000;state.writeQueue.nextAt=3000;
 await runWritePass(11,h.deps);assert.equal(h.writes.length,0);assert.equal(h.alarms.at(-1).when,5000);
 h.setTime(6000);await runWritePass(11,h.deps);assert.equal(h.writes.length,1);
});
test('restarting a paused queue reconciles a running request without replaying a POST',async()=>{
 const h=harness(),state=h.accounts.get('1'),job=enqueueWrite(state,{action:'FOLLOW',userId:'3',username:'member'},10,1);
 job.status='running';state.writeQueue.paused=true;
 await runWritePass(11,h.deps);assert.equal(h.writes.length,0);assert.equal(h.accounts.get('1').writeQueue.jobs[0].status,'complete');assert.equal(h.accounts.get('1').writeQueue.paused,true);
});
test('foreign historic intent is cancelled before any write',async()=>{
 const h=harness(),job=enqueueWrite(h.accounts.get('1'),{action:'FOLLOW',username:'member'},10,1);job.accountId='2';
 await runWritePass(10,h.deps);assert.equal(h.writes.length,0);assert.equal(h.accounts.get('1').writeQueue.jobs[0].status,'cancelled');
});
test('history pruning retains all unresolved intents, including older unconfirmed results',()=>{
 const unresolved={id:'uncertain',status:'unconfirmed',updatedAt:1};
 const running={id:'running',status:'running',updatedAt:1};
 const queue={jobs:[unresolved,running,...Array.from({length:1200},(_,i)=>({id:String(i),status:'complete',updatedAt:200000000}))]};
 pruneQueue(queue,200000001);assert.equal(queue.jobs.length,1000);assert.ok(queue.jobs.includes(unresolved));assert.ok(queue.jobs.includes(running));
 const state=emptyAccount('1');state.writeQueue={...queue,paused:true};assert.equal(nextWrite(state).job,null);
});
