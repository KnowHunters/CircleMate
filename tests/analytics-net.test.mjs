import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAnalytics} from '../src/background/x-adapter.js';
import {readFile} from 'node:fs/promises';
const range={from:Date.parse('2026-09-29T00:00:00Z'),to:Date.parse('2026-10-06T00:00:00Z')};
// Selected real native 2026-10-05 HTTP 200 metrics; today Unfollows omits value.
const values=[[10,1],[7,1],[208,3],[65,4],[37,3],[69,4],[3,undefined]];
const rows=values.map(([follow,unfollow],i)=>({timestamp:{iso8601_time:new Date(range.from+i*86400000).toISOString()},metric_values:[{metric_type:'Follows',metric_value:follow},{metric_type:'Unfollows',...(unfollow===undefined?{}:{metric_value:unfollow})}]}));
const parse=legacy=>parseAnalytics({data:{viewer_v2:{user_results:{result:{current_time_series:[],legacy_current_follow_metrics:legacy}}}}},range);
test('native omitted zero unfollows retains invisible input metrics and computes net 383',()=>{
 const data=parse(rows);assert.equal(data.totals.Follow,399);assert.equal(data.totals.Unfollow,16);assert.equal(data.totals.Follow-data.totals.Unfollow,383);assert.equal(data.daily['2026-10-05'].Unfollow,0);
});
test('missing metric entry or missing date is not the observed zero-value encoding',()=>{
 const missing=structuredClone(rows);missing[6].metric_values.pop();assert.equal(parse(missing).totals.Unfollow,null);
 assert.equal(parse(rows.slice(0,6)).totals.Follow,null);
});

test('full native capture survives parsing and serializing with both net inputs retained',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/analytics-follow-live-2026-10-05.json',import.meta.url),'utf8'));
 const result=JSON.parse(JSON.stringify(parseAnalytics({data:{viewer_v2:{user_results:{result:fixture.result}}}},fixture.range)));
 assert.equal(result.parserVersion,2);assert.equal(result.totals.Follow,399);assert.equal(result.totals.Unfollow,16);assert.equal(result.totals.Follow-result.totals.Unfollow,383);
});
