import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
import {recordConfirmedReply,replyActivity,replyDay} from '../src/background/reply-activity.js';
import {PostInteractions} from '../src/background/post-interactions.js';
import {createServices} from '../src/background/services.js';import {emptyAccount} from '../src/background/domain.js';
const at=Date.parse('2026-10-12T08:00:00Z'),day=replyDay(at);
test('confirmed replies update current counters without counting the same reply twice and use Beijing day',()=>{
 const state={tasks:{creator:{today:day,records:{'9':{id_str:'9',created_at:new Date(at).toISOString(),in_reply_to_status_id_str:'8'}},coverage:{replies:{complete:true}}}},creator:{today:day,replies:1}};
 recordConfirmedReply(state,'10','8',at);recordConfirmedReply(state,'10','8',at);assert.equal(state.creator.replies,2);
 assert.deepEqual(replyActivity(state,at).postIds,['8']);assert.equal(replyActivity(state,Date.parse('2026-10-12T16:00:00Z')).count,0);
 assert.deepEqual(replyActivity({},at).postIds,[]);
 const current={creator:{today:replyDay(at+86400000),replies:0}};recordConfirmedReply(current,'20','8',at,at+86400000);assert.equal(current.creator.replies,0);
});
test('only confirmed sends record activity, repeated token and native sync do not duplicate count',async()=>{
 const state=emptyAccount('1');const service=new PostInteractions({assertTimelineTarget:async()=>{},reply:async()=>({confirmed:true,replyId:'123'})},{now:()=>at});
 const message={timeline:true,accountId:'1',tweetId:'9',username:'test',token:'token-123456',text:'test'};
 await service.reply({accountId:'1'},message,state,async()=>{});await service.reply({accountId:'1'},message,state,async()=>{});
 assert.equal(replyActivity(state,at).count,1);assert.equal(state.creator.replies,1);
 const today=replyDay(Date.now());state.confirmedReplies['123'].at=Date.now();
 const services=createServices({checkpoint:async()=>{},adapter:{creatorPage:async(_s,kind)=>({complete:true,tweets:kind==='replies'?[{id_str:'123',created_at:new Date().toISOString(),in_reply_to_status_id_str:'9'}]:[]})}});
 await services.CREATOR({},state,{});assert.equal(state.creator.today,today);assert.equal(state.creator.replies,1);
 await services.CREATOR({},state,{restart:true});assert.equal(state.creator.replies,1);
 service.adapter.reply=async()=>({confirmed:false});await assert.rejects(service.reply({accountId:'1'},{...message,tweetId:'10',token:'other-token-123'},state,async()=>{}));assert.equal(Object.keys(state.confirmedReplies).length,1);
});
test('inline editor closes only on confirmation; unconfirmed replies retain the draft and stay open',async()=>{
 class Element{constructor(){this.children=[];this.value='';this.attrs={};}append(...items){this.children.push(...items);}setAttribute(k,v){this.attrs[k]=v;}addEventListener(){}focus(){}}
 const source=await readFile(new URL('../src/content/inline-reply.js',import.meta.url),'utf8');const window={};window.top=window;
 const context={window,document:{createElement:()=>new Element()},crypto:{randomUUID:()=> 'token-123456'}};vm.runInNewContext(source,context);
 let closed=0;
 const make=confirmed=>context.CircleMate.createInlineReply({accountId:'1',tweetId:'9',username:'test',onSend:async()=>({confirmed}),onClose:()=>closed++});
 for(const confirmed of [false,true]){const view=make(confirmed),form=view.element,input=form.children[0].children[0];input.value='draft';form.children[2].children[1].disabled=false;await form.onsubmit({isTrusted:true,preventDefault(){}});assert.equal(input.value,confirmed?'':'draft');}
 assert.equal(closed,1);
});
