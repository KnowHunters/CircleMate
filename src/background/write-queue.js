// Durable intent state. Only explicit UI actions create jobs; recovery never replays a POST.
export const ACTIVE_WRITES = new Set(['queued', 'running', 'cooling']);
const UNRESOLVED_WRITES = new Set([...ACTIVE_WRITES,'unconfirmed']);
export function pruneQueue(queue,now=Date.now()){
  const unresolved=queue.jobs.filter(j=>UNRESOLVED_WRITES.has(j.status));
  const history=queue.jobs.filter(j=>!UNRESOLVED_WRITES.has(j.status)&&now-j.updatedAt<86400000);
  const keep=new Set([...unresolved,...history.slice(-Math.max(0,1000-unresolved.length))]);
  queue.jobs=queue.jobs.filter(j=>keep.has(j));
}
export function nextWrite(state,now=Date.now()){
  const queue=queueState(state);
  if(queue.paused)return {job:null,waitUntil:null};
  const job=queue.jobs.find(j=>['queued','cooling'].includes(j.status));
  if(!job)return {job:null,waitUntil:null};
  const until=Math.max(queue.nextAt||0,job.retryAt||0);
  return until>now?{job:null,waitUntil:until}:{job,waitUntil:null};
}
export function queueState(state) {
  return state.writeQueue ||= { jobs: [], paused: false, nextAt: 0 };
}
export function enqueueWrite(state, message, tabId, now = Date.now()) {
  const queue = queueState(state);
  const username = String(message.username || state.users[message.userId]?.username || '').toLowerCase();
  const matches=j=>Boolean(message.userId&&j.userId===message.userId)||Boolean(username&&j.username===username);
  const existing = queue.jobs.find(j => ACTIVE_WRITES.has(j.status) && matches(j));
  if (existing) {if((existing.action==='UNFOLLOW')!==(message.action==='UNFOLLOW'))throw new Error('此成员已有相反操作排队，请先取消队列');return existing;}
  if(queue.jobs.some(j=>j.status==='unconfirmed'&&matches(j)))throw new Error('上次操作结果未确认，请先核实资料');
  if (queue.jobs.filter(j => UNRESOLVED_WRITES.has(j.status)).length >= 500) throw new Error('未完成操作已达到 500 人上限，请先核实待确认结果或取消队列');
  const job = { id: `${now}-${crypto.randomUUID()}`, accountId: state.accountId, userId: message.userId || null,
    username, groupId: message.groupId || null, action: message.action, tabId, status: 'queued', createdAt: now, updatedAt: now };
  queue.jobs.push(job);
  pruneQueue(queue,now);
  return job;
}
export function controlQueue(state, command) {
  const queue = queueState(state);
  if (command === 'pause') queue.paused = true;
  else if (command === 'resume') queue.paused = false;
  else if (command === 'cancel') {
    for (const job of queue.jobs) if (['queued', 'cooling'].includes(job.status)) { job.status = 'cancelled'; job.updatedAt = Date.now(); }
    queue.paused = false;
  } else throw new Error('不支持的队列操作');
}
export function finishWrite(state, job, error, now = Date.now(), random = Math.random) {
  const queue = queueState(state);
  // Only a server rejection before confirmation may be retried. Unconfirmed writes need reconciliation.
  if (error?.code === 'HTTP_429' && error.retryAt > now) {
    job.status = 'cooling'; job.retryAt = error.retryAt; queue.nextAt = error.retryAt;
  } else {
    job.status = error ? error.code === 'WRITE_UNCONFIRMED' ? 'unconfirmed' : 'failed' : 'complete';
    job.error = error ? { code: error.code || 'SERVICE_ERROR', message: error.message } : null;
    job.retryAt = null; queue.nextAt = now + 3000 + Math.min(4000, Math.floor(Math.max(0,random()) * 4001));
  }
  job.updatedAt = now;
}
