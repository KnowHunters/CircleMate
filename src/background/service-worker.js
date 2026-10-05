import { AccountRepository } from "./repository.js";
import { SessionProvider } from "./session.js";
import { EndpointRegistry } from "./endpoint-registry.js";
import { XWebAdapter } from "./x-adapter.js";
import { createServices } from "./services.js";
import { autoSync } from './auto-sync.js';
import { projectAccount, normalizeUser, upsertUser,recordRelationshipEvent } from './domain.js';
import { Scheduler } from './scheduler.js';
import { enqueueWrite, controlQueue } from './write-queue.js';
import { runWritePass } from './write-runner.js';
const repository = new AccountRepository(chrome.storage.local);
const sessions = new SessionProvider(chrome);
const registry = new EndpointRegistry(chrome.storage.local);
const scheduler = new Scheduler();
const ready = registry.load();
const checkpoint = async (s, state) => { await sessions.assertCurrent(s);state.capabilities={unfollow:registry.hasWriteEvidence('destroy')}; return repository.save(state); };
const adapter = new XWebAdapter({ fetch: globalThis.fetch.bind(globalThis), sessions, registry, chrome });
const services = createServices({ adapter, checkpoint });
const pendingTabs = new Set();
const nativeWrites=new Map();
chrome.webRequest.onBeforeRequest?.addListener(details=>{
  const id=details.requestBody?.formData?.user_id?.[0];
  if(details.method!=='POST'||details.tabId<0||!/^\d{1,30}$/.test(id||''))return;
  const intent={userId:id,tabId:details.tabId,accountId:null,operation:details.url.includes('/destroy.')?'destroy':'create'};nativeWrites.set(details.requestId,intent);
  intent.ready=sessions.get(details.tabId,false).then(async s=>{intent.accountId=s.accountId;const state=await repository.load(s.accountId);intent.owned=state.writeQueue?.jobs?.some(j=>j.status==='running'&&(j.userId===id||j.username===state.users[id]?.username));}).catch(()=>nativeWrites.delete(details.requestId));
  if(nativeWrites.size>100)nativeWrites.delete(nativeWrites.keys().next().value);
},{urls:['https://x.com/i/api/1.1/friendships/create.json','https://x.com/i/api/1.1/friendships/destroy.json','https://twitter.com/i/api/1.1/friendships/create.json','https://twitter.com/i/api/1.1/friendships/destroy.json']},['requestBody']);
function reconcileNativeWrite(details){
  const intent=nativeWrites.get(details.requestId);nativeWrites.delete(details.requestId);
  if(!intent||details.statusCode!==200)return;
  void scheduler.add(async()=>{
    await ready;await intent.ready;const s=await sessions.get(intent.tabId),state=await repository.load(s.accountId);
    if(intent.owned||!intent.accountId||intent.accountId!==s.accountId)return;
    const member=state.users[intent.userId];if(!member||state.profileRetryAt>Date.now())return;
    if(state.writeQueue?.jobs?.some(j=>j.status==='running'&&j.userId===member.id))return;
    try{const raw=await adapter.profile(s,member.username),user=normalizeUser(raw);
      if(!user||user.id!==member.id)return;
      if(intent.operation==='destroy'&&user.following===false || intent.operation==='create'&&(user.following===true||user.followRequested))await registry.confirmWrite(intent.operation);
      const updated=upsertUser(state,raw,'native-write-confirmed');
      if(intent.operation==='create'&&user.following===true&&member.following!==true){updated.followedAt=Date.now();updated.followedAtSource='native-confirmed';recordRelationshipEvent(state,user.id,true,'native');}
      if(intent.operation==='destroy'&&user.following===false){updated.unfollowedAt=Date.now();updated.followedAt=null;recordRelationshipEvent(state,user.id,false,'native');}
      for(const job of state.writeQueue?.jobs||[])if(job.status==='unconfirmed'&&(job.userId===user.id||job.username===user.username)&&typeof user.following==='boolean'){job.status=(job.action==='UNFOLLOW'?user.following===false:user.following===true||user.followRequested)?'complete':'failed';job.error=null;job.updatedAt=Date.now();}
      if(typeof user.following==='boolean'&&state.lists.following?.complete){const ids=new Set(state.lists.following.ids);user.following?ids.add(user.id):ids.delete(user.id);state.lists.following.ids=[...ids];}
      if(state.account){state.account.followingCount=null;state.account.fetchedAt=null;}
      await checkpoint(s,state);
    }catch(error){if(error.retryAt){state.profileRetryAt=error.retryAt;await checkpoint(s,state);}}
  },2).catch(()=>{});
}
function scheduleSync(tabId) {
  if (!Number.isInteger(tabId) || pendingTabs.has(tabId)) return;
  pendingTabs.add(tabId);
  const run = async () => {
    try {
      const session = await sessions.get(tabId);
      const state = await repository.load(session.accountId);
      const nativeChanged=await services.GET_STATE(session,state);
      await autoSync({ session, state, services, checkpoint, maxJobs: 1,forceCheckpoint:nativeChanged });
    } catch { /* Closed tabs, logout or account switch stop the pass. */ }
    finally { pendingTabs.delete(tabId); }
  };
  void scheduler.add(async()=>{await ready;await run();}, -1).catch(()=>{});
}
async function syncOpenTabs() {
  try { for (const tab of await chrome.tabs.query({ url: ['https://x.com/*','https://twitter.com/*'] })) { scheduleSync(tab.id); wakeWrites(tab.id); } } catch {}
}
const writeTimers=new Map();
function armWrites(tabId, when) {
  if(writeTimers.has(tabId))clearTimeout(writeTimers.get(tabId));
  writeTimers.set(tabId,setTimeout(()=>{writeTimers.delete(tabId);wakeWrites(tabId);},Math.max(0,when-Date.now())));
  void chrome.alarms?.create('circlemate-write-queue-'+tabId,{when:Math.max(Date.now()+1000,when)});
}
const pendingWrites=new Set();
function wakeWrites(tabId) {
  if(pendingWrites.has(tabId))return;
  pendingWrites.add(tabId);
  void scheduler.add(async()=>{
    await ready;
    await runWritePass(tabId,{sessions,repository,adapter,services,checkpoint,armWrites});
  },2).catch(()=>{}).finally(()=>pendingWrites.delete(tabId));
}
if (chrome.alarms) {
  void chrome.alarms.get('circlemate-cache-refresh').then(alarm => { if (!alarm) return chrome.alarms.create('circlemate-cache-refresh', { periodInMinutes: 1 }); }).catch(() => {});
  chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name==='circlemate-cache-refresh') void syncOpenTabs();else if(alarm.name.startsWith('circlemate-write-queue-'))wakeWrites(Number(alarm.name.slice('circlemate-write-queue-'.length))); });
  chrome.runtime.onStartup?.addListener(() => void syncOpenTabs());
}
chrome.webRequest.onBeforeSendHeaders.addListener(details => {
  sessions.observe(details);
  void ready.then(() => registry.observe(details)).catch(() => {});
}, { urls: ["https://x.com/i/api/*", "https://twitter.com/i/api/*"] }, ["requestHeaders"]);
chrome.tabs.onRemoved.addListener(tabId => {
  sessions.tokens.delete(tabId);
  if(writeTimers.has(tabId)){clearTimeout(writeTimers.get(tabId));writeTimers.delete(tabId);}
  void chrome.alarms?.clear('circlemate-write-queue-'+tabId);
  // Another logged-in X tab can continue the same account queue.
  void syncOpenTabs();
});
chrome.webRequest.onCompleted.addListener(details => {
  if(details.url.includes('/friendships/')){reconcileNativeWrite(details);return;}
  void ready.then(async () => { if (registry.completed(details)) await registry.save(); }).catch(() => {});
}, { urls: ["https://x.com/i/api/graphql/*", "https://twitter.com/i/api/graphql/*",'https://x.com/i/api/1.1/friendships/*.json','https://twitter.com/i/api/1.1/friendships/*.json'] });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // Extension-owned iframe UI keeps the identity and cookie store of its hosting tab.
  if(sender.id===chrome.runtime.id && sender.tab && typeof sender.url==='string') {
    try { const url=new URL(sender.url);
      if(url.protocol==='chrome-extension:' && url.host===chrome.runtime.id && url.pathname==='/popup/index.html') {
        message={...message,tabId:sender.tab.id};sender={...sender,tab:undefined};
      }
    } catch {}
  }
  if (sender.id === chrome.runtime.id && ((!sender.tab && message?.action === 'GET_STATE') || (sender.tab && message?.action === 'ROSTER_STATE'))) {
    // Read cache outside the network queue so pagination cannot block popup opening.
    void (async () => {
      try { if(sender.tab){const context=chatContext((await chrome.tabs.get(sender.tab.id)).url);if(!context?.isInfo || context.groupId!==message.groupId)throw new Error('成员列表已关闭或群聊已切换');}
        const session = await sessions.get(sender.tab?.id ?? message.tabId, false); const state = await repository.load(session.accountId);
        state.capabilities={unfollow:registry.hasWriteEvidence('destroy')};respond({ ok: true, state: projectAccount(state) }); scheduleSync(session.tabId);wakeWrites(session.tabId);
      } catch (error) { respond({ ok: false, error: error.message, code: 'SESSION_UNAVAILABLE' }); }
    })(); return true;
  }
  if (sender.id === chrome.runtime.id && sender.tab && sender.frameId === 0 && message?.action === 'SESSION_READY') {
    scheduleSync(sender.tab.id); wakeWrites(sender.tab.id);respond({ ok: true }); return false;
  }
  if (sender.id === chrome.runtime.id && sender.tab && message?.action === "FRAME_CONTEXT") {
    chrome.tabs.get(sender.tab.id).then(tab => respond(chatContext(tab.url)), () => respond(null)); return true;
  }
  const rosterActions={ROSTER_ENRICH:'ENRICH_GROUP',ROSTER_FOLLOW:'FOLLOW',ROSTER_UNFOLLOW:'UNFOLLOW',ROSTER_RECHECK:'RECHECK_MEMBER'};
  const rosterAction=Object.hasOwn(rosterActions,message?.action || '') ? rosterActions[message.action] : null;
  const rosterInline=Boolean(rosterAction && sender.id===chrome.runtime.id && sender.tab);
  if(rosterAction && sender.id === chrome.runtime.id && sender.tab) message={...message,action:rosterAction};
  if(['FOLLOW','RECHECK_MEMBER'].includes(message?.action))message={...message,fromFollowers:false};
  if ((!Object.hasOwn(services, message?.action || "") && !['QUEUE_CONTROL','EXPORT_BACKUP','RESTORE_BACKUP'].includes(message?.action)) || sender.id !== chrome.runtime.id) return false;
  if (sender.tab && !rosterInline && !["ROSTER", "ROSTER_REFERENCES",'QUEUE_CONTROL'].includes(message.action)) return false;
  if (!sender.tab && ["ROSTER", "ROSTER_REFERENCES"].includes(message.action)) return false;
  const run = async () => {
    let s;
    try {
      if (["ROSTER", "ROSTER_REFERENCES", "ENRICH_GROUP", "FOLLOW", "UNFOLLOW",'RECHECK_MEMBER'].includes(message.action)) {
        const context = chatContext((await chrome.tabs.get(sender.tab?.id ?? message.tabId)).url);
        if (!context?.groupId || context.groupId !== message.groupId) throw new Error("群聊已切换，请重新打开插件");
        if ((message.action === "ROSTER_REFERENCES" || message.action === 'ENRICH_GROUP') && !context.isInfo) throw new Error("成员采集仅限群信息页");
      }
      s = await sessions.get(sender.tab?.id ?? message.tabId, !["ROSTER", "ROSTER_REFERENCES", "GET_STATE"].includes(message.action));
      if(message.accountId&&message.accountId!==s.accountId)throw new Error('账号已切换，已取消此操作');
      let state = await repository.load(s.accountId);
      if(message.action==='EXPORT_BACKUP'){respond({ok:true,backup:state});return;}
      if(message.action==='RESTORE_BACKUP'){
        if(message.accountId!==s.accountId)throw new Error('账号已切换');
        state=await repository.restore(s.accountId,message.backup);respond({ok:true,state:projectAccount(state)});return;
      }
      if(['FOLLOW','FOLLOW_BACK','UNFOLLOW'].includes(message.action)) {
        if(message.accountId!==s.accountId)throw new Error('账号已切换，未加入操作队列');
        // Validate eligibility without issuing a write or guessing an identity.
        const member=state.users[message.userId]||Object.values(state.users).find(u=>u.username===message.username);
        if(member&&message.username&&member.username!==message.username.toLowerCase())throw new Error('成员账号已变更，请重新核实资料');
        if(message.action==='FOLLOW_BACK'){
          if(!projectAccount(state).followBack.some(u=>u.id===message.userId))throw new Error('此账号已不在待回关名单');
        }else{
          const group=state.groups[message.groupId];
          if(!group || !(group.usernames||[]).includes(String(message.username||'').toLowerCase()) && !(group.userIds||[]).includes(member?.id))throw new Error('成员不在当前群聊');
        }
        if(member?.id===s.accountId)throw new Error('不能操作当前账号');
        enqueueWrite(state,{...message,userId:member?.id||message.userId,username:member?.username||message.username},s.tabId);
      }else if(message.action==='QUEUE_CONTROL'){
        if(message.accountId!==s.accountId)throw new Error('账号已切换');controlQueue(state,message.command);
      }else await services[message.action](s, state, message);
      respond({ ok: true, state: await checkpoint(s, state) });
      if(['FOLLOW','FOLLOW_BACK','UNFOLLOW','QUEUE_CONTROL'].includes(message.action))wakeWrites(s.tabId);
      if (message.action === 'GET_STATE' || message.action === 'FOLLOW') scheduleSync(s.tabId);
    } catch (error) {
      let state;
      if (s) { try { await sessions.assertCurrent(s); state = await repository.save(await repository.load(s.accountId)); } catch {} }
      respond({ ok: false, error: error.name === "TimeoutError" ? "请求超时，请重试" : error.message,
        code: error.code || "SERVICE_ERROR", retryAt: error.retryAt || null, ...(state ? { state } : {}) });
    }
  };
  void scheduler.add(async()=>{await ready;await run();},['FOLLOW','FOLLOW_BACK','UNFOLLOW','QUEUE_CONTROL'].includes(message.action)?3:0).catch(()=>{});
  return true;
});
function chatContext(raw) {
  try { const url = new URL(raw); if (!["https://x.com", "https://twitter.com"].includes(url.origin)) return null;
    const match = url.pathname.match(/^\/i\/chat\/(g\d+)(?:\/(info))?\/?$/);
    return match ? { groupId: match[1], isInfo: Boolean(match[2]), path: url.pathname } : null;
  } catch { return null; }
}
