export const replyDay = at => new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'}).format(new Date(at));
export function rememberReply(state,replyId,postId,at,prune=true){
 if(!/^\d{1,30}$/.test(replyId||'')||!/^\d{1,30}$/.test(postId||'')||!Number.isFinite(at))return;
 state.confirmedReplies ||= {};
 state.confirmedReplies[replyId]={postId,at};
 if(prune)pruneReplies(state,at);
}
export function pruneReplies(state,now=Date.now()){state.confirmedReplies=Object.fromEntries(Object.entries(state.confirmedReplies||{}).filter(([,r])=>r.at>=now-7*86400000).sort((a,b)=>b[1].at-a[1].at).slice(0,5000));}
export function replyActivity(state,now=Date.now()){
 const today=replyDay(now),records=Object.values(state.confirmedReplies||{}).filter(r=>replyDay(r.at)===today);
 return {today,postIds:[...new Set(records.map(r=>r.postId))],count:records.length};
}
export function replyRecords(state,day){
 return Object.fromEntries(Object.entries(state.confirmedReplies||{}).filter(([,r])=>replyDay(r.at)===day).map(([id,r])=>[id,{id_str:id,created_at:new Date(r.at).toISOString(),in_reply_to_status_id_str:r.postId,retweeted_status:false}]));
}
export function recordConfirmedReply(state,replyId,postId,at,now=at){
 rememberReply(state,replyId,postId,at);
 const today=replyDay(now),task=state.tasks?.creator;
 if(replyDay(at)!==today)return;
 if(task?.today===today)task.records={...task.records,...replyRecords(state,today)};
 const activity=replyActivity(state,at);
 if(state.creator?.today===today&&task?.today===today&&task.coverage?.replies){
  state.creator.replies=Object.values(task.records).filter(t=>!t.retweeted_status&&t.in_reply_to_status_id_str&&replyDay(Date.parse(t.created_at))===today).length;
 }else if(!state.creator||state.creator.today!==today){
  state.creator={today,posts:null,replies:activity.count,reposts:null,complete:false,fetchedAt:0,scope:'北京时间今日已确认回复；其他回复等待同步'};
 }else if(state.creator.replies==null)state.creator.replies=activity.count;
}
