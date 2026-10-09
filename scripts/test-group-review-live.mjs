// Explicit live read-only check against the existing X chat tab. No credentials logged.
import {readGroupReviewInPage} from '../src/background/group-reviews.js';
import {WEB_BEARER} from '../src/background/web-client.js';
const groupId=process.argv[2];if(!/^g\d{1,30}$/.test(groupId||''))throw Error('Pass group ID');
const targets=await(await fetch('http://127.0.0.1:9223/json/list')).json();
const tab=targets.find(t=>t.type==='page'&&t.url.startsWith('https://x.com/i/chat/'+groupId));if(!tab)throw Error('Chat tab not found');
const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r,{once:true}));
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id===1){console.log(JSON.stringify(m.result?.result?.value||{error:m.error?.message||m.result?.exceptionDetails?.text}));ws.close();}});
ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{awaitPromise:true,returnByValue:true,expression:`(${readGroupReviewInPage.toString()})({origin:location.origin,groupId:${JSON.stringify(groupId)},accountId:decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('twid='))?.slice(5)||'').replace(/^u=/,'').replace(/"/g,''),authorization:${JSON.stringify(WEB_BEARER)}})`}}));
const timer=setTimeout(()=>ws.close(),30000);ws.addEventListener('close',()=>clearTimeout(timer));
