const id = value => /^\d{1,30}$/.test(value || '') ? String(value) : null;
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
export function parseNotifications(payload, accountId) {
  if (payload.errors?.length) throw new Error('通知接口返回错误，保留已有记录');
  const instructions=payload.data?.viewer_v2?.user_results?.result?.notification_timeline?.timeline?.instructions;
  if(!Array.isArray(instructions))throw new Error('通知结构已变化，未更新记录');
  const events=[];let cursor=null;const keys=[];
  for(const entry of instructions.flatMap(i=>i.entries||[])){
    const content=entry.content;
    if(content?.cursorType==='Bottom')cursor=typeof content.value==='string'?content.value:null;
    const item=content?.itemContent,kind=content?.clientEventInfo?.element;
    if(!item)continue;
    if(typeof entry.entryId==='string')keys.push(entry.entryId+':'+(item.template?.from_users||[]).map(u=>u.user_results?.result?.rest_id||'').join(','));
    if(['user_liked_multiple_tweets','users_liked_your_tweet'].includes(kind)){
      const users=(item.template?.from_users||[]).map(u=>id(u.user_results?.result?.rest_id)).filter(Boolean);
      const targets=(item.template?.target_objects||[]).map(t=>t.tweet_results?.result).filter(t=>id(t?.rest_id)&&t.core?.user_results?.result?.rest_id===accountId);
      if(users.length>1 && targets.length>1)continue;
      for(const actor of users)for(const target of targets)if(actor!==accountId)events.push({key:`like:${actor}:${target.rest_id}`,type:'like',userId:actor,postId:target.rest_id,at:time(item.timestamp_ms),timeSource:'notification'});
    }else if(kind==='user_replied_to_your_tweet'){
      const tweet=item.tweet_results?.result,actor=id(tweet?.core?.user_results?.result?.rest_id),postId=id(tweet?.legacy?.in_reply_to_status_id_str),replyId=id(tweet?.rest_id);
      if(actor&&actor!==accountId&&postId&&replyId&&tweet.legacy.in_reply_to_user_id_str===accountId)events.push({key:`reply:${replyId}`,type:'reply',userId:actor,postId,replyId,at:time(tweet.legacy.created_at),timeSource:'post'});
    }
  }
  return {events,keys,cursor};
}
export function interactionProjection(cache){
  const members={};let oldestAt=null;
  for(const e of Object.values(cache?.events||{})){
    if(!id(e.userId)||!['like','reply'].includes(e.type))continue;
    const m=members[e.userId] ||= {likes:0,replies:0};
    if(e.type==='like')m.likes++;else m.replies++;
    if(Number.isFinite(e.at))oldestAt=Math.min(oldestAt||e.at,e.at);
  }
  return {members,status:cache?.status||'idle',updatedAt:cache?.updatedAt||null,retryAt:cache?.retryAt||null,error:cache?.error||null,partial:true,oldestAt};
}
export async function syncNotifications(s,state,adapter,checkpoint,{now=Date.now(),force=false}={}){
  const cache=state.memberInteractions ||= {events:{},seen:[],cursor:null,pages:0};
  if(cache.retryAt>now || !force&&cache.nextAt>now || force&&cache.lastAttemptAt+10000>now)return;
  cache.lastAttemptAt=now;
  cache.status='syncing';cache.error=null;await checkpoint(s,state);
  try{
    const page=parseNotifications(await adapter.notifications(s,cache.cursor),s.accountId);
    const seen=new Set(cache.seen),overlap=page.keys.length>0&&page.keys.every(k=>seen.has(k));
    for(const e of page.events){cache.events[e.key] ||= {...e,observedAt:now};if(e.at)cache.oldestAt=Math.min(cache.oldestAt||e.at,e.at);}
    cache.seen=[...new Set([...page.keys,...cache.seen])].slice(0,2000);
    cache.events=Object.fromEntries(Object.entries(cache.events).sort((a,b)=>b[1].observedAt-a[1].observedAt).slice(0,5000));
    cache.pages++;cache.updatedAt=now;cache.retryAt=null;
    if(!page.cursor||page.cursor===cache.cursor||overlap||cache.pages>=50){cache.cursor=null;cache.pages=0;cache.status='idle';cache.nextAt=now+300000;}
    else{cache.cursor=page.cursor;cache.status='pending';cache.nextAt=now+3000;}
  }catch(error){cache.status='error';cache.error=error.message;cache.retryAt=Math.max(now+60000,error.retryAt||0);}
  await checkpoint(s,state);
}
