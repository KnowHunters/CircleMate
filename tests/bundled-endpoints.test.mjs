import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EndpointRegistry } from '../src/background/endpoint-registry.js';
import { bundledEndpoints } from '../src/background/bundled-endpoints.js';
import { XWebAdapter } from '../src/background/x-adapter.js';
const storage = value=>({async get(){return {circlemate_endpoints_v1:value};}});
test('fresh installation includes all eight verified endpoints without page visits',async()=>{
  const registry=new EndpointRegistry(storage());await registry.load();
  for(const kind of ['following','followers','verifiedFollowers','profile','posts','replies','reposts','analytics'])assert.ok(registry.find(kind));
  assert.equal(Object.keys(registry.records).length,8);
  assert.equal(Object.keys(registry.find('posts').features).length,40);
  assert.equal(registry.find('profile').defaults.withGrokTranslatedBio,true);
  assert.equal(registry.find('replies').defaults.withCommunity,true);
  const copy=bundledEndpoints();copy.Following.features.rweb_cashtags_enabled=false;
  assert.equal(bundledEndpoints().Following.features.rweb_cashtags_enabled,true);
});
test('bundle supersedes stale cache while newer browser captures take priority',async()=>{
  const baseline=bundledEndpoints().Following;
  let registry=new EndpointRegistry(storage({Following:{...baseline,queryId:'old',observedAt:baseline.observedAt-1}}));await registry.load();
  assert.equal(registry.find('following').queryId,baseline.queryId);
  registry=new EndpointRegistry(storage({Following:{operation:'Following',queryId:'new',lastHttpStatus:200,observedAt:baseline.observedAt+1,features:{},fieldToggles:{}}}));await registry.load();
  assert.equal(registry.find('following').queryId,'new');assert.equal(registry.find('following').defaults.count,20);
});
test('bundled requests inject runtime subject and required flags without credentials in config',async()=>{
  const registry=new EndpointRegistry(storage());await registry.load();let request;
  const adapter=new XWebAdapter({registry,sessions:{async assertCurrent(){}},async fetch(url,options){request={url,options};return {ok:true,async json(){return {data:{user:{result:{timeline:{timeline:{instructions:[{type:'TimelineTerminateTimeline',direction:'Bottom'}]}}}}}};}};}});
  await adapter.userPage({origin:'https://x.com',accountId:'123',authorization:'Bearer SESSION',csrf:'SESSION_CSRF'},'followers');
  const vars=JSON.parse(request.url.searchParams.get('variables'));assert.equal(vars.userId,'123');assert.equal(vars.withGrokTranslatedBio,true);assert.equal(vars.count,20);
  assert.equal(request.options.credentials,'include');const config=JSON.stringify(registry.records);assert.equal(config.includes('SESSION'),false);assert.equal(config.includes('"123"'),false);
});

test('loaded endpoint cache strips unapproved fields and requires successful observation',async()=>{
 const baseline=bundledEndpoints().Following;
 const record={...baseline,queryId:'safe',observedAt:baseline.observedAt+1,lastHttpStatus:200,headers:{authorization:'SECRET'},defaults:{userId:'PRIVATE',count:20,token:'SECRET'},features:{good:true,bad:'SECRET'}};
 const registry=new EndpointRegistry(storage({Following:record}));await registry.load();
 const serialized=JSON.stringify(registry.records);assert.equal(serialized.includes('SECRET'),false);assert.equal(serialized.includes('PRIVATE'),false);
 assert.equal(registry.find('following').features.good,true);assert.equal(registry.find('following').queryId,'safe');
 record.lastHttpStatus=404;const failed=new EndpointRegistry(storage({Following:record}));await failed.load();assert.equal(failed.find('following').queryId,baseline.queryId);
});
