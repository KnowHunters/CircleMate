import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../src/shared/roster.js',import.meta.url),'utf8');
test('follow-back labels require confirmed follower relation and priority restores native styles',()=>{
 const context={};vm.runInNewContext(source,context);const api=context.CircleMate;
 assert.equal(api.rosterFollowLabel({followedBy:true}),'回关');
 for(const followedBy of [false,null,undefined])assert.equal(api.rosterFollowLabel({followedBy}),'关注');
 const parent={style:{display:'block',flexDirection:'',},children:[]};
 const normal={parentElement:parent,style:{order:''}},back={parentElement:parent,style:{order:'3'}};
 parent.children=[normal,back];const rows=[{row:normal,back:false},{row:back,back:true}];
 api.rosterPrioritizeFollowBack(rows,true,e=>e.back);
 assert.equal(back.style.order,'0');assert.equal(normal.style.order,'1');assert.equal(parent.style.flexDirection,'column');
 assert.deepEqual(parent.children,[normal,back]);
 api.rosterPrioritizeFollowBack(rows,false);
 assert.equal(parent.style.display,'block');assert.equal(parent.style.flexDirection,'');assert.equal(back.style.order,'3');assert.equal(normal.style.order,'');
 parent.children.push({});api.rosterPrioritizeFollowBack(rows,true,e=>e.back);
 assert.equal(parent.style.display,'block');
});
test('interaction filter honors known events, blue filter and excludes self or unavailable members',()=>{
 const context={document:{querySelectorAll:()=>[]}};vm.runInNewContext(source,context);
 const match=context.CircleMate.rosterMatches,user={id:'2',following:true,blueVerified:true};
 assert.equal(match(user,'1','interacted',true,{likes:1,replies:0}),true);
 assert.equal(match(user,'1','interacted',true,{likes:0,replies:1}),true);
 assert.equal(match(user,'1','interacted',true,null),false);
 assert.equal(match({...user,blueVerified:false},'1','interacted',true,{likes:1}),false);
 assert.equal(match({...user,availability:'unavailable'},'1','interacted',false,{likes:1}),false);
 assert.equal(match(user,'2','interacted',false,{likes:1}),false);
});

test('native chat shadow attached after initial discovery is found without a full rescan',()=>{
 let scans=0;const host={nodeType:1,shadowRoot:null,querySelectorAll:()=>[]};
 const document={querySelectorAll:selector=>{if(selector==='*'){scans++;return[host];}return[host];}};
 const context={document};vm.createContext(context);vm.runInContext(source,context);
 assert.equal(context.CircleMate.rosterRoots().length,1);
 const shadow={host,querySelectorAll:()=>[]};host.shadowRoot=shadow;host.isConnected=true;
 assert.ok(context.CircleMate.rosterRoots().includes(shadow));
 assert.equal(scans,1);
 host.isConnected=false;host.shadowRoot=null;assert.equal(context.CircleMate.rosterRoots().length,1);
});
test('follow delays stay between three and seven seconds and paused jobs remain identified',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 assert.equal(api.rosterFollowDelay(()=>0),3000);assert.equal(api.rosterFollowDelay(()=>1),7000);assert.equal(api.rosterFollowDelay(()=>0.5),5000);
 assert.equal(api.rosterQueuedFollow([{username:'alice',accountId:'1'}],'alice','1',10000,1,true).label,'已暂停');
});
test('follow age uses confirmed writes rather than snapshot timestamps',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const time=context.CircleMate.rosterFollowTime;
 const now=Date.parse('2026-10-04T12:00:00+08:00');
 assert.equal(time({following:true,followedAt:now},now).label,'今天关注');
 assert.equal(time({following:true,followedAt:Date.parse('2026-10-03T23:00:00+08:00')},now).label,'昨天关注');
 assert.equal(time({following:true,fieldSources:{following:{source:'following',observedAt:now}}},now).label,'关注时间未知');
 assert.equal(time({following:true,fieldSources:{following:{source:'follow-write',observedAt:now}}},now).label,'今天关注');
});
test('reopened rows restore active, queued and cooling follow labels from the queue',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);
 const lookup=context.CircleMate.rosterQueuedFollow;
 const queue=[{accountId:'1',username:'Alice'},{accountId:'1',username:'bob'}];
 assert.equal(lookup(queue,'alice','1',0,100).label,'关注中…');
 assert.equal(lookup(queue,'BOB','1',0,100).label,'排队中…');
 assert.equal(lookup(queue,'bob','1',200,100).label,'等待冷却…');
 assert.equal(lookup(queue,'bob','2',200,100),null);
 assert.equal(lookup(queue,'other','1',200,100),null);
 queue.shift();assert.equal(lookup(queue,'bob','1',0,100).label,'关注中…');
});
test('unavailable filter includes confirmed exceptions even without blue verification',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);
 const user={username:'member',availability:'unavailable',following:false,blueVerified:false};
 assert.equal(context.CircleMate.rosterMatches(user,'1','unavailable',true),true);
 assert.equal(context.CircleMate.rosterMatches(user,'1','unfollowed',false),false);
});
test('member collector enters nested open shadow roots and ignores ordinary message anchors',()=>{
 const anchor={tagName:'A',getAttribute:()=> 'https://x.com/Alice'};const row={children:[anchor]};const menu={parentElement:row,getAttribute:()=> '更多 Alice 的选项'};
 const inner={querySelectorAll:s=>s==='*'?[]:[menu]};const shadow={querySelectorAll:s=>s==='*'?[{shadowRoot:inner}]:[]};const doc={querySelectorAll:s=>s==='*'?[{shadowRoot:shadow}]:[]};
 const context={document:doc,URL};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 assert.equal(api.rosterRoots().length,3);assert.equal(api.rosterRows(inner)[0].username,'alice');
 assert.equal(api.rosterRows({querySelectorAll:()=>[{...menu,getAttribute:()=> '更多'}]}).length,0);
 anchor.getAttribute=()=> 'https://example.com/Alice';assert.equal(api.rosterRows(inner).length,0);
});
test('unknown relations never qualify as unfollowed; requested and own accounts are excluded',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const classify=context.CircleMate.rosterRelation;
 assert.equal(classify(null,'1'),'unknown');assert.equal(classify({id:'2',following:null},'1'),'unknown');
 assert.equal(classify({id:'2',following:false},'1'),'unfollowed');assert.equal(classify({id:'2',following:true},'1'),'following');
 assert.equal(classify({id:'2',following:false,followRequested:true},'1'),'requested');assert.equal(classify({id:'1',following:false},'1'),'self');
});

test('full member list scope requires participant search and excludes the information preview',()=>{
 const context={URL};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 assert.equal(api.rosterListScope({querySelectorAll:()=>[]}),null);
 const row={children:[{tagName:'A',getAttribute:()=> 'https://x.com/alice'}]};const menu={parentElement:row,getAttribute:()=> '更多 Alice 的选项'};
 const list={querySelectorAll:()=>[menu],parentElement:null};const input={getAttribute:()=> '搜索参与者',parentElement:list};
 assert.equal(api.rosterListScope({querySelectorAll:()=>[input]}),list);
 assert.equal(api.rosterListRows({querySelectorAll:()=>[input]})[0].username,'alice');
});

test('not-back and mutual filters compose with blue checks and exclude pending or own relationships',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const matches=context.CircleMate.rosterMatches;
 const user={id:'2',following:true,followedBy:false,blueVerified:true};
 assert.equal(matches(user,'1','unmatched',true),true);
 assert.equal(matches({...user,followedBy:null},'1','unmatched'),false);
 assert.equal(matches({...user,followRequested:true},'1','unmatched'),false);
 assert.equal(matches(user,'2','unmatched'),false);
 assert.equal(matches({...user,blueVerified:null},'1','unmatched',true),false);
 assert.equal(matches({...user,followedBy:true},'1','mutual',true),true);
});

test('native blue badges supplement missing cache without accepting gold verification',()=>{
 const context={getComputedStyle:icon=>({color:icon.color,fill:icon.color})};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 const icon={color:'rgb(29, 155, 240)',getAttribute:name=>name==='aria-label'?'Verified account':null};
 const row={querySelectorAll:()=>[icon]};
 let user=api.rosterMember({id:'2',following:false,blueVerified:null},row,'alice',{id:'1',username:'owner'});
 assert.equal(api.rosterMatches(user,'1','unfollowed',true),true);
 icon.color='rgb(232, 185, 49)'; user=api.rosterMember({id:'2',following:false},row,'alice',{id:'1',username:'owner'});
 assert.equal(api.rosterMatches(user,'1','unfollowed',true),false);
 assert.equal(api.rosterMatches({id:'1'},'1','all'),false);
 assert.equal(api.rosterMatches({},undefined,'all'),true);
 const self=api.rosterMember(null,row,'OWNER',{id:'1',username:'owner'});
 assert.equal(api.rosterMatches(self,'1','all'),false);
});

test('follow confirmation survives older asynchronous cache and rejects unconfirmed success',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 const confirmed={accountId:'1',updatedAt:20,groups:[{id:'g',users:[{username:'alice',following:true}]}]};
 const old={accountId:'1',updatedAt:10,groups:[{id:'g',users:[{username:'alice',following:false}]}]};
 assert.equal(api.rosterAcceptState(confirmed,old),confirmed);
 assert.equal(api.rosterFollowResult(confirmed,'g','alice').following,true);
 assert.throws(()=>api.rosterFollowResult(old,'g','alice'),/未确认/);
 assert.equal(api.rosterFollowResult({groups:[{id:'g',users:[{username:'alice',followRequested:true}]}]},'g','alice').followRequested,true);
 assert.equal(api.rosterAcceptState(confirmed,{...old,accountId:'2'}).accountId,'2');
});

test('complete cached lists classify username-only rows instantly during background refresh',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 const state={relationships:{following:{complete:false,cachedComplete:true,fetchedAt:10,users:[],cachedUsers:[{id:'2',username:'alice'}]},followers:{complete:true,fetchedAt:10,users:[{id:'3',username:'bob'}]}}};
 const users=api.rosterCachedUsers(state,null);
 assert.equal(api.rosterCachedMember(users,state,'alice').following,true);
 assert.equal(api.rosterCachedMember(users,state,'bob').following,false);
 assert.equal(api.rosterCachedMember(users,state,'bob').followedBy,true);
 assert.equal(api.rosterCachedMember(users,state,'newcomer').following,false);
 state.relationships.following.cachedComplete=false;state.relationships.following.cachedUsers=[];
 assert.equal(api.rosterCachedMember(api.rosterCachedUsers(state,null),state,'newcomer').following,undefined);
});

test('chat data-icon blue badge and menu-less own member row match the native DOM',()=>{
 const icon={getAttribute:n=>n==='data-icon'?'icon-verified':null};
 const anchor={tagName:'A',getAttribute:()=> 'https://x.com/knowhunters',querySelector:()=>({})};
 const row={children:[anchor],querySelectorAll:()=>[icon]};anchor.parentElement=row;
 const root={querySelectorAll:s=>s==='a[href]'?[anchor]:[]};
 const context={URL,getComputedStyle:()=>({fill:'rgb(30, 156, 241)',color:'rgb(15, 20, 26)'})};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 const collected=api.rosterRows(root);assert.equal(collected.length,1);assert.equal(collected[0].username,'knowhunters');assert.equal(collected[0].menu,null);
 assert.equal(api.rosterBlueVerified(row),true);
 const member=api.rosterMember({following:false},row,'knowhunters',{id:'1',username:'knowhunters'});
 assert.equal(api.rosterMatches(member,'1','unfollowed',true),false);
});

test('hidden menu-less own row never schedules repeated action insertion',()=>{
 const context={};vm.createContext(context);vm.runInContext(source,context);const api=context.CircleMate;
 const hiddenSelf={querySelector:()=>null};assert.equal(api.rosterNeedsAction(hiddenSelf,null),false);
 assert.equal(api.rosterNeedsAction(hiddenSelf,{}),true);
 assert.equal(api.rosterNeedsAction({querySelector:()=>({})},{}),false);
});
