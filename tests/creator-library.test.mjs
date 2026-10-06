import {test} from 'node:test';
import assert from 'node:assert/strict';
import {updateCreatorLibrary,validateCreatorLibrary} from '../src/background/creator-library.js';
import {emptyAccount,projectAccount} from '../src/background/domain.js';
import {validateBackup} from '../src/background/migrations.js';
import {createServices} from '../src/background/services.js';
const post={id:'2103644866299482568',author:'password1688',text:'Test <script> text',postedAt:'2026-09-26T00:36:34Z',url:'javascript:alert(1)'};
test('collecting a post as material and to reply deduplicates without losing its notes',()=>{
  const s=emptyAccount('1');updateCreatorLibrary(s,{command:'save',kind:'material',post},10);
  updateCreatorLibrary(s,{command:'note',postId:post.id,note:'My idea'},11);
  updateCreatorLibrary(s,{command:'save',kind:'pending',post:{...post,text:'different'}},12);
  const p=s.creatorLibrary.posts[0];assert.equal(s.creatorLibrary.posts.length,1);assert.equal(p.material,true);assert.equal(p.replyStatus,'pending');assert.equal(p.note,'My idea');assert.equal(p.text,post.text);assert.equal(p.url,'https://x.com/password1688/status/'+post.id);
});
test('reply statuses are manual and changes remain account isolated and included in backup',()=>{
  const a=emptyAccount('1'),b=emptyAccount('2');updateCreatorLibrary(a,{command:'save',kind:'pending',post});
  updateCreatorLibrary(a,{command:'status',postId:post.id,status:'done'});
  assert.equal(projectAccount(a).creatorLibrary.posts[0].replyStatus,'done');assert.equal(projectAccount(b).creatorLibrary.posts.length,0);
  const backup=validateBackup(a,'1');assert.equal(backup.creatorLibrary.posts[0].replyStatus,'done');
});
test('invalid author, spoofed identity, capacity and unsupported statuses are rejected',async()=>{
  const s=emptyAccount('1');assert.throws(()=>updateCreatorLibrary(s,{command:'save',kind:'material',post:{...post,author:'<script>'}}));
  updateCreatorLibrary(s,{command:'save',kind:'material',post});assert.throws(()=>updateCreatorLibrary(s,{command:'save',kind:'material',post:{...post,author:'other'}}));
  assert.throws(()=>updateCreatorLibrary(s,{command:'status',postId:post.id,status:'automatic'}));
  for(let i=1;i<300;i++)updateCreatorLibrary(s,{command:'save',kind:'pending',post:{...post,id:String(i)}});
  assert.throws(()=>updateCreatorLibrary(s,{command:'save',kind:'pending',post:{...post,id:'400'}}),/300/);
  const services=createServices({});await assert.rejects(services.CREATOR_LIBRARY({accountId:'2'},s,{accountId:'1',command:'remove',postId:post.id}),/账号/);
  updateCreatorLibrary(s,{command:'remove',postId:post.id});assert.equal(s.creatorLibrary.posts.length,299);
});
test('invalid creator library imports are rejected rather than executed',()=>{
  assert.throws(()=>validateCreatorLibrary({posts:[{...post,material:true,note:'',replyStatus:'unsafe'}]}));
  const s=emptyAccount('1');s.creatorLibrary={posts:'bad'};assert.throws(()=>validateBackup(s,'1'),/创作/);
});
