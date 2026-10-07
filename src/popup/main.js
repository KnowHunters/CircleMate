(() => {
  "use strict";
  const embedded = typeof window !== 'undefined' && window.parent !== window;
  if(embedded)document.documentElement.dataset.embedded='true';
  const parentOrigin = embedded && document.referrer ? new URL(document.referrer).origin : '*';
  function notifyParent(type,extra={}) { if(embedded)window.parent.postMessage({type,...extra},parentOrigin); }
  function observeSize() {
    if(!embedded)return;
    let pending=0,lastHeight=0;
    const report=()=>{cancelAnimationFrame(pending);pending=requestAnimationFrame(()=>{const height=Math.ceil(Math.max(document.querySelector('.app').scrollHeight,document.querySelector('.app').getBoundingClientRect().height));if(height!==lastHeight){lastHeight=height;notifyParent('CIRCLEMATE_RESIZE',{height});}});};
    new ResizeObserver(report).observe(document.querySelector('.app'));
    new MutationObserver(report).observe(document.querySelector('.app'),{childList:true,subtree:true,attributes:true});
    document.querySelector('.app').addEventListener('toggle',report,true);
    window.addEventListener('resize',report,{passive:true});
    report();
  }
  const STORAGE_KEY = globalThis.CircleMate.constants.storageKey;
  const PREF_KEY = "circlemate_ui_preferences";
  let state = { groups: [] }, selectedView = "members", activeGroupId = "";
  let activeTabId = null, accountUsername = "", busy = false, language = "zh", minimized = false;
  let notice = { key: "" },trendMetric='Displayed';
  const followBackPending=new Set(),followBackMessages=new Map(),followBackRows=new Map();let followBackRetryAt=0,followBackSignature='',followBackAccount='';
  const el = id => document.getElementById(id);
  globalThis.CircleMate.applyDialogStyle?.(document);
  const version=document.querySelector('.footer b');
  if(version&&chrome.runtime.getManifest)version.textContent=chrome.runtime.getManifest().version;
  const projectVersion=document.getElementById("project-version");
  if(projectVersion&&chrome.runtime.getManifest)projectVersion.textContent=`v${chrome.runtime.getManifest().version}`;
  const t = (key, values) => globalThis.CircleMate.i18n.text(language, key, values);
  const n = value => Number.isFinite(value) ? String(value) : t("unknown");
  const locale = () => language === "en" ? "en-US" : "zh-CN";
  const time = value => new Date(value).toLocaleString(locale(), {timeZone:"Asia/Shanghai"});
  const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const currentGroup = () => state.groups.find(g => g.id === activeGroupId) || null;
  const isMutual = u => u.following === true && u.followedBy === true;
  const currentCreator = () => state.creator?.today === today() ? state.creator : null;

  async function findActiveGroup() {
    try {
      const tab = embedded && chrome.tabs.getCurrent ? await chrome.tabs.getCurrent() : (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
      if (typeof tab?.id !== "number") return null;
      activeTabId = tab.id;
      return await new Promise(resolve => chrome.tabs.sendMessage(tab.id, { type: "CIRCLEMATE_GET_CURRENT_GROUP" }, response => {
        if (chrome.runtime.lastError) return resolve(null);
        accountUsername = response?.accountUsername || ""; resolve(response || null);
      }));
    } catch { return null; }
  }
  function uniquePeople() {
    const people = new Map();
    for (const group of state.groups) for (const u of group.users || []) people.set(u.id || u.username, u);
    return [...people.values()];
  }
  function applyLanguage() {
    document.documentElement.lang = language === "en" ? "en" : "zh-CN";
    for (const [selector, field, attribute] of [
      ["[data-i18n]", "i18n", null], ["[data-i18n-title]", "i18nTitle", "title"],
      ["[data-i18n-placeholder]", "i18nPlaceholder", "placeholder"], ["[data-i18n-aria]", "i18nAria", "aria-label"]
    ]) for (const node of document.querySelectorAll(selector)) {
      if (attribute) node.setAttribute(attribute, t(node.dataset[field])); else node.textContent = t(node.dataset[field]);
    }
    for (const button of document.querySelectorAll("[data-language]")) {
      const active = button.dataset.language === language; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active));
    }
    renderMinimized();
  }
  function renderMinimized() {
    el("popup-body").classList.toggle("hidden", minimized);
    el("minimize-button").textContent = minimized ? "+" : "−";
    el("minimize-button").setAttribute("aria-expanded", String(!minimized));
    el("minimize-button").setAttribute("title", t(minimized ? "expand" : "minimize"));
    el("minimize-button").setAttribute("aria-label", t(minimized ? "expand" : "minimize"));
  }
  function renderStatus() {
    const failed = Boolean(notice.error);
    const backgroundBusy = state.autoSync?.status === 'running' && state.autoSync.activeUntil > Date.now();
    const jobs = Object.values(state.autoSync?.jobs || {}), failures = jobs.filter(j => j.error).length;
    const syncing = busy || backgroundBusy;
    const tone = failures ? failures === jobs.length ? 'red' : 'orange' : failed ? 'red' : 'green';
    const status = busy || backgroundBusy ? "running" : failed || state.autoSync?.status === 'partial' ? "failed" : state.autoSync?.status === 'waiting' ? 'autoWaiting' : state.accountId ? "ready" : "idle";
    el("run-status-text").textContent = syncing ? t("syncingLabel") : "";
    el("run-status").classList.toggle("idle", status === "idle");
    el("run-status").classList.toggle("hidden", !syncing);
    el("run-status").classList.toggle("busy", syncing);
    for (const color of ['green','orange','red']) el('run-status').classList.toggle('tone-' + color, tone === color);
    el('run-status').setAttribute('title', t(tone === 'green' ? 'syncGreen' : tone === 'orange' ? 'syncOrange' : 'syncRed'));
    el('run-status').setAttribute('aria-label', t(tone === 'green' ? 'syncGreen' : tone === 'orange' ? 'syncOrange' : 'syncRed'));
    el("run-status").classList.toggle("error", failed && !busy && !backgroundBusy);
    el("service-status").classList.toggle("error", failed);
    el("service-status").textContent = failed ? (language === "zh" ? notice.error : t("syncError", { code: notice.code || "SERVICE_ERROR" })) : busy ? t("requesting") : "";
  }
  function renderAccount() {
    const a = state.account, c = currentCreator();
    el("account-name").textContent = a?.displayName || t("noAccount");
    el("account-handle").textContent = a?.username ? "@" + a.username : accountUsername ? "@" + accountUsername : "—";
    const updated = a?.fetchedAt || a?.nativeCountsAt || state.updatedAt;
    el('account-updated').textContent = updated ? t('accountUpdated', {time: new Intl.DateTimeFormat(locale(), {timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(updated))}) : '';
    el('account-updated').setAttribute('title', updated ? time(updated) : '');
    el("account-following").textContent = n(a?.followingCount);
    el("account-followers").textContent = n(a?.followersCount);
    for (const id of ['account-following','account-followers']) el(id).setAttribute('title', a?.nativeCountsAt ? t('nativeCounts') : t('syncAccount'));
    el('native-count-note').textContent = a?.nativeCountsAt ? t('nativeCounts') : '';
    const verified = state.relationships?.verifiedFollowers;
    el("account-verified").textContent = Number.isFinite(state.analytics?.verifiedFollowers) ? n(state.analytics.verifiedFollowers) :
      verified ? (verified.complete ? "" : "≥") + verified.users.length : t("unknown");
    for (const [id, key] of [["today-posts", "posts"], ["today-replies", "replies"], ["today-reposts", "reposts"]]) el(id).textContent = n(c?.[key]);
    const r = state.relationships || {};
    for (const kind of ["following", "followers", "verifiedFollowers"]) {
      const list = r[kind], task = state.tasks?.[kind];
      el("sync-" + kind).textContent = list ? t("listProgress", { count: list.users.length, pages: list.pages || 0, status: t(list.complete ? "complete" : list.status === "error" ? "failed" : "partial") }) +
        (list.error ? " · " + (['HTTP_400','HTTP_404'].includes(list.error.code) ? t('listRequestFailed', { code: list.error.code.slice(5) }) : language === "zh" ? list.error.message : list.error.code || t("failed")) : "") +
        (list.retryAt ? " · " + t("retryAt", { time: time(list.retryAt) }) : "") : t("syncPending");
      const button = document.querySelector('[data-kind="' + kind + '"]:not([data-restart])');
      const active = state.autoSync?.status === 'running' && state.autoSync.currentKind === kind && state.autoSync.activeUntil > Date.now();
      if (list && !list.complete && task?.status !== 'error') el('sync-' + kind).textContent += ' · ' + t(active ? 'running' : 'autoPaging');
      const retryAt = state.autoSync?.jobs?.[kind]?.retryAt;
      if (task?.status === 'error' && retryAt > Date.now()) el('sync-' + kind).textContent += ' · ' + t('autoRetryAt', { time: time(retryAt) });
      const rebuild = document.querySelector('[data-kind="' + kind + '"][data-restart]');
      if (rebuild) rebuild.classList.toggle('hidden', Boolean(list?.complete));
      if (button) {
        button.classList.toggle('hidden', active || (task?.status !== 'error' && !list?.complete));
        button.textContent = t(task?.status === 'error' ? 'manualResume' : 'relationshipRefresh');
        button.disabled = busy || active || task?.retryAt > Date.now();
      }
    }
    const analytics = state.analytics;
    const totals=analytics?.totals||{},previous=analytics?.previousTotals||{};
    const extraMetrics=[['posts','TweetCreate'],['replies','ReplyCreate'],['views','Displayed'],['likes','Fav'],['received','Reply'],['reposts','Retweet'],['bookmarks','Bookmark'],['quotes','QuoteTweet'],['net',null]];
    for(const [id,key] of extraMetrics){
      const value=id==='net'?globalThis.CircleMate.charts.net(totals):totals[key];
      const prior=id==='net'?globalThis.CircleMate.charts.net(previous):previous[key];
      const node=el('analytics-'+id);node.textContent=Number.isFinite(value)?id==='rate'?value.toFixed(2)+'%':globalThis.CircleMate.charts.format(value):t('unknown');
      node.setAttribute('title',Number.isFinite(value)?(id==='rate'?value.toFixed(4)+'%':new Intl.NumberFormat(locale()).format(value)):t('unknown'));
      if(id==='net'&&!Number.isFinite(value))node.setAttribute('title',language==='zh'?'新增或流失关注数据尚未完整，刷新分析后重试':'Follow or unfollow data is incomplete; refresh analytics');
      const result=globalThis.CircleMate.charts.comparison(value,prior),change=el('change-'+id);
      change.textContent=result.kind==='missing'?'—':result.kind==='new'?'↑ '+t('newMetric'):result.kind==='negative'?'↓ '+t('negativeMetric'):result.percent===0?'0%':(result.percent>0?'↑ ':result.percent<0?'↓ ':'')+Math.abs(result.percent).toFixed(1)+'%';
      change.dataset.direction=result.direction;change.setAttribute('title',analytics?.to>Date.now()?(language==='zh'?'本周期截至当前，与前一周期总量比较':'Current period to date versus previous period total'):t('periodCompare'));
      if(result.kind==='missing')change.setAttribute('title',t('noComparison'));
    }
    const rows=globalThis.CircleMate.charts.days(analytics);
    el('analytics-range').textContent=rows.length?rows[0].label+' – '+rows.at(-1).label+' · UTC':t('sevenDays');
    const metricLabels={Displayed:'impressions',Fav:'receivedLikes',Reply:'receivedReplies',Follow:'newFollowers',Retweet:'repostsMetric',Bookmark:'bookmarksMetric'};
    const labels={creation:t('creationTrend'),views:t(metricLabels[trendMetric]),posts:t('publishedPosts'),replies:t('publishedReplies')};
    for(const [id,kind] of [['views-chart','views'],['creation-chart','creation']])el(id).innerHTML=globalThis.CircleMate.charts.chart(analytics,kind,labels,trendMetric)||'<p class="chart-empty">'+t(analytics?'noSeries':'syncChart')+'</p>';
    const peak=rows.filter(r=>Number.isFinite(r.values[trendMetric])).sort((a,b)=>b.values[trendMetric]-a.values[trendMetric])[0];
    el('analytics-peak').textContent=peak?t('peakDay',{date:peak.label}):'';
    const analyticsUpdated=analytics?.fetchedAt;
    el('analytics-updated').textContent=analyticsUpdated?t('accountUpdated',{time:new Intl.DateTimeFormat(locale(),{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(analyticsUpdated))}):'';
    el('analytics-updated').setAttribute('title',analyticsUpdated?time(analyticsUpdated):'');
    const people = uniquePeople();
    for (const [id, value] of [["stat-groups", state.groups.length], ["stat-people", people.length], ["stat-following", people.filter(u => u.following === true).length], ["stat-mutual", people.filter(isMutual).length]]) el(id).textContent = String(value);
    el("updated-at").textContent = state.updatedAt ? t("updatedAt", { time: time(state.updatedAt) }) : t("noRecord");
  }
  function showView(view) {
    selectedView = view;
    for (const button of document.querySelectorAll(".tab")) {
      const active = button.dataset.view === view; button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active)); button.tabIndex = active ? 0 : -1;
    }
    for (const key of ["members", "stats", "guide"]) el(key + "-view").classList.toggle("hidden", key !== view);
  }
  function renderFollowBack(){
    const list=el('follow-back-list');if(!list)return;
    if(followBackAccount!==state.accountId){followBackAccount=state.accountId;followBackPending.clear();followBackMessages.clear();followBackRows.clear();list.replaceChildren();followBackSignature='';}
    const q=state.writeQueue||{},jobs=q.jobs||[],active=jobs.filter(j=>['queued','running','cooling'].includes(j.status));
    followBackRetryAt=active.find(j=>j.status==='cooling')?.retryAt||0;
    const users=state.followBack||[];
    el('follow-back-count').textContent=t('followBackHint',{count:users.length});
    const complete=state.relationships?.following?.cachedComplete&&state.relationships?.followers?.cachedComplete;
    const hints=[];
    if(!complete)hints.push(t('followBackPending'));
    el('write-controls').hidden=!active.length;
    el('write-pause').textContent=language==='zh'?(q.paused?'恢复执行':'暂停执行'):(q.paused?'Resume execution':'Pause execution');
    if(active.length)hints.push(language==='zh'?'操作队列 '+active.length+' 人':'Queue: '+active.length);
    const failure=jobs.filter(j=>j.action==='FOLLOW_BACK'&&j.error&&['failed','unconfirmed'].includes(j.status)).at(-1);
    if(failure&&Date.now()-failure.updatedAt<60000)hints.push(failure.error.message);
    if(followBackRetryAt>Date.now())hints.push((language==='zh'?'限流等待 ':'Rate limit: ')+Math.ceil((followBackRetryAt-Date.now())/1000)+(language==='zh'?' 秒':'s'));
    el('follow-back-note').textContent=hints.join(' · ');
    el('follow-back-note').hidden=!hints.length;
    const signature=JSON.stringify([state.accountId,language,users.map(u=>[u.id,u.username,u.displayName,u.description,u.blueVerified]),active.map(j=>[j.userId,j.username,j.status]),q.paused,[...followBackPending],[...followBackMessages],jobs.filter(j=>j.status==='unconfirmed'||j.status==='failed').map(j=>[j.userId,j.error])]);
    if(signature===followBackSignature)return;followBackSignature=signature;
    const scrollTop=list.scrollTop;
    const keyed=typeof list.insertBefore==='function',ids=new Set(users.map(u=>u.id));
    for(const [id,record]of followBackRows)if(!ids.has(id)){record.row.remove?.();followBackRows.delete(id);}
    if(!keyed||!followBackRows.size)list.replaceChildren();
    if(!users.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=t('followBackEmpty');list.append(empty);}
    let position=0;
    for(const user of users){
      let record=followBackRows.get(user.id);
      if(!record){const row=document.createElement('div'),identity=document.createElement('a'),name=document.createElement('strong'),description=document.createElement('small'),action=document.createElement('button'),message=document.createElement('small');row.className='follow-back-row';description.className='follow-back-bio';message.className='follow-back-message';identity.target='_blank';identity.rel='noopener noreferrer';identity.append(name,description,message);action.type='button';action.className='row-action';row.append(identity,action);record={row,identity,name,description,action,message,badge:null};followBackRows.set(user.id,record);}
      const {row,identity,name,description,action,message}=record;
      identity.href='https://x.com/'+user.username;
      if(record.displayName!==user.displayName){name.textContent=user.displayName;record.displayName=user.displayName;record.badge=null;}
      if(!user.blueVerified&&record.badge){record.badge.remove?.();record.badge=null;}
      if(user.blueVerified&&!record.badge){
        const badge=document.createElement('span');badge.className='follow-back-verified';badge.setAttribute('role','img');badge.setAttribute('aria-label',language==='zh'?'蓝V认证':'Verified');
        badge.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.4.16-2.95-.85-3.96s-2.56-1.3-3.96-.85C14.58 2.55 13.34 1.67 12 1.67s-2.58.88-3.25 2.18c-1.4-.45-2.95-.16-3.96.85s-1.3 2.56-.85 3.96C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.4-.16 2.95.85 3.96s2.56 1.3 3.96.85c.67 1.3 1.91 2.18 3.25 2.18s2.58-.88 3.25-2.18c1.4.45 2.95.16 3.96-.85s1.3-2.56.85-3.96c1.31-.67 2.19-1.91 2.19-3.34Z"/><path d="m7.5 12 3 3 6-6" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        name.append(badge);
        record.badge=badge;
      }
      const bio=user.description?.trim()||(language==='zh'?'暂无简介':'No bio');if(description.textContent!==bio)description.textContent=bio;description.title=bio;
      const job=active.find(j=>j.userId===user.id||j.username===user.username),unconfirmed=jobs.find(j=>(j.userId===user.id||j.username===user.username)&&j.status==='unconfirmed');
      const pending=followBackPending.has(user.id)||Boolean(job);
      action.disabled=pending;action.textContent=unconfirmed?(language==='zh'?'核实结果':'Verify result'):job?(language==='zh'?(job.status==='running'?'回关中…':q.paused?'已暂停':job.status==='cooling'?'冷却中…':'排队中…'):'Queued / following…'):followBackPending.has(user.id)?(language==='zh'?'提交中…':'Submitting…'):t('followBackAction');
      action.dataset.pending=String(pending);
      action.onclick=async()=>{
        if(followBackPending.has(user.id))return;
        const accountId=state.accountId,tabId=activeTabId;followBackPending.add(user.id);renderFollowBack();
        try{
          const result=await chrome.runtime.sendMessage({action:unconfirmed?'RECHECK_FOLLOWER':'FOLLOW_BACK',accountId,tabId,userId:user.id});
          if(state.accountId!==accountId)return;
          if(result?.state)state=result.state;
          if(!result?.ok){followBackRetryAt=result?.retryAt||0;throw Error(result?.error||t('serviceError'));}
          followBackMessages.set(user.id,language==='zh'?(unconfirmed?'已核实资料':'已加入操作队列'):(unconfirmed?'Profile verified':'Added to queue'));
        }catch(error){if(state.accountId===accountId)followBackMessages.set(user.id,error.message);}finally{if(state.accountId===accountId)followBackPending.delete(user.id);renderAll();}
      };
      message.hidden=!followBackMessages.has(user.id);if(!message.hidden)message.textContent=followBackMessages.get(user.id);
      if(keyed){if(list.children[position]!==row)list.insertBefore(row,list.children[position]||null);}else list.append(row);position++;
    }
    list.scrollTop=scrollTop;
  }
  function renderAll() { renderAccount(); renderFollowBack(); renderStatus(); showView(selectedView); }
  async function callService(action, extra = {}) {
    if (busy) return;
    busy = true; notice = { key: "requesting" };
    const controls = "[data-service]";
    document.querySelectorAll(controls).forEach(b => b.disabled = true); renderStatus();
    try {
      const result = await chrome.runtime.sendMessage({ action, tabId: activeTabId, username: accountUsername, ...extra });
      if (result?.state) state = result.state; else if (!result?.ok) state = { groups: [] };
      if (!result?.ok) throw Object.assign(new Error(result?.error || t("serviceError")), { code: result?.code });
      notice = { key: "updated" };

    } catch (error) { notice = { error: error.message, code: error.code }; }
    finally { busy = false; document.querySelectorAll(controls).forEach(b => b.disabled = false); renderAll(); }
  }
  let confirmationPending=false;
  async function requestService(action,extra={},trigger) {
    if(busy||confirmationPending)return;
    confirmationPending=true;
    const dialog=el('confirm-dialog'),cancel=el('confirm-cancel'),accept=el('confirm-accept');
    const label=extra.kind?t(extra.kind):t({ACCOUNT:'syncAccount',CREATOR:'creatorData',ANALYTICS:'syncAnalytics'}[action] || 'sync');
    el('confirm-title').textContent=action==='RESTORE_BACKUP'?(language==='zh'?'恢复本机备份？':'Restore local backup?'):t(extra.restart?'confirmRebuildTitle':'confirmSyncTitle',{name:label});
    el('confirm-message').textContent=action==='RESTORE_BACKUP'?(language==='zh'?'仅恢复当前账号。现有数据会先备份，备份中的排队操作不会自动执行。':'Restore this account only. Current data will be backed up; imported queued actions will not run.'):t(extra.restart?'confirmRebuildMessage':'confirmSyncMessage');
    let result;
    try { result=await new Promise(resolve=>{
      const finish=value=>{cancel.onclick=null;accept.onclick=null;dialog.oncancel=null;dialog.onclose=null;dialog.close();resolve(value);};
      cancel.onclick=()=>finish(false);accept.onclick=()=>finish(true);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.onclose=()=>finish(false);
      dialog.showModal();cancel.focus();
    }); } finally {confirmationPending=false;trigger?.focus();}
    if(result)await callService(action,extra);
  }
  function bindEvents() {
    for(const id of ['write-pause','write-cancel'])el(id)?.addEventListener('click',async()=>{
      try{const command=id==='write-cancel'?'cancel':state.writeQueue?.paused?'resume':'pause';const result=await chrome.runtime.sendMessage({action:'QUEUE_CONTROL',tabId:activeTabId,accountId:state.accountId,command});if(result?.state)state=result.state;if(!result?.ok)throw Error(result?.error||t('serviceError'));renderAll();}catch(error){notice={error:error.message};renderStatus();}
    });
    el('backup-export')?.addEventListener('click',async()=>{
      try{const result=await chrome.runtime.sendMessage({action:'EXPORT_BACKUP',tabId:activeTabId});if(!result?.ok)throw Error(result?.error||t('serviceError'));
        const url=URL.createObjectURL(new Blob([JSON.stringify(result.backup)],{type:'application/json'}));
        const a=document.createElement('a');a.href=url;a.download='circlemate-'+result.backup.accountId+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      }catch(error){notice={error:error.message};renderStatus();}
    });
    el('backup-import')?.addEventListener('click',()=>el('backup-file').click());
    el('backup-file')?.addEventListener('change',async event=>{
      const file=event.target.files?.[0];if(!file)return;
      try{if(file.size>8*1024*1024)throw Error(language==='zh'?'备份文件超过 8 MB':'Backup exceeds 8 MB');const backup=JSON.parse(await file.text());await requestService('RESTORE_BACKUP',{accountId:state.accountId,backup},el('backup-import'));}
      catch(error){notice={error:error.message};renderStatus();}finally{event.target.value='';}
    });
    el('trend-metric')?.addEventListener('change',event=>{trendMetric=event.target.value;renderAccount();});
    el("minimize-button").addEventListener("click", () => { if(embedded){notifyParent("CIRCLEMATE_MINIMIZE");return;}minimized = !minimized; renderMinimized(); });
    for (const button of document.querySelectorAll("[data-language]")) button.addEventListener("click", async () => {
      language = button.dataset.language === "en" ? "en" : "zh"; applyLanguage(); renderAll();
      try { await chrome.storage.local?.set({ [PREF_KEY]: { language } }); } catch {}
    });
    for (const button of document.querySelectorAll(".tab")) {
      button.addEventListener("click", () => showView(button.dataset.view));
      button.addEventListener("keydown", event => {
        const tabs = [...document.querySelectorAll(".tab")], index = tabs.indexOf(button);
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); showView(tabs[next].dataset.view); tabs[next].focus(); }
      });
    }
    for (const button of document.querySelectorAll("[data-service]")) button.addEventListener("click", event => {event?.preventDefault();event?.stopPropagation();return requestService(button.dataset.service, { kind: button.dataset.kind, restart: button.hasAttribute("data-restart") },button);});
  }
  async function init() {
    try { const prefs = await chrome.storage.local?.get(PREF_KEY); if (prefs?.[PREF_KEY]?.language === "en") language = "en"; } catch {}
    bindEvents(); applyLanguage(); observeSize();
    const current = await findActiveGroup(); activeGroupId = current?.isChat ? current.groupId : "";
    renderAll(); await callService("GET_STATE");
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    const next=(changes['circlemate_view_'+state.accountId]||changes[STORAGE_KEY])?.newValue;
    if (area !== "local" || !Array.isArray(next?.groups) || !state.accountId || next.accountId !== state.accountId || (next.revision!==undefined&&state.revision!==undefined?next.revision<state.revision:next.updatedAt<state.updatedAt)) return;
    state = next; renderAll();
  });
  if(typeof setInterval==='function')setInterval(()=>{if(followBackRetryAt){if(followBackRetryAt<=Date.now())followBackRetryAt=0;renderFollowBack();}},1000);
  void init();
})();
