// Executed by chrome.scripting in the logged-in tab's MAIN world.
// Read-only, fixed-origin requests; no page navigation, listeners or DOM writes.
export async function readInPage(input) {
  if (location.origin !== input.origin || !['https://x.com','https://twitter.com'].includes(location.origin) ||
      !/^\/i\/api\/graphql\/[\w-]+\/(NotificationsTimeline|UserByScreenName|UserByRestId|Following|Followers|BlueVerifiedFollowers|VerifiedFollowers|UserOriginalsTimeline|UserRepliesTimeline|UserRepostsTimeline|UserTweets|UserTweetsAndReplies|accountOverviewDailyQuery)$/.test(input.path)) return { handled: false };
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
// Native JSON write shape verified 2026-10-07. Never replay an ambiguous POST.
export async function writePostInPage(input) {
  const ids={FavoriteTweet:'lI07N6Otwv1PhnEgXILM7A',UnfavoriteTweet:'ZYKSe-w7KEslx3JhSIk5LA'};
  if(location.origin!==input.origin || !['https://x.com','https://twitter.com'].includes(location.origin) ||
     !Object.hasOwn(ids,input.operation) || !/^\d{1,30}$/.test(input.tweetId||''))return {handled:false};
  const cookie=name=>{try{return decodeURIComponent(document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'');}catch{return '';}};
  const account=()=>cookie('twid').replace(/^u=/,'').replace(/"/g,'');
  const csrf=cookie('ct0');
  if(!csrf || account()!==input.accountId)return {handled:true,error:'登录账号已切换',code:'ACCOUNT_MISMATCH'};
  try{
    const response=await fetch(`/i/api/graphql/${ids[input.operation]}/${input.operation}`,{method:'POST',credentials:'include',redirect:'error',signal:AbortSignal.timeout(20000),
      headers:{'content-type':'application/json',accept:'application/json',authorization:input.authorization,'x-csrf-token':csrf,
        'x-twitter-active-user':'yes','x-twitter-auth-type':'OAuth2Session','x-twitter-client-language':document.documentElement.lang||'zh',
        ...(input.transactionId?{'x-client-transaction-id':input.transactionId}:{})},
      body:JSON.stringify({variables:{tweet_id:input.tweetId},queryId:ids[input.operation]})});
    if(account()!==input.accountId||cookie('ct0')!==csrf)return {handled:true,error:'登录账号已切换',code:'ACCOUNT_MISMATCH'};
    let data;try{data=await response.json();}catch{return {handled:true,error:'点赞结果未确认，请刷新核验',code:'WRITE_UNCONFIRMED'};}
    return {handled:true,status:response.status,data,reset:response.headers.get('x-rate-limit-reset')};
  }catch{return {handled:true,error:'点赞结果未确认，请刷新核验',code:'WRITE_UNCONFIRMED'};}
}

// Plain-text reply shape captured from the native editor on 2026-10-07.
export async function writeReplyInPage(input) {
  if(location.origin!==input.origin || !['https://x.com','https://twitter.com'].includes(location.origin) || input.body?.queryId!=='5pUpVEnRC2yGK7jaguF11w' || !/^\d{1,30}$/.test(input.body?.variables?.reply?.in_reply_to_tweet_id||'') || typeof input.body?.variables?.tweet_text!=='string' || !input.body.variables.tweet_text.trim())return {error:'回复参数无效',code:'WRITE_NOT_SENT'};
  const cookie=name=>{try{return decodeURIComponent(document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'');}catch{return '';}};
  const account=()=>cookie('twid').replace(/^u=/,'').replace(/"/g,'');
  const csrf=cookie('ct0');if(!csrf||account()!==input.accountId)return {error:'登录账号已切换',code:'WRITE_NOT_SENT'};
  try{
    const response=await fetch('/i/api/graphql/5pUpVEnRC2yGK7jaguF11w/CreateTweet',{method:'POST',credentials:'include',redirect:'error',signal:AbortSignal.timeout(20000),headers:{'content-type':'application/json',authorization:input.authorization,'x-csrf-token':csrf,'x-twitter-active-user':'yes','x-twitter-auth-type':'OAuth2Session','x-twitter-client-language':document.documentElement.lang||'zh','x-client-transaction-id':input.transactionId},body:JSON.stringify(input.body)});
    if(account()!==input.accountId||cookie('ct0')!==csrf)return {error:'登录账号已切换，请核验回复是否已发送',code:'WRITE_UNCONFIRMED'};
    return {status:response.status,data:await response.json()};
  }catch{return {error:'发送结果未确认，请到原帖核验，勿重复发送',code:'WRITE_UNCONFIRMED'};}
}
