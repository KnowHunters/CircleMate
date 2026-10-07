(() => {
  'use strict';
  if(window!==window.top)return;
  const api=globalThis.CircleMate ||= {},observed=new WeakSet();
  let panel=null,generation=0,owner='',timer=null,resizePanel=null;
  const css=`.cm-post-trigger{margin-top:10px;width:100%;border:1px solid #cfd9de;border-radius:16px;background:transparent;color:inherit;padding:7px 12px;font:600 12px system-ui;cursor:pointer}.cm-post-panel{inset:auto;margin:0;position:fixed;z-index:2147483600;box-sizing:border-box;width:360px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;border:1px solid #cfd9de;border-radius:16px;background:#fff;color:#0f1419;padding:14px;box-shadow:0 8px 32px #0002;font:13px system-ui}.cm-post-head{display:flex;align-items:center;gap:10px;position:sticky;top:-14px;background:inherit;padding:8px 0;z-index:1}.cm-post-head strong{flex:1}.cm-post-panel button{font:inherit;cursor:pointer;color:inherit;border:0;background:transparent;border-radius:50%;padding:6px;display:inline-flex;align-items:center;gap:5px}.cm-post-panel button:hover{background:#1d9bf012;color:#1d9bf0}.cm-post-panel button:disabled{color:#657786;cursor:default;opacity:.7}.cm-post-panel svg{width:18px;height:18px;fill:currentColor}.cm-post-entry{padding:12px 0;border-top:1px solid #cfd9de55}.cm-post-text{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin:7px 0;max-height:180px;overflow:auto}.cm-post-date,.cm-post-status{font-size:11px;color:#657786;line-height:1.5}.cm-post-actions{display:flex;align-items:center;gap:18px}.cm-post-actions a{margin-left:auto;color:#657786;text-decoration:none;font-size:11px}.cm-post-panel button[data-liked=true]{color:#f91880}.cm-post-status[data-error=true]{color:#d64545}.cm-post-entry small{display:block;color:#657786;font-size:11px}`;
  const paths={heart:'M16.7 3c-1.9 0-3.5.9-4.7 2.4C10.8 3.9 9.2 3 7.3 3 4.4 3 2 5.4 2 8.3c0 4.4 5.4 9.1 10 12.7 4.6-3.6 10-8.3 10-12.7C22 5.4 19.6 3 16.7 3zm-4.7 15.5c-4.6-3.7-8-7.2-8-10.2C4 6.5 5.5 5 7.3 5c1.6 0 3 1.1 3.8 2.6l.9 1.6.9-1.6C13.7 6.1 15.1 5 16.7 5 18.5 5 20 6.5 20 8.3c0 3-3.4 6.5-8 10.2z',reply:'M12 2a10 10 0 0 0-7 17.1L3 22l5.2-1.9A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-3.6 15.1l-.4-.2-1.5.5.6-1.1-.6-.5A8 8 0 0 1 12 4z',refresh:'M19 7V2l-2 2a9 9 0 1 0 3.5 9h-2A7 7 0 1 1 15.5 5L13 7h6z',close:'M6 4.6 12 10.6l6-6 1.4 1.4-6 6 6 6-1.4 1.4-6-6-6 6L4.6 18l6-6-6-6z'};
  function style(root){if(root.querySelector('[data-cm-post-style]'))return;const s=document.createElement('style');s.dataset.cmPostStyle='1';s.textContent=css;(root===document?document.head:root).append(s);}
  function account(){try{const raw=document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('twid='))?.slice(5);return decodeURIComponent(raw||'').replace(/^u=/,'').replace(/"/g,'');}catch{return '';}}
  function group(){return location.pathname.match(/^\/i\/chat\/(g\d+)\/info\/?$/)?.[1]||'';}
  function close(){generation++;panel?.remove();panel=null;owner='';resizePanel=null;}
  function icon(name,label){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]);svg.append(p);b.append(svg);return b;}
  function profileName(card){for(const a of card.querySelectorAll('a[href]')){try{const url=new URL(a.href,location.origin);const match=url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i);if(url.origin===location.origin&&match)return match[1].toLowerCase();}catch{}}return '';}
  function open(card,username){
    close();const accountId=account(),groupId=group();if(!/^\d{1,30}$/.test(accountId)||!groupId)return;
    owner=accountId;const token=generation;style(document);
    panel=document.createElement('section');panel.className='cm-post-panel';panel.setAttribute('popover','manual');panel.setAttribute('role','dialog');panel.setAttribute('aria-label',`@${username} 最近帖子`);panel.tabIndex=-1;
    const paint=getComputedStyle(card.querySelector('[data-base-ui-focusable]')||card);panel.style.background=paint.backgroundColor;panel.style.color=paint.color;
    const rect=card.getBoundingClientRect();const x=rect.right+10+360<innerWidth?rect.right+10:Math.max(12,rect.left-370);panel.style.left=x+'px';panel.style.top=Math.min(Math.max(12,rect.top),Math.max(12,innerHeight-500))+'px';
    const head=document.createElement('div');head.className='cm-post-head';const title=document.createElement('strong');title.textContent=`@${username} · 最近帖子`;
    const refresh=icon('refresh','刷新最近帖子'),exit=icon('close','关闭最近帖子');exit.onclick=close;head.append(title,refresh,exit);
    const status=document.createElement('p');status.className='cm-post-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const list=document.createElement('div');panel.append(head,status,list);const surface=card.getRootNode();style(surface);const container=[...surface.querySelectorAll('[role=dialog][data-open]')].at(-1)||document.body;container.append(panel);panel.showPopover();panel.focus();
    function fit(){if(!panel||generation!==token)return;const box=panel.getBoundingClientRect();const left=rect.right+10+box.width<innerWidth?rect.right+10:Math.min(rect.left-box.width-10,innerWidth-box.width-12);panel.style.left=Math.max(12,left)+'px';panel.style.top=Math.max(12,Math.min(rect.top,innerHeight-box.height-12))+'px';}
    resizePanel=fit;
    const valid=()=>panel&&panel.isConnected&&generation===token&&account()===accountId&&group()===groupId;
    const notify=(text,error=false)=>{if(valid()){status.textContent=text;status.dataset.error=String(error);}};
    const send=extra=>chrome.runtime.sendMessage({groupId,accountId,username,...extra});
    function render(data){if(!valid())return;list.replaceChildren();if(!data.posts.length){notify('暂无可读取的公开帖子');return;}notify('最近 3 条原创 · '+new Date(data.at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+' 更新');
      for(const post of data.posts.slice(0,3)){
        const row=document.createElement('article');row.className='cm-post-entry';const time=document.createElement('time');time.className='cm-post-date';time.dateTime=new Date(post.createdAt).toISOString();time.title=new Date(post.createdAt).toLocaleString();time.textContent=new Date(post.createdAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
        const text=document.createElement('p');text.className='cm-post-text';text.textContent=post.text||'此帖包含媒体或文章，请查看原帖';
        row.append(time,text);if(post.hasMedia){const hint=document.createElement('small');hint.textContent='含图片或视频';row.append(hint);}
        const actions=document.createElement('div');actions.className='cm-post-actions';const like=icon('heart',post.liked?'取消点赞':'点赞'),reply=icon('reply','回复');
        const likes=document.createElement('span');likes.textContent=post.likes==null?'—':String(post.likes);like.append(likes);like.dataset.liked=String(post.liked===true);like.disabled=post.liked==null||post.limited||post.unconfirmed;
        if(post.unconfirmed)like.title='上次结果未确认，请刷新核验';
        const replies=document.createElement('span');replies.textContent=post.replies==null?'—':String(post.replies);reply.append(replies);
        like.onclick=async event=>{if(!event.isTrusted||!valid())return;like.disabled=true;refresh.disabled=true;notify('正在核验点赞状态…');try{const result=await send({action:'POSTS_LIKE',tweetId:post.id,liked:!post.liked});if(!result?.ok)throw new Error(result?.error||'点赞失败');render(result);}catch(e){notify(e.message,true);}finally{if(valid())refresh.disabled=false;}};
        reply.onclick=event=>{if(!event.isTrusted||!valid())return;const url=new URL('/intent/post',location.origin);url.searchParams.set('in_reply_to',post.id);const popup=window.open(url.href,'_blank',`popup,width=650,height=760,left=${Math.max(0,screenX+(outerWidth-650)/2)},top=${Math.max(0,screenY+(outerHeight-760)/2)}`);if(popup){popup.opener=null;notify('已打开 X 原生回复框');}else notify('回复窗口被浏览器阻止，请允许此站点弹出窗口',true);};
        const original=document.createElement('a');original.href=post.url;original.textContent='原帖 ↗';original.target='_blank';original.rel='noopener noreferrer';actions.append(reply,like,original);row.append(actions);list.append(row);
      }
      fit();
    }
    async function load(force=false){if(!valid())return;refresh.disabled=true;notify(force?'正在刷新…':'正在读取最近帖子…');try{const result=await send({action:'POSTS_READ',refresh:force});if(!result?.ok)throw new Error(result?.error||'读取失败');render(result);}catch(e){notify(e.message,true);}finally{if(valid())refresh.disabled=false;}}
    refresh.onclick=()=>void load(true);void load();
  }
  function scan(){
    if(!group()){close();return;}if(panel&&(!panel.isConnected||account()!==owner))close();
    for(const root of api.rosterRoots?.()||[document]){
      if(root===document)continue;
      if(!observed.has(root)){observed.add(root);new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['data-open']});}
      for(const card of root.querySelectorAll('[role="presentation"][data-open][data-side]')){
        if(!card.querySelector('[data-base-ui-focusable]'))continue;const username=profileName(card),existing=card.querySelector('.cm-post-trigger');if(!username){existing?.remove();continue;}if(existing)continue;
        style(root);const b=document.createElement('button');b.type='button';b.className='cm-post-trigger';b.textContent='最近帖子';b.onclick=e=>{e.preventDefault();e.stopPropagation();const current=profileName(card);if(e.isTrusted&&current)open(card,current);};card.querySelector('[data-base-ui-focusable]').append(b);
      }
    }
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(scan,100);}
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
  setInterval(scan,1000);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&panel&&(panel.contains(panel.getRootNode().activeElement||document.activeElement)||document.activeElement===document.body)){e.preventDefault();close();}});
  window.addEventListener('resize',()=>resizePanel?.(),{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&panel&&account()!==owner)close();});scan();
})();
