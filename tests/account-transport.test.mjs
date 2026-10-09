import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { XWebAdapter } from '../src/background/x-adapter.js';
import { EndpointRegistry } from '../src/background/endpoint-registry.js';
import { SessionProvider } from '../src/background/session.js';
const sessions = { assertCurrent: async () => {} };
const s = { accountId: '1', tabId: 10, origin: 'https://x.com', csrf: 'csrf', authorization: 'Bearer public' };
const raw = { id_str: '1', screen_name: 'owner', name: 'Owner', friends_count: 4 };
const payload = { data: { user: { result: raw } } };
const registry = () => new EndpointRegistry({ get: async () => ({}), set: async () => {} });

test('account prefers verified profile over cached ID route and verifies cookie identity', async () => {
  const r = registry(); r.records.UserByRestId = { operation: 'UserByRestId', queryId: 'obsolete', observedAt: Date.now() };
  const adapter = new XWebAdapter({ registry: r, sessions, fetch: async url => {
    assert.ok(url.pathname.endsWith('/UserByScreenName'));
    assert.equal(JSON.parse(url.searchParams.get('variables')).screen_name, 'owner');
    return { ok: true, json: async () => payload };
  } });
  assert.equal((await adapter.account({ ...s, viewer: { username: 'owner' } }, 'stale')).followingCount, 4);
  await assert.rejects(adapter.account({ ...s, accountId: '9', viewer: { username: 'owner' } }), e => e.code === 'ACCOUNT_MISMATCH');
  await assert.rejects(new XWebAdapter({ registry: registry() }).account(s), e => e.code === 'ACCOUNT_CONTEXT_MISSING');
});

test('obsolete observed profile 404 falls back to verified bundle and removes stale cache', async () => {
  const r = registry(); r.records.UserByScreenName.queryId = 'obsolete'; let count = 0;
  const adapter = new XWebAdapter({ registry: r, sessions, fetch: async url => {
    count++;
    return url.pathname.includes('/obsolete/') ? { ok: false, status: 404 } : { ok: true, json: async () => payload };
  } });
  assert.equal((await adapter.account(s, 'owner')).id, '1');
  assert.equal(count, 2); assert.notEqual(r.find('profile').queryId, 'obsolete');
});

test('page session transport uses top frame; failed or lost follow response is never replayed', async () => {
  let background = 0, page = 0;
  const adapter = new XWebAdapter({ registry: registry(), sessions, fetch: async () => { background++; throw new Error('unexpected'); }, chrome: { tabs: {
    async sendMessage(tab, message, options) {
      page++; assert.equal(tab, 10); assert.equal(options.frameId, 0);
      if (message.method === 'POST') throw new Error('port disconnected');
      return { handled: true, status: 200, data: payload };
    }
  } } });
  assert.equal((await adapter.account(s, 'owner')).id, '1');
  await assert.rejects(adapter.follow(s, '2'), e => e.code === 'WRITE_UNCONFIRMED');
  assert.equal(page, 2); assert.equal(background, 0);
  adapter.chrome.tabs.sendMessage = async () => ({ handled: true, status: 403 });
  await assert.rejects(adapter.follow(s, '2'), e => e.code === 'HTTP_403');
  assert.equal(background, 0);
});

test('cookie session can bootstrap with public application bearer after worker restart', async () => {
  const provider = new SessionProvider({ tabs: { get: async () => ({ url: 'https://x.com/home' }), sendMessage: async () => ({ username: 'owner' }) },
    cookies: { getAllCookieStores: async () => [{ id: '0', tabIds: [10] }], getAll: async () => [
      { name: 'ct0', value: 'csrf' }, { name: 'twid', value: 'u%3D1' }, { name: 'auth_token', value: 'private' }
    ] } });
  const session = await provider.get(10);
  assert.ok(session.authorization.startsWith('Bearer ')); assert.equal(session.viewer.username, 'owner');
  assert.ok(!JSON.stringify(session).includes('private'));
});
test('list request matches native shape by omitting absent field toggles', async () => {
  const adapter=new XWebAdapter({registry:registry(),sessions,fetch:async url=>{
    assert.ok(url.pathname.endsWith('/Followers'));
    assert.equal(url.searchParams.has('fieldToggles'),false);
    assert.equal(JSON.parse(url.searchParams.get('variables')).userId,'1');
    return {ok:true,json:async()=>({data:{}})};
  }});
  await adapter.graphql(s,adapter.registry.find('followers'),{userId:'1'});
});
test('read-only requests use MAIN world, while failures export no account or credentials', async () => {
  const r=registry(); let options;
  const adapter=new XWebAdapter({registry:r,sessions,fetch:async()=>{throw new Error('unexpected fallback');},chrome:{scripting:{executeScript:async value=>{
    options=value;return [{result:{handled:true,status:404,contentType:'application/json',data:{errors:[{code:34,message:'not found'}]}}}];
  }}}});
  adapter.transactions.get=async()=> 'test-transaction';
  await assert.rejects(adapter.graphql(s,r.find('followers'),{userId:'1'}),e=>e.code==='HTTP_404');
  assert.equal(options.world,'MAIN');assert.deepEqual(options.target.frameIds,[0]);
  const diag=r.records.Followers.lastFailure;assert.equal(diag.transport,'main-page');assert.deepEqual(diag.apiCodes,[34]);
  assert.ok(!JSON.stringify(diag).includes('Bearer'));assert.equal(diag.accountId,undefined);
});

test('content transport restricts sender, endpoint and account, then posts only once', async () => {
  let listener, requests = [];
  const window = {}; window.top = window;
  const context = { window, URL, URLSearchParams, Set, AbortSignal, location: { origin: 'https://x.com', pathname: '/home' },
    setTimeout: () => 1, clearTimeout() {}, MutationObserver: class { observe() {} },
    document: { cookie: 'ct0=csrf; twid=u%3D1', documentElement: { lang: 'en' },
      querySelector: selector => selector.includes('AppTabBar') ? { getAttribute: () => '/owner' } : { textContent: 'Owner @owner' }, querySelectorAll: () => [] },
    fetch: async (url, options) => { requests.push({ url, options }); return { status: 200, ok: true, headers: { get: () => null }, json: async () => raw }; },
    chrome: { runtime: { id: 'extension', onMessage: { addListener(fn) { listener = fn; } } } } };
  vm.runInNewContext(await readFile(new URL('../src/content/content.js', import.meta.url), 'utf8'), context);
  const call = message => new Promise(resolve => listener(message, { id: 'extension' }, resolve));
  assert.equal((await call({ type: 'CIRCLEMATE_GET_VIEWER' })).username, 'owner');
  context.document.querySelector = selector => selector.includes('AppTabBar') ? null : { textContent: 'Owner @owner' };
  assert.equal((await call({ type: 'CIRCLEMATE_GET_VIEWER' })).username, 'owner');
  context.document.querySelector = () => null;
  assert.equal((await call({ type: 'CIRCLEMATE_GET_VIEWER' })).username, '');
  const message = { type: 'CIRCLEMATE_PAGE_REQUEST', accountId: '1', method: 'POST', path: '/i/api/1.1/friendships/create.json', params: { user_id: '2' }, authorization: 'Bearer public' };
  assert.equal(listener(message, { id: 'external' }, () => {}), false);
  assert.equal((await call({ ...message, path: '/i/api/1.1/blocks/create.json' })).code, 'REQUEST_REJECTED');
  assert.equal((await call({ ...message, accountId: '9' })).code, 'ACCOUNT_MISMATCH');
  assert.equal(requests.length, 0);
  assert.equal((await call(message)).status, 200);
  assert.equal(requests.length, 1); assert.equal(requests[0].options.credentials, 'include');
  assert.equal(requests[0].options.headers['x-csrf-token'], 'csrf');
  assert.equal(requests[0].options.body.toString(), 'user_id=2');
  assert.equal((await call({ ...message, method: 'GET', path: '/i/api/graphql/4TuDRWeusve2-BH2IqldBg/NotificationsTimeline', params: { variables: '{}' } })).status, 200);
  assert.equal(requests.length, 2);
});

test('profile supports mixed core and legacy fields while retaining username checks',async()=>{
 const adapter=new XWebAdapter({registry:registry()});
 adapter.graphql=async()=>({data:{user:{result:{rest_id:'2',core:{created_at:'2020-01-01'},legacy:{screen_name:'BiaKinha20',name:'Member',following:false}}}}});
 const user=await adapter.profile(s,'biakinha20');assert.equal(user.id,'2');assert.equal(user.username,'biakinha20');assert.equal(user.displayName,'Member');assert.equal(user.following,false);
 await assert.rejects(adapter.profile(s,'another'),e=>e.code==='PROFILE_MISMATCH');
 adapter.graphql=async()=>({data:{user:{result:{__typename:'UserUnavailable'}}}});
 await assert.rejects(adapter.profile(s,'biakinha20'),e=>e.code==='ACCOUNT_UNAVAILABLE');
 adapter.graphql=async()=>({errors:[{message:'restricted'}]});
 await assert.rejects(adapter.profile(s,'biakinha20'),e=>e.code==='PROFILE_API_ERROR');
});
