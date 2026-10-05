import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoSync, CACHE_TTL } from '../src/background/auto-sync.js';
import { emptyAccount } from '../src/background/domain.js';
function fixture() {
  let clock = 100000000; const state = emptyAccount('1'), calls = [];
  const services = {
    ACCOUNT: async () => { calls.push('account'); state.account = { fetchedAt: clock }; },
    CREATOR: async () => { calls.push('creator'); state.creator = { today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(clock)), fetchedAt: clock }; state.tasks.creator = { status: 'complete', startedAt: clock }; },
    ANALYTICS: async () => { calls.push('analytics'); state.analytics = { parserVersion:2,fetchedAt: clock }; },
    SYNC_LIST: async (_s,_state,{kind}) => { calls.push(kind); state.lists[kind] = { fetchedAt: clock, complete: true }; state.tasks[kind] = { status: 'complete' }; }
  };
  const run = () => autoSync({ session: { accountId: '1' }, state, services, checkpoint: async () => {}, now: () => clock });
  return { state, services, calls, run, advance: ms => clock += ms };
}
test('automatic first sync caches all read jobs and skips fresh caches after restart', async () => {
  const f = fixture(); await f.run(); assert.deepEqual(f.calls,Object.keys(CACHE_TTL));
  f.calls.length = 0; await f.run(); assert.equal(f.calls.length,0);
  f.advance(CACHE_TTL.account + 1); await f.run(); assert.deepEqual(f.calls,['account','creator']);
});

test('parser upgrade refreshes recent analytics before unfinished lists without waiting for TTL',async()=>{
 const f=fixture();await f.run();f.calls.length=0;delete f.state.analytics.parserVersion;
 f.state.tasks.following.status='paused';f.advance(1);
 await autoSync({session:{accountId:'1'},state:f.state,services:f.services,checkpoint:async()=>{},now:()=>100000001,maxJobs:1});
 assert.deepEqual(f.calls,['analytics']);assert.equal(f.state.analytics.parserVersion,2);
});
test('parser upgrade respects a real analytics cooldown',async()=>{
 const f=fixture();await f.run();f.calls.length=0;delete f.state.analytics.parserVersion;f.state.autoSync.jobs.analytics.retryAt=100100000;
 await f.run();assert.ok(!f.calls.includes('analytics'));
});
test('incomplete lists resume one page each pass, with no polling before a minute', async () => {
  const f = fixture(); let page = 0;
  f.services.SYNC_LIST = async (_s,state,{kind}) => { f.calls.push(kind); page++; state.tasks[kind] = { status: 'paused', cursor: String(page) }; };
  await f.run(); assert.equal(page,3); await f.run(); assert.equal(page,3);
  f.advance(60001); await f.run(); assert.equal(page,6);
});
test('rate limits preserve cache, persist retry and isolate failure from other jobs', async () => {
  const f = fixture(); const old = { fetchedAt:1, followersCount:440 }; f.state.account=old;
  f.services.ACCOUNT = async () => { f.calls.push('account'); throw Object.assign(new Error('limited'),{code:'HTTP_429',retryAt:100600000}); };
  await f.run(); assert.equal(f.state.account,old); assert.equal(f.state.autoSync.status,'partial');
  assert.equal(f.state.autoSync.jobs.account.retryAt,100600000); assert.ok(f.calls.includes('followers'));
  f.calls.length=0; f.advance(300000); await f.run(); assert.ok(!f.calls.includes('account'));
  f.advance(300001); await f.run(); assert.ok(f.calls.includes('account'));
});
test('stale follow list invalidation refreshes before its TTL', async () => {
  const f = fixture(); await f.run(); f.calls.length=0; f.state.lists.following.stale=true;
  f.advance(60001); await f.run(); assert.deepEqual(f.calls,['following']);
});
test('fresh cache checks never advertise running network requests', async () => {
  const f=fixture(); await f.run(); const statuses=[];
  await autoSync({session:{accountId:'1'},state:f.state,services:f.services,now:()=>100000000,checkpoint:async()=>statuses.push(f.state.autoSync.status)});
  assert.ok(!statuses.includes('running'));
});
test('updated request policy retries cached 404 once without discarding pagination', async () => {
  const f=fixture(); f.state.autoSync={jobs:{followers:{error:{code:'HTTP_404'},retryAt:200000000,lastAttempt:100000000}}};
  f.state.tasks.followers={status:'error',cursor:'saved-cursor'};
  await f.run(); assert.ok(f.calls.includes('followers')); assert.equal(f.state.autoSync.policyVersion,3);
});

test('today counters refresh automatically and yesterday cache cannot suppress them', async () => {
 const f=fixture(); await f.run(); f.calls.length=0; f.advance(CACHE_TTL.creator+1);
 await f.run(); assert.deepEqual(f.calls,['creator']);
 f.calls.length=0; f.state.creator.today='1900-01-01'; f.advance(60001);
 await f.run(); assert.deepEqual(f.calls,['creator']);
});
