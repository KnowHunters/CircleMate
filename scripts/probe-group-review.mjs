// Read-only native request observation. Never saves headers, tokens or message bodies.
const targets=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const groupId=process.argv[2];
if(!/^g\d+$/.test(groupId||''))throw Error('Usage: node scripts/probe-group-review.mjs gGROUP_ID [--replay]');
const groupPath='/i/chat/'+groupId;
const page=targets.find(t=>t.type==='page'&&['https://x.com'+groupPath,'https://x.com'+groupPath+'/info'].includes(t.url));
if(!page)throw Error('Expected group detail tab is not open');
const ws=new WebSocket(page.webSocketDebuggerUrl),pending=new Map(),requests=new Map();let serial=0,reviewRequest=null;
await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
function send(method,params={},sessionId){return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});}
function summarize(value,path='',out=[]){
 if(!value||typeof value!=='object')return out;
 for(const [key,v] of Object.entries(value)){
  const p=path?path+'.'+key:key;
  if(/total_count|pending.*count|join.*count|is_admin|is_owner|can.*(invite|manage)|conversation_id|list_exhausted/.test(key)&&['number','string','boolean'].includes(typeof v))out.push({path:p,value:v});
  else if(Array.isArray(v)&&/user_ids_results/.test(key))out.push({path:p,length:v.length});
  else if(typeof v==='object')summarize(v,p,out);
 }
 return out;
}
ws.addEventListener('message',async event=>{
 const m=JSON.parse(event.data);
 if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p?.reject(Error(m.error.message));else p?.resolve(m.result);return;}
 try{
  if(m.method==='Target.attachedToTarget'){
   const sid=m.params.sessionId;
   await send('Network.enable',{},sid);
   await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true},sid);
   console.log(JSON.stringify({observing:m.params.targetInfo.type}));
  }
  const key=(m.sessionId||'page')+':'+m.params?.requestId;
  if(m.method==='Network.requestWillBeSent'){
   const r=m.params.request,u=new URL(r.url);
   if(!/GetGroupJoinRequestsQuery|GetInboxPage|GetInitialXChatPage|GetConversation/.test(u.pathname))return;
   const name=u.pathname.split('/').at(-1);
   let params;try{params=JSON.parse(r.postData||'{}');}catch{}
   const variables=params?.variables||JSON.parse(u.searchParams.get('variables')||'{}');
   if(variables.conversation_id&&variables.conversation_id!==groupId)return;
   if(name==='GetGroupJoinRequestsQuery')reviewRequest={url:r.url,headers:Object.fromEntries(Object.entries(r.headers).filter(([k])=>/^(authorization|x-csrf-token|x-twitter-auth-type|x-twitter-active-user|content-type)$/i.test(k)))};
   const record={origin:u.origin,path:u.pathname,method:r.method,variables,queryKeys:[...u.searchParams.keys()]};requests.set(key,record);
   console.log(JSON.stringify({request:record}));
  }
  if(m.method==='Network.responseReceived'&&requests.has(key))requests.get(key).status=m.params.response.status;
  if(m.method==='Network.loadingFinished'&&requests.has(key)){
   const record=requests.get(key);requests.delete(key);
   const raw=await send('Network.getResponseBody',{requestId:m.params.requestId},m.sessionId);
   const data=JSON.parse(raw.body);
   const shapes=[];function shape(v,p='',depth=0){if(!v||typeof v!=='object'||depth>8||shapes.length>100)return;for(const [k,item] of Object.entries(v)){if(/^\d+$/.test(k)&&k!=='0')continue;const path=p?p+'.'+k:k;shapes.push({path,type:Array.isArray(item)?'array':typeof item});shape(item,path,depth+1);}}
   shape(data);
   console.log(JSON.stringify({response:{origin:record.origin,path:record.path,status:record.status,fields:summarize(data),schema:shapes,errors:data.errors?.map(e=>({message:e.message,code:e.code}))}}));
  }
 }catch(e){console.log(JSON.stringify({probeError:e.message}));}
});
await send('Network.enable');
await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:false,flatten:true});
for(const target of targets.filter(t=>t.type==='shared_worker'&&t.url.startsWith('blob:https://x.com/'))){
 await send('Target.attachToTarget',{targetId:target.id,flatten:true});
}
console.log('READY: observe native group detail and invitation views');
let replayed=false;
const replayTimer=setInterval(async()=>{
 if(replayed||!reviewRequest||!process.argv.includes('--replay'))return;
 try{
  const location=await send('Runtime.evaluate',{expression:'location.pathname',returnByValue:true});
  if(location.result?.value!==groupPath)return;
  replayed=true;
  const expression=`(async()=>{const r=await fetch(${JSON.stringify(reviewRequest.url)},{method:'GET',credentials:'include',headers:${JSON.stringify(reviewRequest.headers)}});const d=await r.json();const p=d.data?.chat_by_conversation_id?.conversation?.get_group_join_requests;return {status:r.status,totalCount:p?.total_count,users:p?.user_ids_results?.length,listExhausted:p?.cursor?.list_exhausted,errors:d.errors?.map(e=>({message:e.message,code:e.code}))};})()`;
  const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  console.log(JSON.stringify({replay:result.result?.value||result.exceptionDetails?.text}));
 }catch(e){console.log(JSON.stringify({replayError:e.message}));}
},3000);
ws.addEventListener('close',()=>clearInterval(replayTimer));
setTimeout(()=>ws.close(),120000);
