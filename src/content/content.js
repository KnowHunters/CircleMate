(() => {
  'use strict';
  const topFrame = window === window.top;
  let lastCapture = ''; let timer;
  function viewer() {
    const href = document.querySelector('[data-testid="AppTabBar_Profile_Link"]')?.getAttribute('href');
    let username = '';
    try { if (href) { const url = new URL(href, location.origin); if (url.origin === location.origin) username = url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1]?.toLowerCase() || ''; } } catch {}
    const menu = document.querySelector('[data-testid="SideNav_AccountSwitcher_Button"]');
    if (!username) username = (menu?.textContent || '').match(/@([a-z0-9_]{1,15})\b/i)?.[1]?.toLowerCase() || '';
    const displayName = (menu?.textContent || '').split('@')[0].trim().slice(0,100) || menu?.querySelector('img[alt]')?.getAttribute('alt') || username;
    return { username, displayName };
  }
  function cookie(name) {
    const value = document.cookie.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1);
    try { return decodeURIComponent(value || ''); } catch { return ''; }
  }
  async function pageRequest(message) {
    if (!['https://x.com','https://twitter.com'].includes(location.origin)) return { handled: false };
    const allowed = message.method === 'POST' ? /^\/i\/api\/1\.1\/friendships\/(create|destroy)\.json$/.test(message.path) && /^\d{1,30}$/.test(String(message.params?.user_id || '')) :
      message.method === 'GET' && (/^\/i\/api\/graphql\/[\w-]+\/(UserByScreenName|UserByRestId|Following|Followers|BlueVerifiedFollowers|VerifiedFollowers|UserOriginalsTimeline|UserRepliesTimeline|UserRepostsTimeline|UserTweets|UserTweetsAndReplies|accountOverviewDailyQuery)$/.test(message.path) || /^\/i\/api\/1\.1\/(friends|followers)\/list\.json$/.test(message.path));
    if (!allowed) return { handled: true, error: '不支持的页面请求', code: 'REQUEST_REJECTED' };
    const csrf = cookie('ct0'), id = cookie('twid').replace(/^u=/,'').replace(/"/g,'');
    if (id && id !== message.accountId) return { handled: true, error: '登录会话已切换，请刷新后重试', code: 'ACCOUNT_MISMATCH' };
    if (!csrf) return { handled: false };
    try {
      const url = new URL(message.path, location.origin), body = new URLSearchParams(message.params);
      if (message.method === 'GET') url.search = body.toString();
      const response = await fetch(url, { method: message.method, credentials: 'include', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { ...(message.transactionId ? {'x-client-transaction-id':message.transactionId} : {}), ...(message.method === 'GET' ? {'content-type':'application/json'} : {}), accept: 'application/json, text/plain, */*', authorization: message.authorization, 'x-csrf-token': csrf,
          'x-twitter-active-user': 'yes', 'x-twitter-auth-type': 'OAuth2Session', 'x-twitter-client-language': document.documentElement.lang || 'zh-CN',
          ...(message.method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
        ...(message.method === 'POST' ? { body } : {}) });
      const currentId = cookie('twid').replace(/^u=/,'').replace(/"/g,'');
      if ((currentId && currentId !== message.accountId) || cookie('ct0') !== csrf) return { handled: true, error: '登录会话已切换，未提交本地结果', code: 'ACCOUNT_MISMATCH' };
      let data;
      try { data = await response.json(); } catch { if (response.ok) throw new Error('X 返回了无法识别的数据'); }
      return { handled: true, status: response.status, data, contentType: response.headers.get('content-type'), rateLimitReset: response.headers.get('x-rate-limit-reset') };
    } catch (error) { return { handled: true, error: error.name === 'TimeoutError' ? '请求超时，请刷新资料核验结果' : error.message, code: message.method === 'POST' ? 'WRITE_UNCONFIRMED' : 'PAGE_REQUEST_FAILED' }; }
  }
  function groupId() { return location.pathname.match(/^\/i\/chat\/(g\d+)/)?.[1] || ''; }
  // Members have a profile anchor and a dedicated menu button as direct siblings.
  // Never read ordinary message authors or recursively scrape conversation content.
  async function captureMembers() {
    const roots = globalThis.CircleMate?.rosterRoots?.() || [document];
    const buttons = roots.flatMap(root=>globalThis.CircleMate?.rosterListRows ? globalThis.CircleMate.rosterListRows(root).map(r=>r.menu).filter(Boolean) : [...root.querySelectorAll('button[aria-label]')]);
    const usernames = new Set();
    for (const button of buttons) {
      const label = button.getAttribute('aria-label') || '';
      if (!/^更多 .+的选项$/.test(label) && !/^More options for .+$/i.test(label)) continue;
      const anchor = [...(button.parentElement?.children || [])].find(e => e.tagName === 'A');
      if (!anchor) continue;
      try { const url = new URL(anchor.getAttribute('href'), 'https://x.com');
        if (!['https://x.com','https://twitter.com'].includes(url.origin)) continue;
        const match = url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i); if (match) usernames.add(match[1].toLowerCase());
      } catch {}
    }
    if (!usernames.size) return;
    const context = await chrome.runtime.sendMessage({action:'FRAME_CONTEXT'});
    if (!context?.isInfo) { lastCapture = ''; return; }
    const refs = [...usernames].sort().slice(0,5000);
    const signature = context.groupId + ':' + refs.join(','); if (signature === lastCapture) return;
    const result = await chrome.runtime.sendMessage({action:'ROSTER_REFERENCES',groupId:context.groupId,usernames:refs});
    if (result?.ok) lastCapture = signature;
  }
  (globalThis.CircleMate ||= {}).viewerUsername = () => viewer().username;
  let lastViewer = '', lastReadyAt = 0;
  async function reportReady() {
    if (!topFrame) return;
    const name = viewer().username;
    if (!name || (lastViewer === name && Date.now() - lastReadyAt < 60000)) return;
    lastViewer = name; lastReadyAt = Date.now();
    try { await chrome.runtime.sendMessage({ action: 'SESSION_READY' }); } catch { lastReadyAt = 0; }
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void captureMembers().catch(() => {}); void reportReady(); }, 400); };
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['href','aria-label']});
  schedule();
  chrome.runtime.onMessage.addListener((message,sender,respond) => {
    if (topFrame && sender.id === chrome.runtime.id && message?.type === 'CIRCLEMATE_NATIVE_SNAPSHOT') { respond(globalThis.CircleMate.readNativePage(document, location, viewer())); return false; }
    if (topFrame && sender.id === chrome.runtime.id && message?.type === 'CIRCLEMATE_GET_VIEWER') { respond(viewer()); return false; }
    if (topFrame && sender.id === chrome.runtime.id && message?.type === 'CIRCLEMATE_PAGE_REQUEST') { void pageRequest(message).then(respond); return true; }
    if (topFrame && message?.type === 'CIRCLEMATE_GET_CURRENT_GROUP') {
      schedule();
      respond({isChat:/^\/i\/chat\//.test(location.pathname),groupId:groupId(),title:'当前群聊',path:location.pathname,
        accountUsername:viewer().username});
    }
    return false;
  });
})();
