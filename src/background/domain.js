import {interactionProjection} from './member-interactions.js';
export const SCHEMA_VERSION = 4;
export const LIST_KINDS = ["following", "followers", "verifiedFollowers"];
export const validId = id => /^\d{1,30}$/.test(String(id || ""));
export function resolveRelationship(state, raw, indices = null) {
  const user = { ...raw };
  const anomaly = state.unavailableAccounts?.[raw.username];
  if (anomaly && (!anomaly.userId || anomaly.userId === raw.id)) Object.assign(user, anomaly);
  for (const [kind, field] of [['following', 'following'], ['followers', 'followedBy']]) {
    const list = state.lists[kind];
    if (!list || list.stale) continue;
    const observation = user.fieldSources?.[field];
    // Older snapshots did not record scan start. They cannot outrank a dated direct observation.
    const cutoff = list.startedAt || 0;
    if (observation && observation.observedAt >= cutoff && typeof user[field] === 'boolean') continue;
    const index = indices?.get(list) || { ids: new Set(list.ids), names: new Set(list.ids.map(id => state.users[id]?.username).filter(Boolean)) };
    if (index.ids.has(user.id) || index.names.has(user.username)) user[field] = true;
    else if (list.complete) user[field] = false;
  }
  return user;
}
export function normalizeUser(raw) {
  const result = raw?.result || raw;
  if (!result || typeof result !== "object") return null;
  const legacy = result.legacy || result;
  const core = result.core || legacy;
  const relation = result.relationship_perspectives || legacy;
  const id = String(result.rest_id || result.id_str || result.id || "");
  const username = String(core.screen_name || legacy.screen_name || result.screen_name || result.username || "").toLowerCase();
  if (!validId(id) || !/^[a-z0-9_]{1,15}$/.test(username)) return null;
  const boolean = (...values) => values.find(v => typeof v === "boolean") ?? null;
  const number = v => Number.isFinite(v) && v >= 0 ? v : null;
  return {
    id, username, displayName: String(core.name || legacy.name || result.name || result.displayName || username).slice(0, 100),
    description: String(result.profile_bio?.description || legacy.description || result.description || "").slice(0, 500),
    following: boolean(relation.following, legacy.following, result.following),
    followedBy: boolean(relation.followed_by, legacy.followed_by, result.followedBy),
    followRequested: boolean(result.follow_request_sent, legacy.follow_request_sent, result.followRequested),
    blueVerified: boolean(result.is_blue_verified, result.blueVerified),
    verificationType: result.verification?.verified_type || legacy.verified_type || null,
    followingCount: number(result.relationship_counts?.following ?? legacy.friends_count ?? result.followingCount),
    followersCount: number(result.relationship_counts?.followers ?? legacy.followers_count ?? result.followersCount),
    statusesCount: number(result.tweet_counts?.tweets ?? legacy.statuses_count ?? result.statusesCount)
  };
}
export function emptyAccount(accountId) {
  return { schemaVersion: SCHEMA_VERSION, accountId, users: {}, groups: {}, lists: {}, tasks: {},
    account: null, creator: null, contacts: {}, updatedAt: 0 };
}
export function upsertUser(state, raw, source, now = Date.now()) {
  const normalized = normalizeUser(raw);
  if (!normalized) return null;
  const old = state.users[normalized.id] || {};
  const next = { ...old, id: normalized.id, sources: { ...old.sources, [source]: now }, observedAt: now };
  next.fieldSources = { ...old.fieldSources };
  for (const [key, value] of Object.entries(normalized)) {
    if (value === null || (value === "" && old[key])) continue;
    next[key] = value;
    next.fieldSources[key] = { source, observedAt: now };
  }
  state.users[next.id] = next;
  return next;
}
export function recordRelationshipEvent(state,userId,following,source,now=Date.now()){
  state.relationshipEvents=[...(state.relationshipEvents||[]),{userId,following,source,at:now}].slice(-1000);
}

function relationContext(state){
  return {byName:new Map(Object.values(state.users).map(u=>[u.username,u])),indices:new Map(['following','followers'].map(k=>state.lists[k]).filter(Boolean).map(list=>[list,{ids:new Set(list.ids),names:new Set(list.ids.map(id=>state.users[id]?.username).filter(Boolean))}]))};
}
export function groupUsers(state, group, context = relationContext(state)) {
  const following = state.lists.following;
  const followers = state.lists.followers;
  const byName = context.byName;
  const candidates = new Map((group.userIds || []).map(id => state.users[id]).filter(Boolean).map(u => [u.username,u]));
  for (const username of group.usernames || []) if (!candidates.has(username)) candidates.set(username, byName.get(username) || {username, displayName:username});
  const indices = context.indices;
  return [...candidates.values()].map(raw => {
    const user = resolveRelationship(state, raw, indices);
    if (user.username===state.account?.username) {user.id=state.accountId;user.following=null;user.followedBy=null;return user;}
    return user;
  });
}
export function projectAccount(state) {
  const context=relationContext(state);
  const relationships = {};
  for (const kind of LIST_KINDS) {
    const list = state.lists[kind]; const task = state.tasks[kind];
    const ids = task && task.status !== "complete" ? task.ids : list?.ids;
    if (!ids) continue;
    relationships[kind] = { users: ids.map(id => state.users[id]).filter(Boolean),
      cachedComplete: Boolean(list?.complete && !list.stale),
      cachedUsers: list?.complete && !list.stale && task && task.status !== "complete" ? list.ids.map(id=>state.users[id]).filter(Boolean) : undefined,
      complete: Boolean(list?.complete && !list.stale && (!task || task.status === "complete")),
      startedAt: list?.startedAt, fetchedAt: list?.fetchedAt || task?.updatedAt, stale: Boolean(list?.stale),
      status: task?.status || "complete", cursor: Boolean(task?.cursor),
      pages: task?.pages || 0, error: task?.error || null, retryAt: task?.retryAt || null };
  }
  return { schemaVersion: SCHEMA_VERSION, accountId: state.accountId, account: state.account,
    groups: Object.values(state.groups).sort((a,b) => b.lastSeen - a.lastSeen).map(g => ({ ...g, retryAt: Math.max(g.retryAt || 0,state.profileRetryAt || 0), users: groupUsers(state, g, context) })),
    relationships, followBack: followBackUsers(state,context), relationshipChanges: Object.fromEntries(Object.entries(state.lists).filter(([, list]) => !list.stale).map(([kind, list]) => [kind, list.changes])),
    groupReviews:state.groupReviews||{}, memberInteractions:interactionProjection(state.memberInteractions), creatorLibrary:state.creatorLibrary || {posts:[]}, creator: state.creator, analytics: state.analytics || null, autoSync: state.autoSync || null, nativePage: state.nativePage || null, tasks: state.tasks,
    revision:state.revision||0,capabilities: state.capabilities || {unfollow:false},writeQueue: state.writeQueue || { jobs: [], paused: false, nextAt: 0 }, updatedAt: state.updatedAt };
}
export function followBackUsers(state,context=relationContext(state)){
  const ids=new Set();
  for(const kind of ['followers','verifiedFollowers']){
    const task=state.tasks[kind],list=state.lists[kind];
    if(task&&task.status!=='complete')for(const id of task.ids||[])ids.add(id);
    if(list&&!list.stale)for(const id of list.ids||[])ids.add(id);
  }
  return [...ids].map(id=>{
    const raw=state.users[id];if(!raw)return null;
    const user=resolveRelationship(state,raw,context.indices);
    if(typeof user.followedBy!=='boolean')user.followedBy=true;
    return user;
  }).filter(u=>u&&u.id!==state.accountId&&u.followedBy===true&&u.following===false&&!u.followRequested&&u.availability!=='unavailable');
}
export function completeSnapshot(state, kind, task, now = Date.now()) {
  const old = state.lists[kind];
  const collected=new Set(task.ids);
  if(kind==='following' && task.startedAt)for(const user of Object.values(state.users)){
    const source=user.fieldSources?.following;
    if(['follow-write','native-write-confirmed','write-recovery'].includes(source?.source) && source.observedAt>=task.startedAt){if(user.following===true)collected.add(user.id);else collected.delete(user.id);}
  }
  const ids = [...collected];
  const prior = old?.complete && !old.stale ? old : old?.baseline;
  const previousIds=new Set(prior?.ids||[]),currentIds=new Set(ids);
  const changes = prior ? {
    added: ids.filter(id => !previousIds.has(id)), removed: prior.ids.filter(id => !currentIds.has(id)),
    comparedAt: now, baselineAt: prior.fetchedAt
  } : null;
  state.lists[kind] = { ids, complete: true, stale: false, startedAt: task.startedAt || now, fetchedAt: now, changes,
    baseline: { ids, fetchedAt: now, complete: true } };
  task.status = "complete"; task.cursor = null; task.updatedAt = now;
}
