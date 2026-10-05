import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("popup renders an empty account and reads account-scoped state", async () => {
  const elements = new Map(); const calls = [];
  const element = key => {
    if (!elements.has(key)) elements.set(key, { textContent: "", innerHTML: "", style: {}, dataset: {},
      classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, setAttribute() {},
      append(){},replaceChildren(){},querySelector: child => element(key + child), querySelectorAll: () => [] });
    return elements.get(key);
  };
  const context = {
    Date, Intl, Map, console,
    document: { documentElement: {}, createElement:tag=>element('new-'+tag),getElementById: element, querySelector: element, querySelectorAll: () => [] },
    chrome: { tabs: {
      async query() { return [{ id: 10 }]; }, sendMessage(id, message, callback) { callback({ isChat: false, accountUsername: "owner" }); }
    }, runtime: { async sendMessage(message) { calls.push(message); return { ok: true, state: { accountId: "1", groups: [], relationships: {}, tasks: {} } }; } },
    storage: { onChanged: { addListener() {} } } }
  };
  vm.createContext(context);
  vm.runInContext(await readFile(new URL("../src/shared/constants.js", import.meta.url), "utf8"), context);
  vm.runInContext(await readFile(new URL("../src/popup/i18n.js", import.meta.url), "utf8"), context);
  vm.runInContext(await readFile(new URL("../src/popup/charts.js", import.meta.url), "utf8"), context);
  vm.runInContext(await readFile(new URL("../src/popup/main.js", import.meta.url), "utf8"), context);
  await new Promise(setImmediate);
  assert.equal(calls[0].action, "GET_STATE");
  assert.equal(calls[0].username, "owner");
  assert.equal(element("account-following").textContent, "—");
  assert.equal(element("today-posts").textContent, "—");
  assert.equal(element("service-status").textContent, "");
});

async function interactivePopup(state, language = 'zh', sizing = null) {
  const elements = new Map(), calls = [], saved = [];
  const element = key => {
    if (!elements.has(key)) {
      const classes = new Set(), attrs = new Map(), handlers = {};
      elements.set(key, { textContent: '', innerHTML: '', style: {}, dataset: {}, handlers, attrs, classes,children:[],
        append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;},
        classList: { toggle(name, on) { on ? classes.add(name) : classes.delete(name); } },
        setAttribute(name, value) { attrs.set(name, value); },
        addEventListener(name, callback) { handlers[name] = callback; }, focus() {},
        querySelector: child => element(key + child), querySelectorAll: () => [] });
    }
    return elements.get(key);
  };
  const languages = ['zh', 'en'].map(lang => Object.assign(element(lang), { dataset: { language: lang } }));
  const tabs = ['members', 'stats', 'guide'].map(view => Object.assign(element('tab-' + view), { dataset: { view } }));
  const serviceButton=Object.assign(element('manual-sync'),{dataset:{service:'SYNC_LIST',kind:'followers'},hasAttribute:()=>false});
  element('confirm-dialog').showModal=()=>{};element('confirm-dialog').close=()=>{};
  const context = { Date, Intl, Map, console,
    document: { documentElement: {},createElement:tag=>element('new-'+tag+'-'+elements.size), getElementById: element, querySelector: selector => selector.startsWith('[data-kind=') ? element((selector.includes(':not(') ? 'button-' : 'rebuild-') + selector.match(/data-kind="([^"]+)"/)[1]) : null,
      querySelectorAll: selector => selector === '[data-language]' ? languages : selector === '.tab' ? tabs : selector === '[data-service]' ? [serviceButton] : [] },
    chrome: { tabs: { query: async () => [{ id: 10 }], sendMessage(id, m, cb) { cb({ isChat: true, groupId: 'g' }); } },
      runtime: { async sendMessage(m) { calls.push(m); return { ok: true, state }; } },
      storage: { local: { get: async () => ({ circlemate_ui_preferences: { language } }), set: async value => saved.push(value) }, onChanged: { addListener() {} } } }
  };
  if(sizing){context.URL=URL;
    context.document.documentElement.dataset={};context.document.referrer='https://x.com/';
    const app=element('app');app.scrollHeight=sizing.content;app.getBoundingClientRect=()=>({height:sizing.visible});
    const query=context.document.querySelector;context.document.querySelector=s=>s==='.app'?app:query(s);
    context.window={parent:{postMessage:m=>sizing.messages.push(m)},addEventListener(){}};
    context.requestAnimationFrame=fn=>{fn();return 1;};context.cancelAnimationFrame=()=>{};
    context.ResizeObserver=class{constructor(fn){sizing.report=fn;}observe(){}};
    context.MutationObserver=class{observe(){}};
  }
  vm.createContext(context);
  for (const path of ['shared/constants.js', 'popup/i18n.js', 'popup/charts.js', 'popup/main.js']) vm.runInContext(await readFile(new URL('../src/' + path, import.meta.url), 'utf8'), context);
  await new Promise(setImmediate);
  return { element, calls, saved, document: context.document };
}

test('language persists, minimize preserves state, and keyboard changes tabs', async () => {
  const ui = await interactivePopup({ accountId: '1', groups: [], relationships: {}, tasks: {} }, 'en');
  assert.equal(ui.document.documentElement.lang, 'en');
  assert.equal(ui.element('run-status-text').textContent, '');
  ui.element('minimize-button').handlers.click();
  assert.ok(ui.element('popup-body').classes.has('hidden'));
  assert.equal(ui.element('minimize-button').attrs.get('aria-expanded'), 'false');
  assert.equal(ui.calls.length, 1);
  ui.element('minimize-button').handlers.click();
  ui.element('tab-members').handlers.keydown({ key: 'ArrowRight', preventDefault() {} });
  assert.equal(ui.element('tab-stats').attrs.get('aria-selected'), 'true');
  assert.ok(ui.element('members-view').classes.has('hidden'));
  await ui.element('zh').handlers.click();
  assert.equal(ui.document.documentElement.lang, 'zh-CN');
  assert.equal(ui.saved[0].circlemate_ui_preferences.language, 'zh');
});
test('follow-back card renders a per-account action without requiring a group',async()=>{
 const ui=await interactivePopup({accountId:'1',groups:[],relationships:{following:{cachedComplete:true,users:[]},followers:{cachedComplete:true,users:[]}},tasks:{},followBack:[{id:'2',username:'member',displayName:'Member',blueVerified:true}]});
 assert.equal(ui.element('follow-back-count').textContent,'关注了你 · 待回关 1 人');
 const row=ui.element('follow-back-list').children[0];
 assert.equal(row.children[0].href,'https://x.com/member');
 assert.equal(row.children[1].textContent,'回关');
 assert.equal(row.children[1].disabled,false);
 assert.equal(ui.element('follow-back-note').textContent,'');
 assert.equal(ui.element('follow-back-note').hidden,true);
 assert.equal(ui.element('write-controls').hidden,true);
});

test('background requests pulse the status dot and hide normal pagination resume', async () => {
  const ui = await interactivePopup({ accountId:'1', groups:[], autoSync:{ status:'running',currentKind:'following',activeUntil:Date.now()+60000 },
    relationships:{following:{users:[],pages:2,complete:false}},tasks:{following:{status:'paused'}} });
  assert.ok(ui.element('run-status').classes.has('busy'));
  assert.ok(ui.element('button-following').classes.has('hidden'));
  assert.ok(ui.element('sync-following').textContent.includes('运行中'));
});
test('automatic page waiting needs no resume button; failures expose manual retry', async () => {
  const ui = await interactivePopup({ accountId:'1',groups:[],autoSync:{status:'waiting'},
    relationships:{following:{users:[],complete:false},followers:{users:[],status:'error',complete:false}},
    tasks:{following:{status:'paused'},followers:{status:'error'}} });
  assert.ok(ui.element('run-status').classes.has('hidden'));
  assert.ok(ui.element('button-following').classes.has('hidden'));
  assert.ok(!ui.element('button-followers').classes.has('hidden'));
  assert.equal(ui.element('button-followers').textContent,'重试续传');
});
test('sync indicator distinguishes partial failure, total failure and completed state', async () => {
  const base={accountId:'1',groups:[],relationships:{},tasks:{}};
  const partial=await interactivePopup({...base,autoSync:{status:'partial',jobs:{followers:{error:{code:'HTTP_404'}},following:{lastSuccess:1}}}});
  assert.ok(partial.element('run-status').classes.has('tone-orange'));
  assert.ok(partial.element('run-status').classes.has('hidden'));
  const failed=await interactivePopup({...base,autoSync:{status:'partial',jobs:{followers:{error:{code:'HTTP_404'}}}}});
  assert.ok(failed.element('run-status').classes.has('tone-red'));
  assert.ok(failed.element('run-status').classes.has('hidden'));
  const done=await interactivePopup({...base,autoSync:{status:'ready',jobs:{followers:{lastSuccess:1}}}});
  assert.ok(done.element('run-status').classes.has('hidden'));
});

test('embedded sizing reports overflow content rather than the clipped viewport, then shrinks after collapse',async()=>{
 const sizing={content:680,visible:360,messages:[]};
 const ui=await interactivePopup({accountId:'1',groups:[],relationships:{},tasks:{}},'zh',sizing);
 assert.equal(sizing.messages.find(m=>m.type==='CIRCLEMATE_RESIZE').height,680);
 ui.element('app').scrollHeight=420;sizing.visible=420;sizing.report();
 assert.equal(sizing.messages.at(-1).height,420);
});

test('manual sync waits for custom confirmation, cancellation sends no request and confirmation sends one',async()=>{
 const ui=await interactivePopup({accountId:'1',groups:[],relationships:{},tasks:{}});
 const before=ui.calls.length;
 let pending=ui.element('manual-sync').handlers.click();
 assert.equal(ui.calls.length,before);
 ui.element('confirm-cancel').onclick();await pending;
 assert.equal(ui.calls.length,before);
 pending=ui.element('manual-sync').handlers.click();
 ui.element('confirm-accept').onclick();await pending;
 assert.equal(ui.calls.length,before+1);assert.equal(ui.calls.at(-1).action,'SYNC_LIST');
 pending=ui.element('manual-sync').handlers.click();
 ui.element('confirm-dialog').oncancel({preventDefault(){}});await pending;
 assert.equal(ui.calls.length,before+1);
});

test('completed relationships offer refresh and hide duplicate rebuild; today replies render',async()=>{
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date());
 const ui=await interactivePopup({accountId:'1',groups:[],relationships:{following:{users:[],complete:true,pages:1}},tasks:{following:{status:'complete'}},creator:{today,posts:1,replies:3,reposts:0}});
 assert.equal(ui.element('button-following').textContent,'刷新');
 assert.ok(ui.element('rebuild-following').classes.has('hidden'));
 assert.equal(ui.element('today-replies').textContent,'3');
});
