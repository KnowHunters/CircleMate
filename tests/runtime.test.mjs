import { test } from "node:test";
import assert from "node:assert/strict";

test("MV3 message routing, committed projection and account switch isolation", async () => {
  let onMessage, onHeaders, accountId = "1";
  const data = {};
  globalThis.chrome = {
    runtime: { id: "extension", onMessage: { addListener(fn) { onMessage = fn; } } },
    webRequest: {
      onBeforeSendHeaders: { addListener(fn) { onHeaders = fn; } },
      onCompleted: { addListener() {} }
    },
    tabs: { async get() { return { url: "https://x.com/i/chat/g1/info" }; }, onRemoved: { addListener() {} } },
    cookies: { async getAllCookieStores() { return [{ id: "0", tabIds: [10] }]; }, async getAll() {
      return [{ name: "ct0", value: "csrf" }, { name: "auth_token", value: "SECRET" }, { name: "twid", value: "u%3D" + accountId }];
    } },
    storage: { local: {
      async get(keys) { return Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])); },
      async set(values) { Object.assign(data, structuredClone(values)); }
    } }
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.ok(url.pathname.endsWith('/UserByScreenName'));
    assert.equal(JSON.parse(url.searchParams.get('variables')).screen_name, 'owner');
    return { ok: true, async json() { return { data: { user: { result: { id_str: accountId, screen_name: "owner", name: "Owner", friends_count: 5 } } } }; } };
  };
  try {
    await import("../src/background/service-worker.js");
    const call = (action, extra = {}, sender = { id: "extension" }) => new Promise(resolve => {
      assert.equal(onMessage({ action, tabId: 10, ...extra }, sender, resolve), true);
    });
    const initial = await call("GET_STATE"); assert.equal(initial.state.accountId, "1");
    assert.equal(onMessage({ action: "FOLLOW" }, { id: "external" }, () => {}), false);
    assert.equal(onMessage({ action: "FOLLOW" }, { id: "extension", tab: { id: 10 } }, () => {}), false);
    onHeaders({ tabId: 10, url: "https://x.com/i/api/1.1/account/settings.json", method: "GET", requestHeaders: [{ name: "authorization", value: "Bearer test" }] });
    assert.equal((await call("ACCOUNT", { username: 'owner' })).state.account.followingCount, 5);
    assert.equal((await call("ROSTER", { groupId: "g1", title: "Group", users: [{ id: "2", username: "member", following: false }] }, { id: "extension", tab: { id: 10 } })).state.groups.length, 1);
    assert.equal((await call("ROSTER_REFERENCES", { groupId: "g2", usernames: ["foreign"] }, { id: "extension", tab: { id: 10 } })).ok, false);
    assert.equal((await call("FRAME_CONTEXT", {}, { id: "extension", tab: { id: 10 } })).groupId, "g1");
    assert.equal(onMessage({action:'FOLLOW',rosterInline:true},{id:'extension',tab:{id:10}},()=>{}),false);
    assert.equal(onMessage({action:'ROSTER_FOLLOW',groupId:'g1',userId:'2'},{id:'external',tab:{id:10}},()=>{}),false);
    assert.equal((await call('ROSTER_STATE',{groupId:'g1'},{id:'extension',tab:{id:10}})).state.groups[0].users[0].username,'member');
    assert.equal((await call('ROSTER_STATE',{groupId:'g2'},{id:'extension',tab:{id:10}})).ok,false);
    assert.equal((await call('ROSTER_FOLLOW',{groupId:'g2',userId:'2'},{id:'extension',tab:{id:10}})).ok,false);
    const embedded=await call('GET_STATE',{tabId:999},{id:'extension',url:'chrome-extension://extension/popup/index.html?embedded=1',tab:{id:10}});
    assert.equal(embedded.ok,true);assert.equal(embedded.state.accountId,'1');
    assert.equal(onMessage({action:'ACCOUNT'},{id:'extension',url:'https://x.com/popup/index.html',tab:{id:10}},()=>{}),false);
    accountId = "9";
    const switched = await call("GET_STATE"); assert.equal(switched.state.accountId, "9"); assert.equal(switched.state.groups.length, 0);
    accountId = "1";
    assert.equal((await call("GET_STATE")).state.groups.length, 1);
    assert.ok(!JSON.stringify(data).includes("SECRET")); assert.ok(!JSON.stringify(data).includes("Bearer test"));
  } finally { globalThis.fetch = realFetch; delete globalThis.chrome; }
});
