// Persistent freshness and retry policy; each pass reads at most one page per list.
import { ANALYTICS_PARSER_VERSION } from './analytics-schema.js';
export const CACHE_TTL = { following: 6 * 3600000, followers: 6 * 3600000, account: 15 * 60000, creator: 5 * 60000, analytics: 60 * 60000, verifiedFollowers: 6 * 3600000 };
export async function autoSync({ session, state, services, checkpoint, now = Date.now, maxJobs = Infinity,forceCheckpoint=false }) {
  const previous=JSON.stringify(state.autoSync);
  let processed = 0;
  state.autoSync ||= { jobs: {} }; state.autoSync.jobs ||= {};
  if (state.autoSync.policyVersion !== 3) {
    for (const [kind, job] of Object.entries(state.autoSync.jobs)) {
      if (['HTTP_400','HTTP_404'].includes(job.error?.code)) { job.retryAt = null; job.lastAttempt = null; if (state.tasks[kind]) state.tasks[kind].retryAt = null; }
    }
    state.autoSync.policyVersion = 3;
  }
  const analyticsUpgrade=Boolean(state.analytics&&state.analytics.parserVersion!==ANALYTICS_PARSER_VERSION);
  const kinds=Object.keys(CACHE_TTL);
  if(analyticsUpgrade){kinds.splice(kinds.indexOf('analytics'),1);kinds.unshift('analytics');}
  for (const kind of kinds) {
    const job = state.autoSync.jobs[kind] ||= {};
    const task = state.tasks[kind];
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date(now()));
    const refreshed = kind === 'creator' ? (state.creator?.today === today ? state.creator.fetchedAt : null) : kind === 'account' ? state.account?.fetchedAt : kind === 'analytics' ? (analyticsUpgrade?null:state.analytics?.fetchedAt) : state.lists[kind]?.fetchedAt;
    if (job.retryAt > now() || task?.retryAt > now() || (!state.lists[kind]?.stale && refreshed && now() - refreshed < CACHE_TTL[kind] && (!task || task.status === 'complete'))) continue;
    if (job.lastAttempt && now() - job.lastAttempt < 60000 && !(kind==='analytics'&&analyticsUpgrade)) continue;
    if (processed >= maxJobs) break;processed++;
    state.autoSync.status = 'running'; state.autoSync.currentKind = kind;
    state.autoSync.activeUntil = now() + 120000; await checkpoint(session, state);
    job.lastAttempt = now();
    try {
      if (kind === 'account') await services.ACCOUNT(session, state);
      else if (kind === 'creator') await services.CREATOR(session, state, { refreshHead: task?.today === today && now() - task.startedAt >= CACHE_TTL.creator });
      else if (kind === 'analytics') await services.ANALYTICS(session, state);
      else await services.SYNC_LIST(session, state, { kind });
      job.failures = 0; job.error = null; job.retryAt = null; job.lastSuccess = now();
    } catch (error) {
      job.failures = (job.failures || 0) + 1;
      job.error = { code: error.code || 'SYNC_FAILED', message: error.message };
      job.retryAt = Math.max(error.retryAt || 0, now() + Math.min(3600000, 60000 * 2 ** Math.min(job.failures, 6)));
    }
    await checkpoint(session, state);
  }
  state.autoSync.currentKind = null; state.autoSync.activeUntil = null;
  state.autoSync.status = Object.values(state.autoSync.jobs).some(j => j.error) ? 'partial' : ['creator','following','followers','verifiedFollowers'].some(k => state.tasks[k] && state.tasks[k].status !== 'complete') ? 'waiting' : 'ready';
  if(processed || forceCheckpoint || JSON.stringify(state.autoSync)!==previous){state.autoSync.checkedAt = now(); await checkpoint(session, state);}
}
