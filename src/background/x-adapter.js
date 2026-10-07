import {parseRecentPosts} from './recent-posts.js';
import { normalizeUser } from "./domain.js";
import { ANALYTICS_PARSER_VERSION } from './analytics-schema.js';
import { verifiedDestroy } from './verified-writes.js';
import { bundledEndpoints } from './bundled-endpoints.js';
import { TransactionHeaders } from './transaction-headers.js';
import { readInPage, readBootInPage, writePostInPage } from './page-read.js';
export class ApiError extends Error {
  constructor(message, code, retryAt = null) { super(message); this.code = code; this.retryAt = retryAt; }
}
export function parseUserPage(payload) {
  if (payload.errors?.length) throw new ApiError("X 返回错误，未更新名单", "API_ERROR");
  const timeline = payload.data?.user?.result?.timeline?.timeline || payload.data?.user?.result?.timeline;
  const instructions = timeline?.instructions;
  if (!Array.isArray(instructions)) throw new ApiError("X 名单结构已变化", "SCHEMA_CHANGED");
  const entries = instructions.flatMap(i => i.entries || (i.entry ? [i.entry] : []));
  const users = []; let bottom = null;
  for (const entry of entries) {
    const content = entry.content;
    if (content?.cursorType === "Bottom") bottom = String(content.value || "");
    const items = content?.items?.map(i => i.item?.itemContent) || [content?.itemContent];
    for (const item of items) if (normalizeUser(item?.user_results?.result)) users.push(item.user_results.result);
  }
  const terminated = instructions.some(i => i.type === "TimelineTerminateTimeline" && i.direction === "Bottom");
  if (!terminated && !bottom) throw new ApiError("未识别分页游标或结束信号，请检查 X 原生页面", "SCHEMA_CHANGED");
  return { users, cursor: terminated ? null : bottom, complete: terminated, source: "graphql" };
}
export class XWebAdapter {
  async recentPosts(s, user) {
    const record=this.registry.records.UserOriginalsTimeline;
    if(!record)throw new ApiError('请打开原生帖子页后重试','ENDPOINT_MISSING');
    return parseRecentPosts(await this.graphql(s,record,{userId:user.id}),user.id,user.username,20);
  }
  async setPostLike(s, tweetId, liked) {
    await this.sessions.assertCurrent(s);
    const operation=liked?'FavoriteTweet':'UnfavoriteTweet',queryId=liked?'lI07N6Otwv1PhnEgXILM7A':'ZYKSe-w7KEslx3JhSIk5LA';
    const path=`/i/api/graphql/${queryId}/${operation}`;
    let transactionId;try{transactionId=await this.transactions.get(s.origin,'POST',path,s);}catch{throw new ApiError('原生请求签名未就绪，请刷新后重试','WRITE_NOT_SENT');}
    let result;
    try { const frames=await this.chrome.scripting.executeScript({target:{tabId:s.tabId,frameIds:[0]},world:'MAIN',func:writePostInPage,
      args:[{origin:s.origin,accountId:s.accountId,authorization:s.authorization,transactionId,operation,tweetId}]});result=frames[0]?.result; }
    catch { throw new ApiError('点赞结果未确认，请刷新核验','WRITE_UNCONFIRMED'); }
    if(!result?.handled || result.error)throw new ApiError(result?.error||'点赞结果未确认，请刷新核验',result?.code||'WRITE_UNCONFIRMED');
    if(result.status!==200)throw new ApiError(`X 点赞请求失败（${result.status}），请刷新核验`,result.status===429?'HTTP_429':'WRITE_UNCONFIRMED',result.status===429?(Number(result.reset)>0?Number(result.reset)*1000:Date.now()+60000):null);
    if(result.data?.errors?.length)throw new ApiError('X 拒绝点赞操作，请刷新核验','API_ERROR');
    if(result.data?.data?.[liked?'favorite_tweet':'unfavorite_tweet']!=='Done')throw new ApiError('点赞结果未确认，请刷新核验','WRITE_UNCONFIRMED');
    await this.sessions.assertCurrent(s);
  }
  async nativeSnapshot(s) {
    if (!this.chrome?.tabs.sendMessage) return null;
    try { return await this.chrome.tabs.sendMessage(s.tabId, { type: 'CIRCLEMATE_NATIVE_SNAPSHOT' }, { frameId: 0 }); } catch { return null; }
  }
  constructor({ fetch, sessions, registry, chrome }) { this.fetch = fetch; this.sessions = sessions; this.registry = registry; this.chrome = chrome; this.transactions = new TransactionHeaders(fetch, chrome?.scripting?.executeScript ? async s => {
      const frames = await chrome.scripting.executeScript({target:{tabId:s.tabId,frameIds:[0]},world:'MAIN',func:readBootInPage,args:[{origin:s.origin}]});
      const result = frames[0]?.result; return {ok:result?.ok,text:async()=>result?.html || ''};
    } : null); }
  async request(s, path, params = {}, method = "GET") {
    await this.sessions.assertCurrent(s);
    const url = new URL(s.origin + path); const body = new URLSearchParams(params);
    if (method === "GET") url.search = body.toString();
    let transactionId, transactionError = null;
    // Try fresh native headers. Preserve existing transport when public boot assets are unavailable.
    if (this.chrome?.scripting?.executeScript) { try { transactionId = await this.transactions.get(s.origin,method,path,s); } catch (error) { transactionError = ['X boot data unavailable','X transaction asset unavailable','BOOT_READ_FAILED','SEED_PARSE_FAILED'].includes(error.message) ? error.message : 'TRANSACTION_GENERATION_FAILED'; } }
    if (method === 'GET' && path.endsWith('/Followers') && this.chrome?.scripting?.executeScript && !transactionId) {
      const record=this.registry.records?.Followers;
      if(record) { record.lastFailure={at:Date.now(),transport:'transaction-init',status:null,sentTransactionId:false,transactionError};await this.registry.save?.(); }
      throw new ApiError('粉丝请求的原生交易标识初始化失败，后台将重试','TRANSACTION_UNAVAILABLE');
    }
    let response, transport = 'background';
    if (method === 'GET' && path.startsWith('/i/api/graphql/') && this.chrome?.scripting?.executeScript) {
      let result;
      try { const frames = await this.chrome.scripting.executeScript({ target:{tabId:s.tabId,frameIds:[0]},world:'MAIN',func:readInPage,
        args:[{origin:s.origin,accountId:s.accountId,path,params,transactionId,authorization:s.authorization}] }); result=frames[0]?.result; } catch {}
      if (result?.handled) {
        if(result.error) throw new ApiError(result.error,result.code || 'PAGE_REQUEST_FAILED');
        transport='main-page'; response={ok:result.status>=200 && result.status<300,status:result.status,
          headers:{get:name=>name==='content-type'?result.contentType:result.rateLimitReset},json:async()=>result.data};
      }
    }
    if (!response && this.chrome?.tabs.sendMessage) {
      let result;
      try { result = await this.chrome.tabs.sendMessage(s.tabId, { type: 'CIRCLEMATE_PAGE_REQUEST', accountId: s.accountId,
        path, method, params, transactionId, authorization: s.authorization }, { frameId: 0 }); }
      catch (error) {
        // A lost response after a POST may already have changed X. Never replay it.
        if (method === 'POST') throw new ApiError('关注请求结果未确认，请刷新成员资料后再操作', 'WRITE_UNCONFIRMED');
      }
      if (result?.handled) {
        if (result.error) throw new ApiError(result.error, result.code || 'PAGE_REQUEST_FAILED');
        transport = 'content-page'; response = { ok: result.status >= 200 && result.status < 300, status: result.status,
          headers: { get: name => name === 'content-type' ? result.contentType : result.rateLimitReset }, json: async () => result.data };
      }
    }
    try { response ||= await this.fetch(url, { method, credentials: "include", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { accept: 'application/json, text/plain, */*', authorization: s.authorization, "x-csrf-token": s.csrf, "x-twitter-auth-type": "OAuth2Session", "x-twitter-active-user": "yes",
        'x-twitter-client-language': 'zh-cn', ...(transactionId ? {'x-client-transaction-id':transactionId} : {}), ...(method === 'GET' ? {'content-type':'application/json'} : {}),
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
      ...(method === "POST" ? { body } : {}) });
    } catch(error) {
      if(method==='POST')throw new ApiError('操作请求结果未确认，请核实资料后再操作','WRITE_UNCONFIRMED');
      throw error;
    }
    if (!response.ok) {
      const operation = path.split('/').pop(), record = this.registry.records?.[operation];
      if (record) {
        let failure; try { failure=await response.json(); } catch {}
        record.lastFailure = { status:response.status,transport,at:Date.now(),contentType:response.headers?.get('content-type') || null,
          apiCodes:(Array.isArray(failure?.errors) ? failure.errors : []).map(e=>e.code).filter(Number.isFinite).slice(0,10),sentTransactionId:Boolean(transactionId),transactionError,sentFieldToggles:Object.hasOwn(params,'fieldToggles') };
        await this.registry.save?.();
      }
      const reset = Number(response.headers?.get("x-rate-limit-reset"));
      throw new ApiError(response.status === 429 ? "X 请求频率受限，请稍后续传" : `X 接口不可用（${response.status}）`,
        `HTTP_${response.status}`, response.status === 429 ? (reset > 0 ? reset * 1000 : Date.now() + 60000) : null);
    }
    let data;
    try { data=await response.json(); }
    catch(error){if(method==='POST')throw new ApiError('操作响应无法读取，请核实资料后再操作','WRITE_UNCONFIRMED');throw error;}
    if (data.errors?.length) {
      const error = new ApiError("X 拒绝了请求", "API_ERROR");
      error.apiCodes = data.errors.map(e => Number(e.code)).filter(Number.isFinite);
      throw error;
    }
    await this.sessions.assertCurrent(s); return data;
  }
  legacy(s, endpoint, params, method) { return this.request(s, `/i/api/1.1/${endpoint}.json`, params, method); }
  async graphql(s, record, variables) {
    try {
      return await this.request(s, `/i/api/graphql/${record.queryId}/${record.operation}`, {
        variables: JSON.stringify({ ...record.defaults, ...variables }), features: JSON.stringify(record.features),
        ...(Object.keys(record.fieldToggles || {}).length ? { fieldToggles: JSON.stringify(record.fieldToggles) } : {}) });
    } catch (error) {
      if (["HTTP_400", "HTTP_404"].includes(error.code)) {
        const bundled = bundledEndpoints()[record.operation];
        if (bundled && bundled.queryId !== record.queryId) {
          const data = await this.request(s, `/i/api/graphql/${bundled.queryId}/${bundled.operation}`, {
            variables: JSON.stringify({ ...bundled.defaults, ...variables }), features: JSON.stringify(bundled.features),
            ...(Object.keys(bundled.fieldToggles || {}).length ? { fieldToggles: JSON.stringify(bundled.fieldToggles) } : {}) });
          await this.registry.restoreBundled?.(record.operation, record.queryId);
          return data;
        }
        const page = ({Following:"关注名单",Followers:"粉丝名单",BlueVerifiedFollowers:"认证关注者名单",UserByScreenName:"个人资料",
          UserOriginalsTimeline:"帖子标签",UserRepliesTimeline:"回复标签",UserRepostsTimeline:"转帖标签",accountOverviewDailyQuery:"创作者数据分析"})[record.operation] || "对应页面";
        error.message = `${page}请求失败（${error.code.slice(5)}），后台将退避重试，也可手动重试`;
      }
      throw error;
    }
  }
  async account(s, username) {
    const currentName = s.viewer?.username || username;
    const name = /^[a-z0-9_]{1,15}$/i.test(currentName || '') ? currentName.toLowerCase() : null;
    // Prefer the verified profile operation over stale cached UserByRestId routes.
    const record = (name ? this.registry.find("profile") : null) || this.registry.find("account");
    if (!record) throw new ApiError('当前页面未识别到账号用户名，请等待 X 页面加载后重试', 'ACCOUNT_CONTEXT_MISSING');
    const raw = (await this.graphql(s, record, record.operation === "UserByScreenName" ? { screen_name: name } : { userId: s.accountId })).data?.user?.result;
    const normalized = normalizeUser(raw);
    if (!normalized || normalized.id !== s.accountId) throw new ApiError("账号数据不匹配，请刷新页面", "ACCOUNT_MISMATCH");
    return normalized;
  }
  async profile(s, username) {
    const record = this.registry.find("profile");
    if (!record) throw new ApiError("请先打开 X 个人资料页面以识别资料接口", "ENDPOINT_MISSING");
    let payload;
    try { payload=await this.graphql(s, record, { screen_name: username }); }
    catch (error) { if (error.apiCodes?.includes(63)) throw new ApiError('账号不可用 · X 账号已冻结', 'ACCOUNT_UNAVAILABLE'); throw error; }
    if(payload.errors?.some(error=>Number(error.code)===63))throw new ApiError('账号不可用 · X 账号已冻结','ACCOUNT_UNAVAILABLE');
    if(payload.errors?.length) throw new ApiError("X 未能返回成员资料，请稍后重试或查看原生个人资料", "PROFILE_API_ERROR");
    const raw=payload.data?.user?.result;
    if(!raw) throw new ApiError('X 未返回成员资料，未标记账号异常', 'PROFILE_MISSING');
    if(raw.__typename==='UserUnavailable'){
      const error=new ApiError(raw.reason==='Suspended'?'账号不可用 · X 账号已冻结':'账号不可用 · X 返回不可用状态', 'ACCOUNT_UNAVAILABLE');
      error.reason=typeof raw.reason==='string'?raw.reason.slice(0,80):'Unavailable';throw error;
    }
    const user = normalizeUser(raw);
    if (!user) throw new ApiError("成员资料格式无法识别，未发送关注请求", "SCHEMA_CHANGED");
    if(user.username!==username.toLowerCase()) throw new ApiError("成员用户名已变化，未发送关注请求，请刷新成员列表", "PROFILE_MISMATCH");
    return user;
  }
  async userPage(s, kind, cursor, adapterName) {
    const record = this.registry.find(kind);
    if (adapterName === "graphql" || (!adapterName && record)) {
      if (!record) throw new ApiError("请在 X 打开对应名单页面以识别接口", "ENDPOINT_MISSING");
      return parseUserPage(await this.graphql(s, record, { userId: s.accountId, count: record.defaults?.count || 20, includePromotedContent: false, ...(cursor ? { cursor } : {}) }));
    }
    if (kind === "verifiedFollowers") throw new ApiError("请先打开认证关注者页面以识别实际接口", "ENDPOINT_MISSING");
    const data = await this.legacy(s, kind === "following" ? "friends/list" : "followers/list", { user_id: s.accountId, count: "200", cursor: cursor || "-1", skip_status: "true" });
    if (!Array.isArray(data.users) || typeof data.next_cursor_str !== "string") throw new ApiError("X 名单格式已变化", "SCHEMA_CHANGED");
    return { users: data.users, cursor: data.next_cursor_str === "0" ? null : data.next_cursor_str, complete: data.next_cursor_str === "0", source: "legacy" };
  }
  async creatorPage(s, kind, cursor) {
    const record = this.registry.find(kind);
    if (!record) throw new ApiError("请打开个人资料的帖子、回复和转帖标签以识别接口", "ENDPOINT_MISSING");
    return parseTweetPage(await this.graphql(s, record, { userId: s.accountId, count: record.defaults?.count || 20, ...(cursor ? { cursor } : {}) }), s.accountId);
  }
  async analytics(s) {
    const record = this.registry.find("analytics");
    if (!record) throw new ApiError("请先打开 X 创作者工作室的数据分析页面", "ENDPOINT_MISSING");
    const day = 86400000; const to = Math.floor(Date.now() / day) * day + day; const from = to - 7 * day;
    const variables = { current_from: from, current_to: to, prev_from: from - 7 * day, prev_to: from,
      backfill_from: to - 2 * day, backfill_to: to, show_realtime_active_followers: true, show_verified_followers: true };
    for (const key of ["current_from", "current_to", "prev_from", "prev_to"]) variables[key + "_iso"] = new Date(variables[key]).toISOString();
    return parseAnalytics(await this.graphql(s, record, variables), { from, to });
  }
  follow(s, userId) { return this.legacy(s, "friendships/create", { user_id: userId }, "POST"); }
  unfollow(s, userId) {
    if(!this.registry.hasWriteEvidence?.('destroy'))throw new ApiError('取关接口尚未实测核验，请使用原生资料页取关', 'UNFOLLOW_NOT_VERIFIED');
    return this.legacy(s, verifiedDestroy.endpoint, { ...verifiedDestroy.defaults, user_id: userId }, verifiedDestroy.method);
  }
}

export function parseAnalytics(payload, range) {
  if (payload.errors?.length) throw new ApiError("X 返回分析错误", "API_ERROR");
  const result = payload.data?.viewer_v2?.user_results?.result;
  if (!Array.isArray(result?.current_time_series)) throw new ApiError("X 分析结构已变化", "SCHEMA_CHANGED");
  const numeric = v => (typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
  const totals = Object.create(null); const daily = Object.create(null); let invalidRows = 0;
  const previousTotals=Object.create(null);
  for(const row of result.previous_totals||[]){
    const count=numeric(row.count);
    if(count===null||!Number.isFinite(row.timestamp)||row.timestamp<range.from-(range.to-range.from)||row.timestamp>=range.from||!/^[A-Za-z][A-Za-z0-9]{0,60}$/.test(row.engagement_type||'')||!['true','false'].includes(row.is_engaging_user_verified))continue;
    previousTotals[row.engagement_type]=(previousTotals[row.engagement_type]||0)+count;
  }
  for (const row of result.current_time_series) {
    const count = numeric(row.count); const timestamp = row.timestamp;
    if (count === null || !Number.isFinite(timestamp) || !/^[A-Za-z][A-Za-z0-9]{0,60}$/.test(row.engagement_type || "") || !["true", "false"].includes(row.is_engaging_user_verified)) { invalidRows++; continue; }
    if (timestamp < range.from || timestamp >= range.to) continue;
    const date = new Date(timestamp).toISOString().slice(0,10); const type = row.engagement_type;
    // Verified/unverified are disjoint daily buckets. Hourly backfill overlaps and is excluded.
    totals[type] = (totals[type] || 0) + count;
    daily[date] ||= Object.create(null); daily[date][type] = (daily[date][type] || 0) + count;
  }
  const parseFollows=(rows,target,series,from,to)=>{
    if(!Array.isArray(rows)||!rows.length)return;
    for(const [type,key]of [['Follows','Follow'],['Unfollows','Unfollow']]){
      let sum=0,complete=true,seen=false;const dates=new Set();
      for(const row of rows){
        const at=Date.parse(row.timestamp?.iso8601_time);if(!Number.isFinite(at)||at<from||at>=to)continue;
        const day=new Date(at).toISOString().slice(0,10);if(dates.has(day)){complete=false;continue;}dates.add(day);
        seen=true;const metric=row.metric_values?.find(m=>m.metric_type===type);
        // Native tooltip confirms omitted metric_value on an existing metric means zero.
        // A missing metric entry or missing day remains unknown.
        const value=metric&&!Object.hasOwn(metric,'metric_value')?0:numeric(metric?.metric_value);
        if(value===null)complete=false;else sum+=value;
        if(series){const date=new Date(at).toISOString().slice(0,10);series[date]||=Object.create(null);series[date][key]=value;}
      }
      target[key]=seen&&complete&&dates.size===Math.ceil((to-from)/86400000)?sum:null;
    }
  };
  parseFollows(result.legacy_current_follow_metrics,totals,daily,range.from,range.to);
  parseFollows(result.legacy_previous_follow_metrics,previousTotals,null,range.from-(range.to-range.from),range.from);
  return { ...range, parserVersion:ANALYTICS_PARSER_VERSION,timeZone: "UTC", totals, previousTotals, daily, invalidRows,
    verifiedFollowers: numeric(result.verified_follower_count), followers: numeric(result.relationship_counts?.followers),
    activeFollowers: numeric(result.realtime_active_followers?.active_count),
    activeApproximate: typeof result.realtime_active_followers?.is_approximate === "boolean" ? result.realtime_active_followers.is_approximate : null,
    fetchedAt: Date.now() };
}

// Inspect only timeline items. Conversation parents and quoted tweets are not authored output.
export function parseTweetPage(payload, accountId) {
  if (payload.errors?.length) throw new ApiError("X 返回帖子错误", "API_ERROR");
  const instructions = payload.data?.user?.result?.timeline?.timeline?.instructions;
  if (!Array.isArray(instructions)) throw new ApiError("X 帖子结构已变化", "SCHEMA_CHANGED");
  const tweets = new Map(); let cursor = null;
  for (const instruction of instructions) {
    for (const entry of instruction.entries || (instruction.entry ? [instruction.entry] : [])) {
      const content = entry.content;
      if (content?.cursorType === "Bottom") cursor = content.value || null;
      for (const item of content?.items?.map(i => i.item?.itemContent) || [content?.itemContent]) {
        let result = item?.tweet_results?.result;
        if (result?.__typename === "TweetWithVisibilityResults") result = result.tweet;
        const legacy = result?.legacy;
        const author = legacy?.user_id_str || result?.core?.user_results?.result?.rest_id;
        if (legacy && String(author) === String(accountId) && result.rest_id) {
          tweets.set(result.rest_id, { ...legacy, id_str: result.rest_id });
        }
      }
    }
  }
  const complete = instructions.some(i => i.type === "TimelineTerminateTimeline" && i.direction === "Bottom");
  if (!complete && !cursor) throw new ApiError("帖子分页结构无法识别", "SCHEMA_CHANGED");
  return { tweets: [...tweets.values()], cursor: complete ? null : cursor, complete };
}
