import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AccountRepository} from '../src/background/repository.js';
import {emptyAccount,upsertUser} from '../src/background/domain.js';
import {validateBackup} from '../src/background/migrations.js';
test('failed storage save leaves the prior account readable and a later save writes changed shards',async()=>{
 const values={};let fail=false;
 const storage={get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(values[k])])),set:async data=>{if(fail)throw Error('quota');Object.assign(values,structuredClone(data));}};
 const repo=new AccountRepository(storage),state=emptyAccount('1');upsertUser(state,{id:'2',username:'member',following:false},'profile');await repo.save(state);
 upsertUser(state,{id:'2',username:'member',following:true},'follow-write');fail=true;
 await assert.rejects(()=>repo.save(state),e=>e.code==='STORAGE_WRITE_FAILED');assert.equal((await repo.load('1')).users['2'].following,false);
 fail=false;await repo.save(state);assert.equal((await repo.load('1')).users['2'].following,true);
});
test('restore rejects malformed group references and queue states before writing data',()=>{
 const state=emptyAccount('1');state.groups.g1={userIds:['invalid']};assert.throws(()=>validateBackup(state,'1'),/群数据/);
 state.groups={};state.writeQueue={jobs:[{accountId:'1',action:'FOLLOW',username:'member',status:'bogus'}]};assert.throws(()=>validateBackup(state,'1'),/队列/);
});
