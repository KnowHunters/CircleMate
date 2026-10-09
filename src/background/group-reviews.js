// Native GET and total_count response verified 2026-10-09; no applicant data retained.
export async function readGroupReviewInPage(input){
 if(location.origin!==input.origin||location.origin!=='https://x.com'||!/^g\d{1,30}$/.test(input.groupId||''))return {error:'审核请求参数无效',code:'REQUEST_REJECTED'};
 const roots=[document,...[...document.querySelectorAll('[data-testid="xchatEmbedRoute"],[data-testid="xchatEmbedOverlays"]')].map(e=>e.shadowRoot).filter(Boolean)];
 if(!roots.some(root=>root.querySelector(`[id="dm-conversation-option-${input.groupId}"]`)))return {error:'群已移出聊天列表',code:'GROUP_NOT_VISIBLE'};
 const cookie=name=>{try{return decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'');}catch{return '';}};
 const account=()=>cookie('twid').replace(/^u=/,'').replace(/"/g,'');
 const csrf=cookie('ct0');if(!csrf||account()!==input.accountId)return {error:'登录账号已切换',code:'ACCOUNT_MISMATCH'};
 try{
  const url=new URL('https://api.x.com/graphql/7maV7hhqFCfZn-aHJ3Ln0w/GetGroupJoinRequestsQuery');
  url.searchParams.set('variables',JSON.stringify({conversation_id:input.groupId,cursor:{}}));
  const response=await fetch(url,{method:'GET',credentials:'include',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{authorization:input.authorization,'x-csrf-token':csrf,'x-twitter-auth-type':'OAuth2Session','x-twitter-active-user':'yes','content-type':'application/json'}});
  if(account()!==input.accountId||cookie('ct0')!==csrf)return {error:'登录账号已切换',code:'ACCOUNT_MISMATCH'};
  const reset=Number(response.headers.get('x-rate-limit-reset'));
  if(!response.ok)return {error:`审核查询失败（${response.status}）`,code:'HTTP_'+response.status,retryAt:response.status===429?(reset>0?reset*1000:Date.now()+60000):null};
  const data=await response.json(),count=data.data?.chat_by_conversation_id?.conversation?.get_group_join_requests?.total_count;
  if(data.errors?.length||!Number.isSafeInteger(count)||count<0)return {error:'未取得审核权限或审核数据',code:'REVIEW_UNAVAILABLE'};
  return {count};
 }catch{return {error:'审核同步失败，稍后重试',code:'PAGE_REQUEST_FAILED'};}
}

export function reviewProjection(cache,ids){
 return Object.fromEntries(ids.filter(id=>/^g\d{1,30}$/.test(id)).map(id=>[id,cache?.[id]||null]));
}
export async function syncGroupReviews(s,state,adapter,checkpoint,ids,{now=Date.now(),maxJobs=4}={}){
 const cache=state.groupReviews ||= {};
 if(state.groupReviewRetryAt>now)return;
 const due=[...new Set(ids)].filter(id=>/^g\d{1,30}$/.test(id)&&!(cache[id]?.nextAt>now)).sort((a,b)=>(cache[a]?.updatedAt||0)-(cache[b]?.updatedAt||0)).slice(0,maxJobs);
 for(const id of due){
  try{
   const result=await adapter.groupReview(s,id);
   cache[id]={count:result.count,updatedAt:now,attemptedAt:now,status:'ready',error:null,nextAt:now+60000};
  }catch(error){
   if(error.code==='ACCOUNT_MISMATCH')throw error;
   if(error.code==='GROUP_NOT_VISIBLE')continue;
   cache[id]={...cache[id],attemptedAt:now,status:'error',error:error.message,nextAt:Math.max(now+(error.code==='REVIEW_UNAVAILABLE'||error.code==='HTTP_403'?600000:60000),error.retryAt||0)};
   if(error.code==='HTTP_429')state.groupReviewRetryAt=cache[id].nextAt;
  }
  // Bound account-local cache; failed/unknown counts are never converted to zero.
  const keep=Object.entries(cache).sort((a,b)=>(b[1].attemptedAt||b[1].updatedAt||0)-(a[1].attemptedAt||a[1].updatedAt||0)).slice(0,200);
  state.groupReviews=Object.fromEntries(keep);await checkpoint(s,state);
  if(state.groupReviewRetryAt>now)break;
 }
}
