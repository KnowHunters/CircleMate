import {queueState,nextWrite,finishWrite,ACTIVE_WRITES} from './write-queue.js';
import {recoverWrite} from './write-recovery.js';

// Called by the shared serial scheduler. Always reload account state for each pass.
export async function runWritePass(tabId,{sessions,repository,adapter,services,checkpoint,armWrites,now=Date.now}){
  const session=await sessions.get(tabId),state=await repository.load(session.accountId),queue=queueState(state);
  for(const job of queue.jobs.filter(j=>j.status==='running')){
    if(job.accountId!==session.accountId){job.status='cancelled';job.updatedAt=now();}
    else await recoverWrite(session,state,job,adapter,now());
    await checkpoint(session,state);
  }
  const {job,waitUntil}=nextWrite(state,now());
  if(waitUntil){armWrites(tabId,waitUntil);return;}
  if(!job)return;
  if(job.accountId!==session.accountId){job.status='cancelled';job.updatedAt=now();await checkpoint(session,state);armWrites(tabId,now()+1000);return;}
  job.status='running';job.updatedAt=now();await checkpoint(session,state);
  let failure;
  try{await services[job.action](session,state,job);}catch(error){failure=error;}
  finishWrite(state,job,failure,now());
  if(failure?.code==='ACCOUNT_UNAVAILABLE')for(const other of queue.jobs){
    if(other!==job&&ACTIVE_WRITES.has(other.status)&&(other.userId&&other.userId===job.userId||other.username===job.username)){
      other.status='failed';other.error=job.error;other.updatedAt=now();
    }
  }
  await checkpoint(session,state);
  if(queue.jobs.some(j=>['queued','cooling'].includes(j.status)))armWrites(tabId,queue.nextAt);
}
