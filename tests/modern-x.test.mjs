import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from '../src/background/domain.js';
import { parseTweetPage } from '../src/background/x-adapter.js';
import { EndpointRegistry } from '../src/background/endpoint-registry.js';
test('modern X user has no legacy fields', () => {
  const u = normalizeUser({rest_id:'1',core:{screen_name:'example',name:'Example'},profile_bio:{description:'Bio'},relationship_counts:{followers:4,following:3},tweet_counts:{tweets:9},follow_request_sent:true,is_blue_verified:true});
  assert.equal(u.followersCount,4); assert.equal(u.followingCount,3); assert.equal(u.statusesCount,9); assert.equal(u.description,'Bio'); assert.equal(u.followRequested,true); assert.equal(u.following,null);
});
test('reply modules filter foreign parents and deduplicate own tweets', () => {
  const item = (id,author) => ({item:{itemContent:{tweet_results:{result:{rest_id:id,legacy:{user_id_str:author,created_at:'2026-10-03T00:00:00Z'}}}}}});
  const page = parseTweetPage({data:{user:{result:{timeline:{timeline:{instructions:[{type:'TimelineAddEntries',entries:[{content:{items:[item('2','8'),item('3','1'),item('3','1')]}},{content:{cursorType:'Bottom',value:'next'}}]}]}}}}}},'1');
  assert.equal(page.tweets.length,1); assert.equal(page.tweets[0].id_str,'3'); assert.equal(page.complete,false); assert.equal(page.cursor,'next');
});
test('empty repost timeline needs explicit termination', () => {
  const payload = {data:{user:{result:{timeline:{timeline:{instructions:[{type:'TimelineTerminateTimeline',direction:'Bottom'}]}}}}}};
  assert.equal(parseTweetPage(payload,'1').complete,true);
  assert.throws(() => parseTweetPage({data:{user:{result:{timeline:{timeline:{instructions:[]}}}}}},'1'));
});
test('registry retains safe defaults but drops account and pagination values', () => {
  const registry = new EndpointRegistry({});
  const url = new URL('https://x.com/i/api/graphql/query/UserRepliesTimeline');
  url.searchParams.set('variables',JSON.stringify({userId:'123',cursor:'secret',count:20,withCommunity:true,screen_name:'private'}));
  const record = registry.observe({url:url.href,method:'GET',tabId:1,requestId:'real-response-test'});
  assert.notEqual(registry.find('replies'),record);
  registry.completed({url:url.href,tabId:1,requestId:'real-response-test',statusCode:200});
  assert.deepEqual(record.defaults,{count:20,withCommunity:true}); assert.equal(registry.find('replies'),record);
  assert.equal(JSON.stringify(record).includes('secret'),false);
});
