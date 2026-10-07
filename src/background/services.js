import { LIST_KINDS, validId, normalizeUser, upsertUser, completeSnapshot, groupUsers, followBackUsers,recordRelationshipEvent } from "./domain.js";
export function createServices({ adapter, checkpoint }) {
  async function syncList(s, state, kind, restart = false) {
    if (!LIST_KINDS.includes(kind)) throw new Error("不支持的名单类型");
    let task = state.tasks[kind];
    if (!task || restart || task.status === "complete") task = state.tasks[kind] = { kind, ids: [], cursor: null, pages: 0, status: "pending", startedAt: Date.now(), adapter: null };
    if (task.retryAt > Date.now()) throw Object.assign(new Error("请求仍在冷却，请稍后续传"), { retryAt: task.retryAt });
    task.status = "running"; task.error = null; task.retryAt = null;
    await checkpoint(s, state);
    try {
      const page = await adapter.userPage(s, kind, task.cursor, task.adapter);
      if (!page.complete && (!page.cursor || page.cursor === task.cursor)) throw new Error("分页游标未前进，已停止同步");
      const ids = page.users.map(raw => upsertUser(state, raw, kind)?.id).filter(Boolean);
      if (ids.length !== page.users.length) throw new Error("部分用户字段无法识别，未提交本页名单");
      task.ids = [...new Set([...task.ids, ...ids])];
      task.cursor = page.cursor; task.pages++; task.adapter = page.source; task.updatedAt = Date.now();
      if (page.complete) completeSnapshot(state, kind, task); else task.status = "paused";
      await checkpoint(s, state);
    } catch (error) {
      task.status = "error"; task.error = { code: error.code || "SYNC_FAILED", message: error.message };
      task.retryAt = error.retryAt || null; task.updatedAt = Date.now(); await checkpoint(s, state); throw error;
    }
  }
  return {
    async RECHECK_FOLLOWER(s,state,message){return this.RECHECK_MEMBER(s,state,{...message,fromFollowers:true,username:state.users[message.userId]?.username});},
    async RECHECK_MEMBER(s,state,message){
      if(message.accountId!==s.accountId)throw new Error('账号已切换');
      if(state.profileRetryAt>Date.now())throw Object.assign(new Error('资料请求仍在冷却，请稍后核实'),{code:'PROFILE_COOLDOWN',retryAt:state.profileRetryAt});
      const group=message.fromFollowers?{userIds:[...new Set(['followers','verifiedFollowers'].flatMap(k=>[...(state.lists[k]?.ids||[]),...(state.tasks[k]?.ids||[])]))]}:state.groups[message.groupId],username=String(message.username||'').toLowerCase();
      const member=Object.values(state.users).find(u=>u.username===username);
      if(!group || !(group.usernames||[]).includes(username)&&!(group.userIds||[]).includes(member?.id))throw new Error('成员不在当前群聊');
      const raw=await adapter.profile(s,username),normalized=normalizeUser(raw);
      if(member&&normalized?.id!==member.id)throw new Error('此用户名对应的账号已变更，请查看原生资料');
      const user=upsertUser(state,raw,'group-profile');
      if(!user||user.username!==username)throw new Error('成员资料不匹配');
      delete state.unavailableAccounts?.[username];user.availability='available';user.availabilityAt=Date.now();
      for(const job of state.writeQueue?.jobs||[])if(job.status==='unconfirmed'&&(job.userId===user.id||job.username===username)){
        if(typeof user.following!=='boolean'&&!user.followRequested)continue;
        job.status=(job.action==='UNFOLLOW'?user.following===false:user.following===true||user.followRequested)?'complete':'failed';
        job.error=null;job.updatedAt=Date.now();
      }
    },
    async MARK_UNAVAILABLE(s, state, message) {
      const group=state.groups[message.groupId]; const username=String(message.username||'').toLowerCase();
      const member=Object.values(state.users).find(u=>u.username===username);
      if(!group || !(group.usernames||[]).includes(username) && !(group.userIds||[]).includes(member?.id)) throw new Error('成员不在当前群聊');
      state.unavailableAccounts ||= {};
      state.unavailableAccounts[username]={availability:'unavailable',availabilityAt:Date.now()};
      if(member){member.availability='unavailable';member.availabilityAt=Date.now();}
      await checkpoint(s,state);
    },
    async GET_STATE(s, state) {
      const page = await adapter.nativeSnapshot?.(s);
      if (!page || !/^[a-z0-9_]{1,15}$/i.test(page.owner || '')) {const changed=Boolean(state.nativePage);state.nativePage=null;return changed;}
      if (state.account?.username && state.account.username.toLowerCase() !== page.owner.toLowerCase()) return;
      // The content reader only returns the logged-in user's own profile/list page.
      const counts = Object.fromEntries(['followingCount','followersCount'].filter(k => Number.isSafeInteger(page.counts?.[k]) && page.counts[k] >= 0).map(k => [k,page.counts[k]]));
      const signature=JSON.stringify({owner:page.owner,kind:page.kind,counts,users:page.users||[]});
      if(state.nativePage?.signature===signature)return false;
      state.account = { ...state.account, id: s.accountId, username: page.owner.toLowerCase(), displayName: state.account?.displayName || page.displayName,
        ...counts, nativeCountsAt: Object.keys(counts).length ? Date.now() : state.account?.nativeCountsAt };
      state.nativePage = { owner: page.owner, kind: page.kind, users: (page.users || []).slice(0,500), complete: false, observedAt: Date.now(),signature };
      for (const row of state.nativePage.users) {
        const known = Object.values(state.users).find(u => u.username === row.username);
        if (!known) continue;
        const write=known.fieldSources?.following;
        if(write?.source==='follow-write' && Date.now()-write.observedAt<30000)continue;
        upsertUser(state, { id: known.id, username: known.username, following: row.following, followedBy: row.followedBy, followRequested: row.followRequested }, 'native-dom');
      }
      return true;
    },
    async ROSTER_REFERENCES(s, state, message) {
      if (!/^g\d{1,30}$/.test(message.groupId || "") || !Array.isArray(message.usernames)) throw new Error("成员来源缺少有效群 ID");
      const usernames = [...new Set((message.usernames || []).filter(u => typeof u === "string" && /^[a-z0-9_]{1,15}$/i.test(u)).map(u => u.toLowerCase()))].slice(0,5000);
      if (!usernames.length) return;
      const previous = state.groups[message.groupId];
      const refs = [...new Set([...(previous?.usernames || []), ...usernames])].slice(0,5000);
      const ids = Object.values(state.users).filter(u => refs.includes(u.username)).map(u => u.id);
      state.groups[message.groupId] = { ...previous, id: message.groupId, label: previous?.label || "当前群聊",
        usernames: refs, userIds: [...new Set([...(previous?.userIds || []), ...ids])], complete: false, source: "member-list-dom", lastSeen: Date.now() };
    },
    async ENRICH_GROUP(s, state, message) {
      const group = state.groups[message.groupId];
      if (!group?.usernames?.length) throw new Error("先打开当前群的成员列表");
      const retryAt = Math.max(group.retryAt || 0,state.profileRetryAt || 0);
      if (retryAt > Date.now()) throw Object.assign(new Error("成员资料请求仍在冷却"), { retryAt, code:'PROFILE_COOLDOWN' });
      const known = new Set((message.refreshUnknown ? groupUsers(state,group) : group.userIds.map(id=>state.users[id])).filter(u=>u && (!message.refreshUnknown || typeof u.following==='boolean' || u.followRequested || u.id===s.accountId)).map(u=>u.username));
      if (message.retryFailed) group.failedReferences = {};
      group.failedReferences ||= {};
      const priority=new Set(Array.isArray(message.priorityUsernames)?message.priorityUsernames.slice(0,100):[]);
      const pending = group.usernames.filter(u => !known.has(u) && !group.failedReferences[u]).sort((a,b)=>Number(priority.has(b))-Number(priority.has(a)));
      group.error = null; group.retryAt = null;
      for (const username of pending.slice(0,1)) {
        try {
          const user = upsertUser(state, await adapter.profile(s, username), "group-profile");
          group.userIds = [...new Set([...group.userIds, user.id])]; group.lastSeen = Date.now();
          if(message.refreshUnknown && user.id!==s.accountId && groupUsers(state,group).find(u=>u.id===user.id)?.following == null && !user.followRequested)
            group.failedReferences[username]={message:'X 未返回关注关系',code:'RELATION_UNKNOWN',at:Date.now()};
          await checkpoint(s, state);
        } catch (error) {
          group.error = error.message; group.retryAt = error.retryAt || null;
          if(error.code==='ACCOUNT_UNAVAILABLE'){
            state.unavailableAccounts ||= {};
            state.unavailableAccounts[username]={availability:'unavailable',availabilityAt:Date.now()};
            const member=Object.values(state.users).find(u=>u.username===username);
            if(member){member.availability='unavailable';member.availabilityAt=Date.now();}
          }
          if (error.retryAt) state.profileRetryAt = error.retryAt;
          if (!error.retryAt) group.failedReferences[username] = { message: error.message, code: error.code || "PROFILE_FAILED", at: Date.now() };
          await checkpoint(s, state);
          if (error.retryAt || error.code === "ENDPOINT_MISSING") throw error;
        }
      }
    },
    async ACCOUNT(s, state, message = {}) {
      const username = /^[a-z0-9_]{1,15}$/i.test(message.username || "") ? message.username : state.account?.username;
      state.account = { ...await adapter.account(s, username), fetchedAt: Date.now() };
      upsertUser(state, state.account, "account");
    },
    async SYNC_LIST(s, state, message) {
      await syncList(s, state, message.kind, message.restart === true);
      const job = state.autoSync?.jobs?.[message.kind];
      if (job) { job.error = null; job.failures = 0; job.retryAt = null; }
      if (state.autoSync && state.autoSync.status !== 'running') state.autoSync.status = Object.values(state.autoSync.jobs).some(j => j.error) ? 'partial' : Object.values(state.tasks).some(t => t.status === 'paused') ? 'waiting' : 'ready';
    },
    async RELATIONSHIPS(s, state, message) { for (const kind of ["following", "followers"]) await syncList(s, state, kind, message.restart === true); },
    async ANALYTICS(s, state) { state.analytics = await adapter.analytics(s); },
    async CREATOR(s, state, message = {}) {
      const format = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" });
      const todayKey = format.format(new Date());
      let task = state.tasks.creator;
      if (!task || task.today !== todayKey || message.restart || message.refreshHead || task.status === "complete") task = state.tasks.creator = {
        today: todayKey, records: message.refreshHead && task?.today === todayKey ? { ...task.records } : {}, coverage: {}, status: "pending", startedAt: Date.now() };
      if (task.retryAt > Date.now()) throw Object.assign(new Error("创作同步仍在冷却"), { retryAt: task.retryAt });
      task.status = "running"; task.error = null; task.retryAt = null;
      await checkpoint(s, state);
      try {
        for (const kind of ["posts", "replies", "reposts"]) {
          const old = task.coverage[kind]; if (old?.complete) continue;
          const page = await adapter.creatorPage(s, kind, old?.cursor);
          if (!page.complete && (!page.cursor || page.cursor === old?.cursor)) throw new Error("创作游标未前进");
          const records = { ...task.records };
          for (const t of page.tweets) {
            if (!validId(t.id_str) || !Number.isFinite(Date.parse(t.created_at))) throw new Error("帖子 ID 或时间无法识别，未提交本页");
            // Retain only today's counters, never tweet text or historic content.
            if (format.format(new Date(t.created_at)) === task.today) records[t.id_str] = {
              id_str: t.id_str, created_at: t.created_at,
              in_reply_to_status_id_str: t.in_reply_to_status_id_str || null, retweeted_status: Boolean(t.retweeted_status) };
          }
          if (Object.keys(records).length > 10000) throw new Error("今日记录超过存储上限");
          task.records = records;
          task.coverage[kind] = { cursor: page.cursor, complete: page.complete, pages: (old?.pages || 0) + 1 };
          await checkpoint(s, state);
        }
        task.status = Object.values(task.coverage).length === 3 && Object.values(task.coverage).every(p => p.complete) ? "complete" : "paused";
      } catch (error) {
        task.status = "error"; task.error = { code: error.code || "CREATOR_FAILED", message: error.message }; task.retryAt = error.retryAt || null;
        throw error;
      } finally {
      const tweets = Object.values(task.records);
      const today = task.today; const dated = tweets.filter(t => Number.isFinite(Date.parse(t.created_at)));
      const daily = dated.filter(t => format.format(new Date(t.created_at)) === today);
      state.creator = { today, sampled: tweets.length, posts: task.coverage.posts ? daily.filter(t => !t.retweeted_status && !t.in_reply_to_status_id_str).length : null,
        replies: task.coverage.replies ? daily.filter(t => !t.retweeted_status && t.in_reply_to_status_id_str).length : null,
        reposts: task.coverage.reposts ? daily.filter(t => t.retweeted_status).length : null, invalidDates: tweets.length - dated.length, fetchedAt: Date.now(),
        coverage: task.coverage, complete: task.status === "complete",
        scope: task.status === "complete" ? "北京时间今日；三类时间线已到结束" : "北京时间今日已采集数量；可续传，未确认全天覆盖" };
      task.updatedAt = Date.now(); await checkpoint(s, state);
      }
    },
    async FOLLOW(s, state, message) {
      if(message.accountId && message.accountId!==s.accountId)throw new Error('账号已切换，已取消此关注任务');
      const group = message.fromFollowers ? {userIds:followBackUsers(state).map(u=>u.id)} : state.groups[message.groupId];
      const targetName=String(message.username||state.users[message.userId]?.username||'').toLowerCase();
      if(state.unavailableAccounts?.[targetName] || state.users[message.userId]?.availability==='unavailable')throw Object.assign(new Error('账号不可用 · 已移入异常列表'),{code:'ACCOUNT_UNAVAILABLE'});
      let member = state.users[message.userId];
      if (!member && /^[a-z0-9_]{1,15}$/i.test(message.username || '') && group?.usernames?.includes(message.username.toLowerCase())) {
        const username=message.username.toLowerCase();
        member=Object.values(state.users).find(u=>u.username===username);
        if (!member) {
          if (state.profileRetryAt > Date.now()) throw Object.assign(new Error('成员资料请求仍在冷却'),{retryAt:state.profileRetryAt});
          try {
            const raw=await adapter.profile(s,username);
            if (normalizeUser(raw)?.username!==username) throw new Error('成员资料不匹配');
            member=upsertUser(state,raw,'group-profile');
          }
          catch(error){if(error.code==='ACCOUNT_UNAVAILABLE'){state.unavailableAccounts ||= {};state.unavailableAccounts[username]={availability:'unavailable',availabilityAt:Date.now()};await checkpoint(s,state);}if(error.retryAt){state.profileRetryAt=error.retryAt;await checkpoint(s,state);}throw error;}
          if (!member || member.username!==username) throw new Error('成员资料不匹配');
        }
        group.userIds=[...new Set([...group.userIds,member.id])];
        await checkpoint(s,state);
      }
      if(member && group?.usernames?.includes(member.username))group.userIds=[...new Set([...(group.userIds||[]),member.id])];
      if (!member || !group?.userIds.includes(member.id) || !validId(member.id) || member.id === s.accountId) throw new Error("当前群聊成员不可用");
      message.userId=member.id;
      const relation=groupUsers(state,group).find(u=>u.id===member.id);
      if (relation.following === true || member.followRequested === true) return;
      let result;
      try{result=await adapter.follow(s,member.id);}catch(error){
        // A lost POST response may still have committed. Verify with GET; never replay POST.
        if(error.code==='ACCOUNT_UNAVAILABLE'){
          state.unavailableAccounts ||= {};
          state.unavailableAccounts[member.username]={availability:'unavailable',availabilityAt:Date.now()};
          member.availability='unavailable';member.availabilityAt=Date.now();await checkpoint(s,state);
        }
        if(error.code==='HTTP_403' && !(state.profileRetryAt>Date.now()) && typeof adapter.profile==='function'){
          try{await adapter.profile(s,member.username);}catch(profileError){
            if(profileError.code==='ACCOUNT_UNAVAILABLE'){
              state.unavailableAccounts ||= {};state.unavailableAccounts[member.username]={availability:'unavailable',availabilityAt:Date.now(),userId:member.id,reason:profileError.reason||'Unavailable'};
              member.availability='unavailable';member.availabilityAt=Date.now();await checkpoint(s,state);throw profileError;
            }
            if(profileError.retryAt){state.profileRetryAt=profileError.retryAt;await checkpoint(s,state);}
          }
        }
        if(error.code!=='WRITE_UNCONFIRMED')throw error;
        result={};
      }
      const returned=result.user?.result || result.user || result.data?.user?.result || result;
      const responseId=returned.rest_id || returned.id_str || returned.id;
      if(responseId && String(responseId)!==member.id)throw new Error("关注响应账号不匹配，未更新本地状态");
      let following=returned.relationship_perspectives?.following ?? returned.following ?? returned.legacy?.following;
      let requested=returned.follow_request_sent ?? returned.legacy?.follow_request_sent;
      if(following!==true && requested!==true){
        if(state.profileRetryAt>Date.now())throw Object.assign(new Error('关注结果待核实，资料请求正在冷却；不会重发关注'),{code:'WRITE_UNCONFIRMED',retryAt:state.profileRetryAt});
        if(typeof adapter.profile!=='function')throw new Error("X 未确认关注结果，请查看原生页面");
        let verified;
        try{verified=normalizeUser(await adapter.profile(s,member.username));}catch(error){
          if(error.code==='ACCOUNT_UNAVAILABLE') { member.availability='unavailable'; member.availabilityAt=Date.now(); await checkpoint(s,state); throw Object.assign(new Error('账号不可用 · X 账号已冻结或停用'),{code:'ACCOUNT_UNAVAILABLE'}); }
          throw Object.assign(new Error("关注请求结果暂未确认，资料核验失败，请在原生页面核实；不要连续点击"),{code:'WRITE_UNCONFIRMED',retryAt:error.retryAt||null});
        }
        if(!verified || verified.id!==member.id || verified.username!==member.username)throw Object.assign(new Error("关注结果核验账号不匹配，请查看原生页面"),{code:'WRITE_UNCONFIRMED'});
        following=verified.following;requested=verified.followRequested;
        if(following!==true && requested!==true)throw Object.assign(new Error(following===false?"X 当前仍显示未关注，请在原生页面核实后重试":"X 未返回明确关注状态，请在原生页面核实"),{code:'WRITE_UNCONFIRMED'});
      }
      const updated=upsertUser(state, { id: member.id, username: member.username, displayName: member.displayName,
        following: following === true, followRequested: requested === true }, "follow-write");
      if(following===true){updated.followedAt=Date.now();updated.followedAtSource='plugin';}
      if(following===true)recordRelationshipEvent(state,member.id,true,'plugin');
      // A confirmed addition changes one membership, not the validity of all other cached relationships.
      const snapshot=state.lists.following;
      if(snapshot?.complete && following===true) snapshot.ids=[...new Set([...snapshot.ids,member.id])];
      if (state.account) state.account = { ...state.account, followingCount: null, fetchedAt: null };
    },
    async FOLLOW_BACK(s,state,message){
      if(message.accountId!==s.accountId)throw new Error('账号已切换');
      if(!followBackUsers(state).some(u=>u.id===message.userId))throw new Error('此账号已不在需回关名单，请刷新后重试');
      return this.FOLLOW(s,state,{...message,fromFollowers:true});
    },
    async UNFOLLOW(s,state,message){
      if(message.accountId!==s.accountId)throw new Error('账号已切换，已取消取关');
      const group=state.groups[message.groupId];
      const member=state.users[message.userId]||Object.values(state.users).find(u=>u.username===message.username);
      if(!member||!validId(member.id)||member.id===s.accountId||!group?.userIds.includes(member.id))throw new Error('当前群聊成员不可用');
      if(groupUsers(state,group).find(u=>u.id===member.id)?.following===false)return;
      let result;
      try{result=await adapter.unfollow(s,member.id);}catch(error){if(error.code!=='WRITE_UNCONFIRMED')throw error;result={};}
      const raw=result.user?.result||result.user||result.data?.user?.result||result;
      const id=raw.rest_id||raw.id_str||raw.id;
      if(id&&String(id)!==member.id)throw new Error('取关响应账号不匹配');
      let following=raw.relationship_perspectives?.following??raw.following??raw.legacy?.following;
      if(following!==false){
        let verified;
        try { verified=normalizeUser(await adapter.profile(s,member.username)); }
        catch(error){throw Object.assign(new Error('取关结果暂未确认，请在原生页面核实'),{code:'WRITE_UNCONFIRMED',retryAt:error.retryAt||null});}
        if(!verified||verified.id!==member.id||verified.username!==member.username||verified.following!==false)throw Object.assign(new Error('X 未确认取关结果，请在原生页面核实'),{code:'WRITE_UNCONFIRMED'});
      }
      const updated=upsertUser(state,{id:member.id,username:member.username,following:false,followRequested:false},'follow-write');
      updated.unfollowedAt=Date.now();updated.followedAt=null;
      recordRelationshipEvent(state,member.id,false,'plugin');
      if(state.lists.following?.complete)state.lists.following.ids=state.lists.following.ids.filter(id=>id!==member.id);
      if(state.account){state.account.followingCount=null;state.account.fetchedAt=null;}
    },
    async ROSTER(s, state, message) {
      if (!message.groupId || message.groupId === "current-chat" || !Array.isArray(message.users)) return;
      const groupId = String(message.groupId).slice(0, 120); const previous = state.groups[groupId];
      if (!/^[a-zA-Z0-9_-]{1,120}$/.test(groupId) || ["__proto__", "constructor", "prototype"].includes(groupId)) return;
      const ids = message.users.slice(0, 500).map(raw => upsertUser(state, raw, "group")?.id).filter(Boolean);
      if (!ids.length) return;
      state.groups[groupId] = { id: groupId, label: String(message.title || "X 群聊").slice(0, 100),
        userIds: [...new Set([...(previous?.userIds || []), ...ids])].slice(0, 500), lastSeen: Date.now(), complete: false };
    }
  };
}
