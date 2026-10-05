import {normalizeUser,upsertUser,recordRelationshipEvent} from './domain.js';

// A restart never grants permission to replay a possibly completed write.
export async function recoverWrite(session,state,job,adapter,now=Date.now()){
  job.status='unconfirmed';job.error={code:'WRITE_UNCONFIRMED',message:'上次操作结果未确认，请核实资料'};
  job.updatedAt=now;
  if(state.profileRetryAt>now){job.retryAt=state.profileRetryAt;return;}
  try{
    const raw=await adapter.profile(session,job.username),user=normalizeUser(raw);
    const expected=job.action==='UNFOLLOW'?false:true;
    if(!user||job.userId&&user.id!==job.userId||!(user.following===expected||expected&&user.followRequested))return;
    const updated=upsertUser(state,raw,'write-recovery',now);
    if(user.following===true){updated.followedAt ||= now;recordRelationshipEvent(state,user.id,true,'write-recovery');}
    if(!expected){updated.unfollowedAt=now;updated.followedAt=null;recordRelationshipEvent(state,user.id,false,'write-recovery');}
    delete state.unavailableAccounts?.[user.username];updated.availability='available';updated.availabilityAt=now;
    if(typeof user.following==='boolean'&&state.lists.following?.complete){const ids=new Set(state.lists.following.ids);user.following?ids.add(user.id):ids.delete(user.id);state.lists.following.ids=[...ids];}
    job.status='complete';job.error=null;job.retryAt=null;
  }catch(error){
    if(error.retryAt){state.profileRetryAt=error.retryAt;job.retryAt=error.retryAt;}
    if(error.code==='ACCOUNT_UNAVAILABLE'){
      state.unavailableAccounts ||= {};
      state.unavailableAccounts[job.username]={availability:'unavailable',availabilityAt:now,userId:job.userId||null,reason:error.reason||'Unavailable'};
      job.status='failed';job.error={code:error.code,message:error.message};
    }
  }
}
