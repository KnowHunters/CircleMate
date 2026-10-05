// Executed by chrome.scripting in the logged-in tab's MAIN world.
// Read-only, fixed-origin requests; no page navigation, listeners or DOM writes.
export async function readInPage(input) {
  if (location.origin !== input.origin || !['https://x.com','https://twitter.com'].includes(location.origin) ||
      !/^\/i\/api\/graphql\/[\w-]+\/(UserByScreenName|UserByRestId|Following|Followers|BlueVerifiedFollowers|VerifiedFollowers|UserOriginalsTimeline|UserRepliesTimeline|UserRepostsTimeline|UserTweets|UserTweetsAndReplies|accountOverviewDailyQuery)$/.test(input.path)) return { handled: false };
  const cookie = name => {
    try { return decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1) || ''); } catch { return ''; }
  };
  const account = () => cookie('twid').replace(/^u=/,'').replace(/"/g,'');
  const csrf = cookie('ct0');
  if (account() && account() !== input.accountId) return { handled:true,error:'登录账号已切换',code:'ACCOUNT_MISMATCH' };
  if (!csrf) return { handled:false };
  try {
    const url = new URL(input.path,location.origin); url.search = new URLSearchParams(input.params).toString();
    const response = await fetch(url, { method:'GET', credentials:'include', redirect:'error', cache:'no-store',signal:AbortSignal.timeout(20000),
      headers:{ 'content-type':'application/json',...(input.transactionId ? {'x-client-transaction-id':input.transactionId} : {}),accept:'application/json, text/plain, */*',authorization:input.authorization,'x-csrf-token':csrf,
        'x-twitter-auth-type':'OAuth2Session','x-twitter-active-user':'yes','x-twitter-client-language':document.documentElement.lang || 'zh' } });
    if ((account() && account() !== input.accountId) || cookie('ct0') !== csrf) return { handled:true,error:'登录账号已切换',code:'ACCOUNT_MISMATCH' };
    let data; try { data=await response.json(); } catch { if(response.ok) return {handled:true,error:'X 返回非 JSON 数据',code:'SCHEMA_CHANGED'}; }
    return { handled:true,status:response.status,data,contentType:response.headers.get('content-type'),rateLimitReset:response.headers.get('x-rate-limit-reset') };
  } catch(error) { return {handled:true,error:error.message,code:'PAGE_REQUEST_FAILED'}; }
}

export async function readBootInPage(input) {
  if (location.origin !== input.origin || !['https://x.com','https://twitter.com'].includes(location.origin)) throw new Error('X origin mismatch');
  const response = await fetch('/home',{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(20000)});
  const html=response.ok ? await response.text() : '';
  // X may serve the newer home shell without the legacy chunk map. The active
  // logged-in document still contains the public webpack map needed for signing.
  const map=[...document.scripts].map(s=>s.textContent).filter(s=>s.includes('ondemand.s')).join('');
  return {ok:response.ok,html:html + map};
}
