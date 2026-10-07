import {validateCreatorLibrary} from './creator-library.js';
export const CURRENT_SCHEMA = 4;
export function migrateAccount(input, accountId) {
  if(!input || input.accountId!==accountId)throw new Error('缓存账号不匹配，未覆盖本地数据');
  if(![3,4].includes(input.schemaVersion))throw new Error('不支持此缓存版本，原数据已保留');
  const state=structuredClone(input);
  state.users ||= {};state.groups ||= {};state.lists ||= {};state.tasks ||= {};
  if(state.schemaVersion===3){
    delete state.dailyPlan;
    state.writeQueue={jobs:[],paused:false,nextAt:0};
    state.migrations=[...(state.migrations||[]),{from:3,to:4,at:Date.now()}];
  }
  state.schemaVersion=CURRENT_SCHEMA;
  return state;
}
export function validateBackup(input, accountId) {
  if(!input||JSON.stringify(input).length>8*1024*1024)throw new Error('备份文件无效或超过 8 MB');
  const state=migrateAccount(input,accountId);
  validateCreatorLibrary(state.creatorLibrary);
  if(state.replyIntents && (typeof state.replyIntents!=='object'||Array.isArray(state.replyIntents)||Object.keys(state.replyIntents).length>100))throw new Error('备份回复操作格式无效');
  for(const [id,intent]of Object.entries(state.replyIntents||{}))if(!/^\d{1,30}$/.test(id)||!/^[a-z0-9_-]{10,80}$/i.test(intent?.token||'')||!['running','complete'].includes(intent.status)||!Number.isFinite(intent.at)||(intent.status==='complete'&&!/^\d{1,30}$/.test(intent.replyId||'')))throw new Error('备份回复操作格式无效');
  if(state.postLikeIntents && (Array.isArray(state.postLikeIntents)||Object.keys(state.postLikeIntents).length>100))throw new Error('备份帖子操作格式无效');
  for(const [id,intent]of Object.entries(state.postLikeIntents||{}))if(!/^\d{1,30}$/.test(id)||typeof intent?.liked!=='boolean'||!/^[a-z0-9_]{1,15}$/i.test(intent.username||'')||!Number.isFinite(intent.at))throw new Error('备份帖子操作格式无效');
  delete state.capabilities; // Runtime evidence is never supplied by an imported backup.
  if(!state.users||Array.isArray(state.users)||!state.groups||Array.isArray(state.groups))throw new Error('备份结构不完整');
  for(const [id,user]of Object.entries(state.users))if(!/^\d{1,30}$/.test(id)||user?.id!==id||!/^[a-z0-9_]{1,15}$/i.test(user.username||''))throw new Error('备份成员格式无效');
  for(const [id,group]of Object.entries(state.groups))if(!/^g\d{1,30}$/.test(id)||!Array.isArray(group?.userIds)||group.userIds.some(id=>typeof id!=='string'||!/^\d{1,30}$/.test(id)))throw new Error('备份群数据格式无效');
  for(const list of Object.values(state.lists))if(!Array.isArray(list.ids)||list.ids.some(id=>!/^\d{1,30}$/.test(id)))throw new Error('备份关系名单格式无效');
  if(state.writeQueue && (!Array.isArray(state.writeQueue.jobs)||state.writeQueue.jobs.length>1000))throw new Error('备份队列格式无效');
  for(const job of state.writeQueue?.jobs||[])if(!job||job.accountId!==accountId||!['FOLLOW','FOLLOW_BACK','UNFOLLOW'].includes(job.action)||!['queued','running','cooling','complete','failed','cancelled','unconfirmed'].includes(job.status)||job.userId!=null&&!/^\d{1,30}$/.test(job.userId)||!/^[a-z0-9_]{1,15}$/i.test(job.username||''))throw new Error('备份队列账号或成员无效');
  for(const task of Object.values(state.tasks))if(task?.status==='running')task.status='paused';
  if(state.autoSync){state.autoSync.status='waiting';state.autoSync.activeUntil=null;state.autoSync.currentKind=null;}
  // Importing data is not authorization to run historic queued writes.
  for(const job of state.writeQueue?.jobs||[])if(['queued','running','cooling'].includes(job.status)){job.status='cancelled';job.updatedAt=Date.now();}
  state.writeQueue ||= {jobs:[],paused:false,nextAt:0};state.writeQueue.paused=true;
  return state;
}
