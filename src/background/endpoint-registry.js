import { bundledEndpoints } from "./bundled-endpoints.js";
import { verifiedDestroy } from './verified-writes.js';
// Replay verified bundled or observed GET operations; never persist full URLs or headers.
export const OPERATIONS = Object.freeze({
  Following: "following", Followers: "followers", BlueVerifiedFollowers: "verifiedFollowers",
  VerifiedFollowers: "verifiedFollowers", UserByRestId: "account", UserByScreenName: "profile",
  UserOriginalsTimeline: "posts", UserRepliesTimeline: "replies", UserRepostsTimeline: "reposts",
  UsersByRestIds: "users", accountOverviewDailyQuery: "analytics",
  UserTweets: "posts", UserTweetsAndReplies: "postsAndReplies", UserMedia: "media", TweetDetail: "tweetDetail"
});
export class EndpointRegistry {
  constructor(storage) { this.storage = storage; this.records = bundledEndpoints(); this.candidates=new Map();this.writeEvidence={}; }
  async load() {
    this.records = bundledEndpoints();
    const stored = (await this.storage.get("circlemate_endpoints_v1")).circlemate_endpoints_v1 || {};
    this.writeEvidence=(await this.storage.get('circlemate_write_evidence')).circlemate_write_evidence||{};
    for (const [operation, record] of Object.entries(stored)) {
      if (!Object.hasOwn(OPERATIONS, operation) || record?.operation !== operation || !/^[\w-]+$/.test(record.queryId || "")) continue;
      if (record.lastHttpStatus !== 200) continue;
      if (!Number.isFinite(record.observedAt)) continue;
      const flags = value => Object.fromEntries(Object.entries(value||{}).filter(([key,v])=>/^\w{1,120}$/.test(key)&&typeof v==='boolean'));
      const defaults=Object.fromEntries(Object.entries(record.defaults||{}).filter(([key,v])=>/^\w{1,80}$/.test(key)&&(typeof v==='boolean'||key==='count'&&Number.isInteger(v)&&v>0&&v<=200)));
      if (!this.records[operation] || record.observedAt > this.records[operation].observedAt) this.records[operation] = {
        operation,queryId:record.queryId,source:'observed-response',observedAt:record.observedAt,
        variableNames:Array.isArray(record.variableNames)?record.variableNames.filter(key=>typeof key==='string'&&/^\w{1,80}$/.test(key)):[],
        features:flags(record.features),fieldToggles:flags(record.fieldToggles),lastHttpStatus:200,
        defaults: { ...this.records[operation]?.defaults, ...defaults } };
    }
  }
  observe(details) {
    if (details.method !== "GET" || details.tabId < 0) return null;
    const url = new URL(details.url);
    const match = url.pathname.match(/^\/i\/api\/graphql\/([\w-]+)\/(\w+)$/);
    if (!match || !Object.hasOwn(OPERATIONS, match[2])) return null;
    try {
      const variables = JSON.parse(url.searchParams.get("variables") || "{}");
      const features = JSON.parse(url.searchParams.get("features") || "{}");
      const fieldToggles = JSON.parse(url.searchParams.get("fieldToggles") || "{}");
      const safeFlags = v => Object.fromEntries(Object.entries(v).filter(([k,value]) => /^[\w]{1,120}$/.test(k) && typeof value === "boolean"));
      const record = { operation: match[2], queryId: match[1], source: "observed-request", observedAt: Date.now(),
        variableNames: Object.keys(variables).filter(k => /^[\w]{1,80}$/.test(k)),
        defaults: Object.fromEntries(Object.entries(variables).filter(([k,v]) =>
          /^[\w]{1,80}$/.test(k) && (typeof v === "boolean" || (k === "count" && Number.isInteger(v) && v > 0 && v <= 200)))),
        features: safeFlags(features), fieldToggles: safeFlags(fieldToggles) };
      if (this.records[match[2]]?.queryId === record.queryId && this.records[match[2]].lastFailure) record.lastFailure = this.records[match[2]].lastFailure;
      // Seeing a request is not evidence that its configuration works.
      if(details.requestId){this.candidates.set(details.requestId,record);if(this.candidates.size>500)this.candidates.delete(this.candidates.keys().next().value);}
      return record;
    } catch { return null; }
  }
  async save() { await this.storage.set({ circlemate_endpoints_v1: this.records }); }
  async confirmWrite(operation){
    if(!['create','destroy'].includes(operation))return;
    this.writeEvidence[operation]={method:'POST',parameter:'user_id',verifiedAt:Date.now(),source:'native-post-and-profile-confirmation'};
    await this.storage.set({circlemate_write_evidence:this.writeEvidence});
  }
  hasWriteEvidence(operation){const e=this.writeEvidence[operation]||(operation==='destroy'?verifiedDestroy.evidence:null);return Boolean(e?.method==='POST'&&e.parameter==='user_id'&&e.verifiedAt);}
  async restoreBundled(operation, queryId) {
    const record = bundledEndpoints()[operation];
    if (record && this.records[operation]?.queryId === queryId) {
      this.records[operation] = record; await this.save();
    }
  }
  completed(details) {
    if (details.tabId < 0) return false;
    const operation = new URL(details.url).pathname.split("/").pop();
    const candidate=this.candidates.get(details.requestId);this.candidates.delete(details.requestId);
    if(candidate && details.statusCode===200){candidate.source='observed-response';this.records[operation]=candidate;}
    const record = this.records[operation];
    if (!record || details.url.split("?")[0].split("/").at(-2) !== record.queryId) return false;
    if (details.statusCode >= 200 && details.statusCode < 300) delete record.lastFailure;
    record.lastHttpStatus = details.statusCode;
    record.lastResponseAt = Date.now();
    return true;
  }
  find(kind) { return Object.values(this.records).filter(r => OPERATIONS[r.operation] === kind).sort((a,b)=>b.observedAt-a.observedAt)[0] || null; }
}
