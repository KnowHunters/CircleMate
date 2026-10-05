import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyAccount, upsertUser, projectAccount, completeSnapshot } from "../src/background/domain.js";
import { AccountRepository } from "../src/background/repository.js";
import { createServices } from "../src/background/services.js";
import { EndpointRegistry } from "../src/background/endpoint-registry.js";
import { SessionProvider } from "../src/background/session.js";
import { parseUserPage, XWebAdapter } from "../src/background/x-adapter.js";
const member = { id: "2", username: "member", displayName: "Member", following: false };
test('follow-back combines both follower pages and preserves direct relationship evidence over snapshot completion',()=>{
 const state=emptyAccount('1');
 for(const [id,username,following]of [['2','ordinary',false],['3','verified',false],['4','mutual',true]])upsertUser(state,{id,username,following,followedBy:true},'followers',10);
 state.lists.followers={ids:['2'],complete:true,fetchedAt:1};
 state.lists.following={ids:['2','3'],complete:true,fetchedAt:20};
 state.tasks.followers={ids:['2','4'],status:'paused'};
 state.tasks.verifiedFollowers={ids:['3','2'],status:'paused'};
 assert.deepEqual(projectAccount(state).followBack.map(u=>u.id),['2','3']);
 upsertUser(state,{id:'2',username:'ordinary',following:true},'follow-write',30);
 assert.deepEqual(projectAccount(state).followBack.map(u=>u.id),['3']);
});
test('follow-back projection excludes mutual, unknown, requested and unavailable users; accepts only cached followers',async()=>{
 const state=emptyAccount('1');
 for(const [id,username,fields] of [['2','member',{following:false}],['3','mutual',{following:true}],['4','requested',{following:false,followRequested:true}],['5','unavailable',{following:false}],['6','unknown',{}]])upsertUser(state,{id,username,...fields},'profile',10);
 state.unavailableAccounts={unavailable:{availability:'unavailable'}};
 state.lists.followers={ids:['2','3','4','5','6'],complete:true,fetchedAt:1};
 assert.deepEqual(projectAccount(state).followBack.map(u=>u.id),['2']);
 let writes=0;const services=createServices({adapter:{follow:async()=>{writes++;return{id_str:'2',following:true};}},checkpoint:async()=>{}});
 await services.FOLLOW_BACK({accountId:'1'},state,{accountId:'1',userId:'2'});
 assert.equal(writes,1);assert.equal(state.users['2'].following,true);assert.ok(state.users['2'].followedAt);
 assert.equal(projectAccount(state).followBack.length,0);
 await assert.rejects(()=>services.FOLLOW_BACK({accountId:'1'},state,{accountId:'1',userId:'99'}),/不在需回关/);
});
test('unfollow commits only confirmed false and removes cached following membership',async()=>{
 const state=emptyAccount('1');upsertUser(state,{...member,following:true},'group');state.users['2'].followedAt=100;
 state.groups.g={userIds:['2'],usernames:['member']};state.lists.following={ids:['2'],complete:true,fetchedAt:1};
 let writes=0;const services=createServices({adapter:{unfollow:async()=>{writes++;return{id_str:'2',following:false};}},checkpoint:async()=>{}});
 await services.UNFOLLOW({accountId:'1'},state,{accountId:'1',groupId:'g',userId:'2',username:'member'});
 assert.equal(writes,1);assert.equal(state.users['2'].following,false);assert.equal(state.users['2'].followedAt,null);assert.deepEqual(state.lists.following.ids,[]);
 await assert.rejects(()=>services.UNFOLLOW({accountId:'1'},state,{accountId:'3',groupId:'g',userId:'2'}),/账号已切换/);
});
test('ambiguous unfollow does not alter cache or repeat the write',async()=>{
 const state=emptyAccount('1');upsertUser(state,{...member,following:true},'group');state.groups.g={userIds:['2']};
 let writes=0;const services=createServices({adapter:{unfollow:async()=>{writes++;return{};},profile:async()=>({...member,following:true})},checkpoint:async()=>{}});
 await assert.rejects(()=>services.UNFOLLOW({accountId:'1'},state,{accountId:'1',groupId:'g',userId:'2'}),e=>e.code==='WRITE_UNCONFIRMED');
 assert.equal(writes,1);assert.equal(state.users['2'].following,true);
});
test('automatic enrichment persists unavailable accounts without user IDs',async()=>{
  const state=emptyAccount('1');state.groups.g={userIds:[],usernames:['member']};
  const services=createServices({adapter:{profile:async()=>{throw Object.assign(new Error('suspended'),{code:'ACCOUNT_UNAVAILABLE'});}},checkpoint:async()=>{}});
  await services.ENRICH_GROUP({accountId:'1'},state,{groupId:'g',refreshUnknown:true});
  assert.equal(projectAccount(JSON.parse(JSON.stringify(state))).groups[0].users[0].availability,'unavailable');
});
test('unavailable username without a profile ID persists across cache reload and blocks follow',async()=>{
  const state=emptyAccount('1');state.groups.g={userIds:[],usernames:['member']};
  const services=createServices({adapter:{},checkpoint:async()=>{}});
  await services.MARK_UNAVAILABLE({accountId:'1'},state,{groupId:'g',username:'member'});
  const restored=JSON.parse(JSON.stringify(state));
  assert.equal(projectAccount(restored).groups[0].users[0].availability,'unavailable');
  await assert.rejects(()=>services.FOLLOW({accountId:'1'},restored,{groupId:'g',username:'member'}),e=>e.code==='ACCOUNT_UNAVAILABLE');
});
test('complete following cache resolves username-only members without profile requests; partial absence stays unknown', async()=>{
  const state=emptyAccount('1');state.groups.g={userIds:[],usernames:['stranger','member']};
  upsertUser(state,{...member,following:null},'following',1);
  state.lists.following={ids:['2'],complete:true,fetchedAt:2};
  let requests=0;const services=createServices({adapter:{profile(){requests++;throw Error('unexpected');}},checkpoint:async()=>{}});
  await services.ENRICH_GROUP({accountId:'1'},state,{groupId:'g',refreshUnknown:true});
  assert.equal(requests,0);
  let users=projectAccount(state).groups[0].users;
  assert.equal(users.find(u=>u.username==='stranger').following,false);
  assert.equal(users.find(u=>u.username==='member').following,true);
  state.lists.following.complete=false;
  assert.equal(projectAccount(state).groups[0].users.find(u=>u.username==='stranger').following,undefined);
});
test('username-only follow resolves ID on click, rejects outsiders and reuses cached profile',async()=>{
  const state=emptyAccount('1');state.groups.g={userIds:[],usernames:['member']};let profiles=0,writes=0;
  const services=createServices({adapter:{profile:async()=>{profiles++;return member;},follow:async()=>{writes++;return{id_str:'2',following:true};}},checkpoint:async()=>{}});
  await assert.rejects(services.FOLLOW({accountId:'1'},state,{groupId:'g',username:'outsider'}));
  await services.FOLLOW({accountId:'1'},state,{groupId:'g',username:'member'});
  await services.FOLLOW({accountId:'1'},state,{groupId:'g',username:'member'});
  assert.equal(profiles,1);assert.equal(writes,1);
});
test('profile cooldown is shared between groups and survives projection',async()=>{
  const state=emptyAccount('1');state.groups.g={userIds:[],usernames:['member']};state.profileRetryAt=Date.now()+60000;
  let requests=0;const services=createServices({adapter:{profile(){requests++;}},checkpoint:async()=>{}});
  await assert.rejects(services.ENRICH_GROUP({accountId:'1'},state,{groupId:'g'}),e=>e.code==='PROFILE_COOLDOWN');
  assert.equal(requests,0);assert.equal(projectAccount(state).groups[0].retryAt,state.profileRetryAt);
});
function storage(initial = {}) {
  const data = structuredClone(initial);
  return { data, async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])); }, async set(values) { Object.assign(data, structuredClone(values)); } };
}
test("user ID merge preserves known fields and provenance", () => {
  const state = emptyAccount("1");
  upsertUser(state, { ...member, blueVerified: true }, "following", 10);
  upsertUser(state, { ...member, username: "renamed", following: null, blueVerified: null }, "group", 20);
  assert.equal(Object.keys(state.users).length, 1);
  assert.equal(state.users["2"].following, false);
  assert.equal(state.users["2"].blueVerified, true);
  assert.equal(state.users["2"].username, "renamed");
  assert.equal(state.users["2"].fieldSources.blueVerified.source, "following");
});
test("repository keeps two accounts and migrates owned v2 records", async () => {
  const store = storage({ circlemate_local_v1: { schemaVersion: 2, accountId: "1", groups: [{ id: "g", label: "Group", users: [member], lastSeen: 2 }] } });
  const repo = new AccountRepository(store);
  const first = await repo.load("1"); assert.equal(first.groups.g.userIds[0], "2");
  await repo.save(first); await repo.save(emptyAccount("9"));
  assert.equal((await repo.load("1")).users["2"].username, "member");
  assert.deepEqual((await repo.load("9")).users, {});
  assert.equal(store.data.circlemate_local_v1.accountId, "9");
});
test("unowned legacy records do not migrate", async () => {
  const repo = new AccountRepository(storage({ circlemate_local_v1: { groups: [{ id: "g", users: [member] }] } }));
  assert.deepEqual((await repo.load("1")).groups, {});
});
test("list resumes committed cursor after error and worker restart", async () => {
  let state = emptyAccount("1"); let committed; let fail = false; const cursors = [];
  const adapter = { async userPage(s, kind, cursor) {
    cursors.push(cursor);
    if (fail) throw Object.assign(new Error("limited"), { code: "HTTP_429" });
    return cursor ? { users: [{ id: "3", username: "next" }], cursor: null, complete: true, source: "legacy" }
      : { users: [member], cursor: "page2", complete: false, source: "legacy" };
  } };
  let services = createServices({ adapter, checkpoint: async (s, v) => { committed = structuredClone(v); } });
  await services.SYNC_LIST({}, state, { kind: "following" });
  assert.equal(state.tasks.following.status, "paused"); assert.equal(projectAccount(state).relationships.following.complete, false);
  fail = true; await assert.rejects(services.SYNC_LIST({}, state, { kind: "following" }));
  assert.equal(committed.tasks.following.cursor, "page2"); assert.equal(committed.tasks.following.ids.length, 1);
  state = structuredClone(committed); fail = false;
  services = createServices({ adapter, checkpoint: async (s, v) => { committed = structuredClone(v); } });
  await services.SYNC_LIST({}, state, { kind: "following" });
  assert.deepEqual(cursors, [null, "page2", "page2"]);
  assert.deepEqual(state.lists.following.ids, ["2", "3"]); assert.equal(state.lists.following.changes, null);
});
test("only complete snapshots establish and compare baselines", () => {
  const state = emptyAccount("1");
  completeSnapshot(state, "followers", { ids: ["2", "3"] }, 10);
  assert.equal(state.lists.followers.changes, null);
  state.tasks.followers = { ids: ["2"], status: "paused" };
  assert.equal(projectAccount(state).relationships.followers.complete, false);
  assert.equal(state.lists.followers.ids.length, 2);
  completeSnapshot(state, "followers", { ids: ["3", "4"] }, 20);
  assert.deepEqual(state.lists.followers.changes.added, ["4"]);
  assert.deepEqual(state.lists.followers.changes.removed, ["2"]);
});
test("partial list absence remains unknown, completed lists fill group relations", () => {
  const state = emptyAccount("1"); upsertUser(state, { ...member, following: null }, "group", 1);
  state.groups.g = { id: "g", userIds: ["2"], lastSeen: 1 };
  state.tasks.following = { ids: [], status: "paused" };
  assert.equal(projectAccount(state).groups[0].users[0].following, undefined);
  completeSnapshot(state, "following", { ids: [] }, 10);
  assert.equal(projectAccount(state).groups[0].users[0].following, false);
});
test("follow failure preserves state; success patches snapshot and protects duplicates", async () => {
  const state = emptyAccount("1"); let calls = 0; let fail = true;
  upsertUser(state, member, "group", 1); state.groups.g = { id: "g", userIds: ["2"] };
  state.account = { followingCount: 7 }; completeSnapshot(state, "following", { ids: [] }, 1);
  const services = createServices({ adapter: { async follow() { calls++; if (fail) throw new Error("failed"); return { following: true }; } }, checkpoint: async () => {} });
  await assert.rejects(services.FOLLOW({}, state, { groupId: "g", userId: "2" }));
  assert.equal(state.users["2"].following, false); assert.equal(state.lists.following.stale, false);
  fail = false; await services.FOLLOW({}, state, { groupId: "g", userId: "2" });
  await services.FOLLOW({}, state, { groupId: "g", userId: "2" });
  assert.equal(calls, 2); assert.equal(state.users["2"].following, true); assert.equal(state.lists.following.stale, false); assert.ok(state.lists.following.ids.includes("2"));
  assert.equal(state.account.followingCount, null);
  await assert.rejects(services.FOLLOW({}, state, { groupId: "other", userId: "2" }));
});
test("protected follow request remains pending", async () => {
  const state = emptyAccount("1"); upsertUser(state, member, "group"); state.groups.g = { userIds: ["2"] };
  const services = createServices({ adapter: { async follow() { return { follow_request_sent: true }; } }, checkpoint: async () => {} });
  await services.FOLLOW({}, state, { groupId: "g", userId: "2" });
  assert.equal(state.users["2"].following, false); assert.equal(state.users["2"].followRequested, true);
});
test("registry persists no account IDs, cursors, headers or credential values", async () => {
  const store = storage(); const registry = new EndpointRegistry(store); await registry.load();
  const url = new URL("https://x.com/i/api/graphql/query123/Following");
  url.searchParams.set("variables", JSON.stringify({ userId: "sensitive-id", cursor: "private-cursor", count: 200 }));
  url.searchParams.set("features", JSON.stringify({ flag: true, auth_token: "secret" }));
  registry.observe({ url: url.href, method: "GET",tabId:1,requestId:'verified', requestHeaders: [{ value: "secret" }] });
  registry.completed({url:url.href,tabId:1,requestId:'verified',statusCode:200});await registry.save();
  assert.equal(registry.find("following").queryId, "query123");
  const saved = JSON.stringify(store.data); for (const value of ["sensitive-id", "private-cursor", "secret"]) assert.ok(!saved.includes(value));
  assert.equal(registry.observe({ url: "https://x.com/i/api/graphql/q/CreateTweet", method: "POST" }), null);
});
test("GraphQL parser selects timeline users and cursor, rejects changed schemas", () => {
  const result = parseUserPage({ data: { user: { result: { timeline: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: [
    { content: { itemContent: { user_results: { result: { rest_id: "2", core: { screen_name: "member", name: "Member" }, is_blue_verified: true } } } } },
    { content: { cursorType: "Bottom", value: "next" } }
  ] }] } } } } } });
  assert.equal(result.users.length, 1); assert.equal(result.cursor, "next"); assert.equal(result.complete, false);
  assert.throws(() => parseUserPage({ data: {} }));
  const end = parseUserPage({ data: { user: { result: { timeline: { instructions: [{ type: "TimelineTerminateTimeline", direction: "Bottom" }] } } } } });
  assert.equal(end.complete, true);
});
test("session uses the tab cookie store and detects login switches", async () => {
  let accountId = "1"; let options;
  const chrome = { tabs: { async get() { return { url: "https://x.com/home" }; } }, cookies: {
    async getAllCookieStores() { return [{ id: "0", tabIds: [10] }]; }, async getAll(value) { options = value; return [
      { name: "ct0", value: "csrf" }, { name: "auth_token", value: "secret" }, { name: "twid", value: "u%3D" + accountId }
    ]; } } };
  const sessions = new SessionProvider(chrome);
  sessions.observe({ tabId: 10, requestHeaders: [{ name: "Authorization", value: "Bearer test" }] });
  const s = await sessions.get(10); assert.equal(options.storeId, "0"); assert.equal(s.accountId, "1");
  accountId = "9"; await assert.rejects(sessions.assertCurrent(s));
  await assert.rejects(sessions.get(11));
});
test("429 sets cooldown and transport checks session around requests", async () => {
  let checks = 0;
  const adapter = new XWebAdapter({ registry: {}, sessions: { async assertCurrent() { checks++; } }, fetch: async () => ({ ok: false, status: 429, headers: { get() { return null; } } }) });
  await assert.rejects(adapter.legacy({ origin: "https://x.com", authorization: "Bearer test", csrf: "csrf" }, "friends/list", {}), e => e.code === "HTTP_429" && e.retryAt > Date.now());
  assert.equal(checks, 1);
});

test('account relationship projection does not infer missing followers from partial snapshots',()=>{
 const state=emptyAccount('1');upsertUser(state,{id:'2',username:'someone'},'profile',1);state.groups.g={userIds:['2']};
 state.lists.following={ids:['2'],complete:true,fetchedAt:2};state.lists.followers={ids:[],complete:false,fetchedAt:2};
 let user=projectAccount(state).groups[0].users[0];assert.equal(user.following,true);assert.notEqual(user.followedBy,false);
 state.lists.followers.complete=true;user=projectAccount(state).groups[0].users[0];assert.equal(user.followedBy,false);
 state.lists.followers.stale=true;assert.notEqual(projectAccount(state).groups[0].users[0].followedBy,false);
});

test('relationship refresh preserves usable snapshot and follow writes after scan started',()=>{
 const state=emptyAccount('1');completeSnapshot(state,'following',{ids:[]},10);
 state.tasks.following={ids:[],status:'paused',startedAt:15,pages:1};
 assert.equal(projectAccount(state).relationships.following.cachedComplete,true);
 upsertUser(state,{id:'2',username:'alice',following:true},'follow-write',20);
 completeSnapshot(state,'following',state.tasks.following,30);
 assert.deepEqual(state.lists.following.ids,['2']);
});

test('old complete following cache recovers after pagination overwrites write provenance',async()=>{
 const state=emptyAccount('1');state.lists.following={ids:[],complete:true,stale:true,fetchedAt:30};
 upsertUser(state,{id:'2',username:'alice',following:true},'follow-write',20);
 upsertUser(state,{id:'2',username:'alice',following:true},'following',40);
 state.schemaVersion=3;const store=storage();await store.set({circlemate_account_v3_1:state});
 const loaded=await new AccountRepository(store).load('1');
 assert.equal(loaded.lists.following.stale,false);assert.deepEqual(loaded.lists.following.ids,['2']);
 assert.equal(projectAccount(loaded).relationships.following.cachedComplete,true);
});

test('follow acknowledges legacy fields and verifies ambiguous response without repeating writes',async()=>{
 for(const scenario of ['legacy','ambiguous','lost']){
 const state=emptyAccount('1');upsertUser(state,member,'group',1);state.groups.g={userIds:['2']};let writes=0,reads=0;
 const services=createServices({checkpoint:async()=>{},adapter:{async follow(){writes++;if(scenario==='lost')throw Object.assign(new Error('lost'),{code:'WRITE_UNCONFIRMED'});return scenario==='legacy'?{rest_id:'2',legacy:{following:true}}:{id_str:'2'};},async profile(){reads++;return {...member,following:true};}}});
 await services.FOLLOW({accountId:'1'},state,{groupId:'g',userId:'2'});
 assert.equal(writes,1);assert.equal(reads,scenario==='legacy'?0:1);assert.equal(state.users['2'].following,true);
 }
});
test('ambiguous follow never claims success on negative or mismatched verification',async()=>{
 const state=emptyAccount('1');upsertUser(state,member,'group',1);state.groups.g={userIds:['2']};let writes=0;
 const services=createServices({checkpoint:async()=>{},adapter:{async follow(){writes++;return {};},async profile(){return {...member,following:false};}}});
 await assert.rejects(services.FOLLOW({accountId:'1'},state,{groupId:'g',userId:'2'}),e=>e.code==='WRITE_UNCONFIRMED');assert.equal(writes,1);assert.equal(state.users['2'].following,false);
});

test('captured live follow response commits the confirmed account without profile retry',async()=>{
 const state=emptyAccount('1');upsertUser(state,{id:'412111646',username:'yuehqiang',following:false},'group');state.groups.g={userIds:['412111646']};let writes=0;
 const services=createServices({checkpoint:async()=>{},adapter:{async follow(_s,id){writes++;assert.equal(id,'412111646');return {id_str:'412111646',screen_name:'yuehqiang',following:true,follow_request_sent:false};},async profile(){throw Error('confirmed POST must not trigger profile retry');}}});
 await services.FOLLOW({accountId:'1'},state,{groupId:'g',userId:'412111646'});assert.equal(writes,1);assert.equal(state.users['412111646'].following,true);
});
