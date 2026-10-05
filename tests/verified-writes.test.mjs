import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EndpointRegistry} from '../src/background/endpoint-registry.js';
import {XWebAdapter} from '../src/background/x-adapter.js';
test('native verified destroy configuration enables fresh installation and replays captured flags',async()=>{
 const registry=new EndpointRegistry({async get(){return{};}});await registry.load();
 assert.equal(registry.hasWriteEvidence('destroy'),true);
 const adapter=new XWebAdapter({registry});let request;
 adapter.legacy=(...args)=>{request=args;return {following:true};};
 await adapter.unfollow({},'1521124726596579328');
 assert.equal(request[1],'friendships/destroy');assert.equal(request[3],'POST');
 assert.equal(request[2].user_id,'1521124726596579328');
 assert.equal(request[2].include_ext_is_blue_verified,'1');assert.equal(request[2].skip_status,'1');
 assert.equal(Object.keys(request[2]).length,13);
});

test('POST network loss and unreadable success response are unconfirmed, never safe to replay',async()=>{
 for(const fetch of [async()=>{throw Error('network lost');},async()=>({ok:true,json:async()=>{throw Error('invalid json');}})]){
  const adapter=new XWebAdapter({fetch,sessions:{assertCurrent:async()=>{}},registry:{}});
  await assert.rejects(()=>adapter.request({origin:'https://x.com'},'/i/api/1.1/friendships/destroy.json',{user_id:'2'},'POST'),e=>e.code==='WRITE_UNCONFIRMED');
 }
});
