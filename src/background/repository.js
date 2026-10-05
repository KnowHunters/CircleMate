import { emptyAccount, upsertUser, projectAccount, SCHEMA_VERSION } from "./domain.js";
import { migrateAccount, validateBackup } from './migrations.js';
export const VIEW_KEY = "circlemate_local_v1";
const PREFIX = "circlemate_account_v3_";

export class AccountRepository {
  constructor(storage) { this.storage = storage; this.baselines=new WeakMap(); }
  async load(accountId) {
    const key = PREFIX + accountId;
    const stored = await this.storage.get([key, VIEW_KEY]);
    if(stored[key] && ![3,SCHEMA_VERSION].includes(stored[key].schemaVersion))throw new Error('缓存版本不受支持，原数据已保留');
    if (stored[key]) {
      const metadata=stored[key];
      let input=metadata;
      if(metadata.userBuckets){const chunks=await this.storage.get(metadata.userBuckets);input={...metadata,users:Object.assign({},...metadata.userBuckets.map(k=>{if(!chunks[k])throw new Error('成员缓存分片缺失，请从备份恢复');return chunks[k];}))};}
      const state=migrateAccount(input,accountId),list=state.lists?.following;
      // Older releases invalidated a complete snapshot after our own confirmed follow writes.
      if(metadata.schemaVersion===3 && list?.complete && list.stale){
        // Only FOLLOW invalidated this flag in prior versions. Later list pages may
        // overwrite fieldSources, so the historical write source must also be considered.
        const writes=Object.values(state.users).filter(u=>u.sources?.['follow-write'] || u.fieldSources?.following?.source==='follow-write');
        const ids=new Set(list.ids);
        for(const user of writes){if(user.following===true)ids.add(user.id);else if(user.fieldSources?.following?.source==='follow-write')ids.delete(user.id);}
        list.ids=[...ids];list.stale=false;
      }
      if(metadata.schemaVersion===3){const backupKey='circlemate_migration_backup_'+accountId;const backup=await this.storage.get(backupKey);if(!backup[backupKey])await this.storage.set({[backupKey]:metadata});}
      delete state.userBuckets;this.baselines.set(state,metadata.userBuckets?this.userChunks(state):{});return state; }
    const next = emptyAccount(accountId);
    const old = stored[VIEW_KEY];
    // Only migrate records with an explicit matching account owner.
    if (old?.accountId === accountId && old.schemaVersion === 2) {
      next.account = old.account || null; next.creator = old.creator || null;
      for (const g of old.groups || []) {
        const ids = (g.users || []).map(u => upsertUser(next, u, "migration" )?.id).filter(Boolean);
        next.groups[g.id] = { id: g.id, label: g.label, userIds: ids, lastSeen: g.lastSeen, complete: false };
      }
    }
    return next;
  }
  async save(state) {
    state.updatedAt = Date.now();
    state.revision=(state.revision||0)+1;
    const projection = projectAccount(state);
    const chunks=this.userChunks(state),baseline=this.baselines.get(state)||{},changed={};
    for(const [key,value]of Object.entries(chunks))if(baseline[key]!==value)changed[key]=JSON.parse(value);
    const metadata={...state,userBuckets:Object.keys(chunks)};delete metadata.users;
    try { await this.storage.set({ ...changed, [PREFIX + state.accountId]: metadata,
      ['circlemate_view_'+state.accountId]:projection,[VIEW_KEY]:{schemaVersion:SCHEMA_VERSION,accountId:state.accountId,updatedAt:state.updatedAt} }); }
    catch(error){throw Object.assign(new Error('本地缓存保存失败，原有记录未主动清理；请导出备份并检查存储空间'),{code:'STORAGE_WRITE_FAILED',cause:error});}
    this.baselines.set(state,chunks);
    return projection;
  }
  userChunks(state){
    const buckets=Array.from({length:16},()=>({}));
    for(const [id,user]of Object.entries(state.users))buckets[Number(id.slice(-4))%16][id]=user;
    return Object.fromEntries(buckets.map((value,i)=>[PREFIX+state.accountId+'_users_'+i,JSON.stringify(value)]));
  }
  async restore(accountId,input){
    const next=validateBackup(input,accountId),old=await this.load(accountId);
    next.revision=old.revision||0;
    await this.storage.set({['circlemate_restore_backup_'+accountId]:old});
    await this.save(next);return next;
  }
}
