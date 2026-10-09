(() => {
  const api=globalThis.CircleMate; let busy=false,last=0,state=null,groupId='',mode='all',blueOnly=true,error='',enrichBusy=false,lastBatch=0,lastReferences='';
  let updateTimer=null,followRetryAt=0,followPaused=false,followNextAt=0,activeFollow=null,lastAccountId='';
  const observed=new WeakSet(), pendingFollows=new Set(), followOrder=[];let feedback=null;
  const style='.cm-roster-toolbar [hidden]{display:none!important}.cm-roster-toolbar{position:sticky;top:0;z-index:20;flex:none;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 16px 12px;margin-bottom:8px;background:var(--color-gray-0,#f7f9fa);border-bottom:0;font:13px system-ui}.cm-roster-toolbar button,.cm-roster-action{border:1px solid #cfd9de;border-radius:18px;padding:5px 12px;background:#fff;color:#25313a;font:600 12px system-ui;cursor:pointer;white-space:nowrap}.cm-roster-toolbar button[aria-pressed=true],.cm-roster-action[data-relation=unfollowed]{background:#16784c;color:#fff;border-color:#16784c}.cm-roster-action:disabled{opacity:.6;cursor:default}.cm-roster-hidden{display:none!important}.cm-roster-note{width:100%;line-height:1.5;font-size:11px;color:#63717c}.cm-roster-feedback{width:100%;font-size:12px;line-height:1.5;color:#16784c}.cm-roster-feedback[data-failed=true]{color:#b33c35}.cm-roster-action{margin-left:auto;flex:none}.cm-roster-blue{display:flex;align-items:center;gap:5px;padding:5px 9px;border-radius:18px;background:#eaf5fd;white-space:nowrap;cursor:pointer;color:#187ab8}.cm-roster-blue input{width:15px!important;height:15px!important;margin:0!important;accent-color:#16784c}.cm-roster-note[data-loading=true]::before{content:"";display:inline-block;width:7px;height:7px;margin-right:6px;border-radius:50%;background:#29935a;animation:cm-roster-pulse 1s infinite}@keyframes cm-roster-pulse{50%{opacity:.25}}@media(prefers-reduced-motion:reduce){.cm-roster-note[data-loading=true]::before{animation:none}}';
  function adopt(next){
    if(lastAccountId && next?.accountId!==lastAccountId){pendingFollows.clear();feedback=null;}
    state=api.rosterAcceptState(state,next);
    lastAccountId=state?.accountId||'';
    const q=state?.writeQueue||{};followOrder.splice(0,followOrder.length,...(q.jobs||[]).filter(j=>['queued','running','cooling'].includes(j.status)));
    followPaused=Boolean(q.paused);followNextAt=q.nextAt||0;activeFollow=followOrder.find(j=>j.status==='running')||null;
    followRetryAt=followOrder.find(j=>j.status==='cooling')?.retryAt||0;
  }
  function notify(text,failed=false){feedback={text,failed,until:Date.now()+10000};render();}
  const send=(action,extra={})=>chrome.runtime.sendMessage({action,groupId,...extra});
  function confirmUnfollow(root,displayName){
    return new Promise(resolve=>{
      api.applyDialogStyle?.(root);
      const dialog=document.createElement('dialog');dialog.className='cm-confirm-dialog';
      const title=document.createElement('h3');title.textContent='取关「'+displayName+'」？';
      const text=document.createElement('p');text.textContent='确认后将取消关注此账号。';
      const actions=document.createElement('div');actions.className='cm-confirm-actions';
      const finish=value=>{dialog.close();dialog.remove();resolve(value);};
      for(const [label,value] of [['取消',false],['确认取关',true]]){const button=document.createElement('button');button.type='button';button.textContent=label;if(value)button.className='confirm-primary';button.onclick=()=>finish(value);actions.append(button);}
      dialog.append(title,text,actions);dialog.oncancel=event=>{event.preventDefault();finish(false);};(root===document?document.body:root).append(dialog);dialog.showModal();
    });
  }
  function clear(){for(const root of api.rosterRoots()){api.rosterPrioritizeFollowBack(api.rosterRows(root),false);root.querySelectorAll('.cm-roster-hidden').forEach(e=>e.classList.remove('cm-roster-hidden'));root.querySelectorAll('.cm-roster-action,.cm-roster-toolbar,.cm-roster-time,.cm-roster-interaction').forEach(e=>e.remove());}state=null;groupId='';mode='all';blueOnly=true;lastReferences='';lastBatch=0;error='';feedback=null;}
  async function queueControl(command){try{const result=await send('QUEUE_CONTROL',{accountId:state?.accountId,command});if(result?.state)adopt(result.state);if(!result?.ok)notify(result?.error||'队列操作失败',true);render();}catch(e){notify(e.message,true);}}
  async function enrich(retryFailed=false){
    if(enrichBusy||state?.groups?.find(g=>g.id===groupId)?.retryAt>Date.now())return;
    const originGroup=groupId,originAccount=state?.accountId;
    const current=()=>groupId===originGroup&&state?.accountId===originAccount;
    enrichBusy=true;error='';render();
    try{
      const priorityUsernames=api.rosterRoots().flatMap(api.rosterListRows).filter(({row})=>{const r=row.getBoundingClientRect();return r.bottom>0&&r.top<innerHeight;}).map(r=>r.username);
      const result=await send('ROSTER_ENRICH',{accountId:originAccount,retryFailed,refreshUnknown:true,priorityUsernames});
      if(!current())return;
      if(result?.state)adopt(result.state);
      if(!result?.ok)throw Error(result?.error||'识别失败');
    }catch(e){if(current())error=e.message;}
    finally{enrichBusy=false;if(current())lastBatch=Date.now();render();}
  }
  function render(){
    for(const root of api.rosterRoots()){
      if(!observed.has(root)){new MutationObserver(records=>{if(records.every(r=>r.target.closest?.('.cm-roster-action,.cm-roster-toolbar,.cm-roster-time,.cm-roster-interaction') || r.type==='childList' && [...r.addedNodes,...r.removedNodes].length && [...r.addedNodes,...r.removedNodes].every(n=>n.nodeType===1&&n.matches?.('.cm-roster-action,.cm-roster-toolbar,.cm-roster-time,.cm-roster-interaction'))))return;if(updateTimer!==null)return;updateTimer=setTimeout(()=>{updateTimer=null;void update();},250);}).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['href','aria-label']});observed.add(root);}
      const scope=api.rosterListScope(root),rows=api.rosterListRows(root),allowed=new Set(rows.map(r=>r.row));
      for(const {row} of api.rosterRows(root))if(!allowed.has(row)){row.classList.remove('cm-roster-hidden');row.querySelectorAll('.cm-roster-action,.cm-roster-interaction,.cm-roster-time').forEach(e=>e.remove());}
      const oldBar=root.querySelector('.cm-roster-toolbar');if(oldBar&&(!scope||!scope.contains(oldBar)))oldBar.remove();
      if(!rows.length)continue;
      if(!root.querySelector('[data-cm-roster-style]')){const sheet=document.createElement('style');sheet.dataset.cmRosterStyle='1';sheet.textContent=style;(root===document?document.head:root).append(sheet);}
      let bar=root.querySelector('.cm-roster-toolbar');if(!bar){bar=document.createElement('div');bar.className='cm-roster-toolbar';bar.setAttribute('aria-label','CircleMate 成员筛选');
        for(const [value,label] of [['all','全部'],['unfollowed','未关注'],['unmatched','未回关'],['interacted','互动'],['unavailable','异常']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.mode=value;b.onclick=()=>{mode=value;render();};bar.append(b);}
        const blueLabel=document.createElement('label');blueLabel.className='cm-roster-blue';const blueCheck=document.createElement('input');blueCheck.type='checkbox';blueCheck.setAttribute('aria-label','蓝V');blueCheck.dataset.blue='1';blueCheck.onchange=()=>{blueOnly=blueCheck.checked;render();};blueLabel.append(blueCheck,document.createTextNode('蓝V'));bar.append(blueLabel);
        const next=document.createElement('button');next.type='button';next.textContent='识别下一批';next.dataset.enrich='1';next.onclick=()=>void enrich(true);bar.append(next);
        const sync=document.createElement('button');sync.type='button';sync.textContent='同步互动';sync.dataset.interactions='1';sync.onclick=async()=>{const accountId=state?.accountId,originGroup=groupId;sync.disabled=true;try{const result=await send('ROSTER_INTERACTIONS',{accountId});if(state?.accountId===accountId&&groupId===originGroup){if(result?.state)adopt(result.state);if(!result?.ok)notify(result?.error||'互动同步失败',true);render();}}catch(e){notify(e.message,true);}finally{sync.disabled=false;}};bar.append(sync);
        const pause=document.createElement('button');pause.type='button';pause.dataset.queuePause='1';pause.onclick=()=>void queueControl(followPaused?'resume':'pause');bar.append(pause);
        const cancel=document.createElement('button');cancel.type='button';cancel.dataset.queueCancel='1';cancel.textContent='取消执行';cancel.onclick=()=>{
          void queueControl('cancel');
        };bar.append(cancel);
        const feedbackNode=document.createElement('span');feedbackNode.className='cm-roster-feedback';feedbackNode.hidden=true;bar.append(feedbackNode);
        const note=document.createElement('span');note.className='cm-roster-note';note.setAttribute('role','status');bar.append(note);
        const search=[...scope.querySelectorAll('input')].find(e=>/^(搜索参与者|搜索成员|search participants|search members)$/i.test(e.getAttribute('placeholder')||''));
        let branch=search;while(branch?.parentElement && branch.parentElement!==scope)branch=branch.parentElement;
        if(branch && (branch.parentElement===scope || branch.parentNode===scope))branch.before(bar);else scope.prepend(bar);
      }
      const group=state?.groups?.find(g=>g.id===groupId);
      const interactions=state?.memberInteractions;
      const interactionSync=bar.querySelector('[data-interactions]');interactionSync.disabled=interactions?.status==='syncing'||interactions?.retryAt>Date.now();interactionSync.title=interactions?.error||'按账号同步通知，与群成员在本地匹配';
      let interactionNote=bar.querySelector('.cm-roster-interaction-note');if(!interactionNote){interactionNote=document.createElement('span');interactionNote.className='cm-roster-note cm-roster-interaction-note';bar.append(interactionNote);}
      const interactionStatus=interactions?.retryAt>Date.now()?`冷却 ${Math.ceil((interactions.retryAt-Date.now())/1000)} 秒`:interactions?.status==='syncing'?'同步中':interactions?.status==='pending'?'等待续传':interactions?.error?'同步失败':'已缓存';
      interactionNote.textContent=interactions?.updatedAt?`互动${interactionStatus} · 部分通知记录 · 更新于 ${new Date(interactions.updatedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}`:`互动${interactionStatus} · 尚未采集记录`;
      if(interactions?.error)interactionNote.textContent+=' · '+interactions.error;
      interactionNote.title=interactions?.error||'显示对方点赞或评论你的已采集记录，不代表完整历史；点赞时间为通知时间。';
      const lastFailure=state?.writeQueue?.jobs?.filter(j=>j.groupId===groupId&&j.error&&['failed','unconfirmed'].includes(j.status)).at(-1);
      if(lastFailure && Date.now()-lastFailure.updatedAt<10000)feedback={text:'@'+lastFailure.username+'：'+lastFailure.error.message,failed:true,until:lastFailure.updatedAt+10000};
      const users=api.rosterCachedUsers(state,group);let pending=0,unknown=0,remaining=0,failed=0,matched=0,unmatched=0,selfCount=0;
      api.rosterPrioritizeFollowBack(rows,mode==='unfollowed',({row,username})=>{
        const member=api.rosterMember(api.rosterCachedMember(users,state,username),row,username,state?.account);
        return api.rosterRelation(member,state?.accountId)==='unfollowed'&&member?.followedBy===true;
      });
      for(const {row,menu,username} of rows){const user=api.rosterMember(api.rosterCachedMember(users,state,username),row,username,{...state?.account,username:state?.account?.username||api.viewerUsername?.(),id:state?.accountId}),relation=api.rosterRelation(user,state?.accountId);if(relation==='self'){selfCount++;row.classList.add('cm-roster-hidden');row.querySelector('.cm-roster-action')?.remove();continue;}if(relation==='unfollowed')pending++;if(relation==='unknown'){unknown++;if(group?.failedReferences?.[username])failed++;else remaining++;}
        if(api.rosterMatches(user,state?.accountId,'unmatched'))unmatched++;
        // An unavailable result can arrive before the background checkpoint is
        // reflected in the roster projection. Keep the local terminal state
        // authoritative for this render, and show it only in the 异常 filter.
        const unavailable=user?.availability==='unavailable';
        const matches=api.rosterMatches(user,state?.accountId,mode,blueOnly,state?.memberInteractions?.members?.[user?.id])||(mode==='unavailable'&&unavailable);if(matches)matched++;
        row.classList.toggle('cm-roster-hidden',!matches||(unavailable&&mode!=='unavailable'));
        let button=row.querySelector('.cm-roster-action');if(!button){button=document.createElement('button');button.type='button';button.className='cm-roster-action';if(menu)menu.before(button);else row.append(button);}
        button.dataset.relation=relation;button.textContent=unavailable?'账号不可用':({unfollowed:api.rosterFollowLabel(user),following:user?.followedBy===false?'未回关':user?.followedBy===true?'互关':'已关注',requested:'已请求',self:'自己',unknown:'待识别'})[relation];if(relation==='unknown'&&(!state||enrichBusy)&&!error)button.textContent='识别中…';if(user&&pendingFollows.has(username))button.textContent='提交中…';button.disabled=relation!=='unfollowed'||Boolean(user&&pendingFollows.has(username))||unavailable;
        const showInteraction=mode==='all'||mode==='interacted';
        let interaction=row.querySelector('.cm-roster-interaction');if(showInteraction&&!interaction){interaction=document.createElement('span');interaction.className='cm-roster-interaction';interaction.style.cssText='font:11px system-ui;color:#63717c;margin-left:auto;margin-right:8px;white-space:nowrap';button.before(interaction);}
        const metrics=interactions?.members?.[user?.id];
        if(interaction){interaction.hidden=!showInteraction;interaction.textContent=metrics?[metrics.likes?`点赞 ${metrics.likes}`:'',metrics.replies?`评论 ${metrics.replies}`:''].filter(Boolean).join(' · '):'暂无记录';interaction.title='对方与你的已采集互动；未匹配到记录不等于没有互动。';}
        button.style.marginLeft=showInteraction?'0':'auto';
        if(button.getAttribute('aria-label')!==button.textContent+' @'+username)button.setAttribute('aria-label',button.textContent+' @'+username);
        const queuedFollow=api.rosterQueuedFollow(followOrder,username,state?.accountId,followRetryAt,Date.now(),followPaused&&activeFollow?.username!==username);
        if(queuedFollow){button.textContent=queuedFollow.label;if(activeFollow?.username===username)button.textContent=activeFollow.action==='UNFOLLOW'?'取关中…':'关注中…';else if(!followPaused&&followRetryAt<=Date.now())button.textContent='排队中…';button.disabled=true;button.dataset.relation='queued';button.title='操作队列第 '+queuedFollow.position+' 位';button.setAttribute('aria-label',button.textContent+' @'+username);}
        else{button.removeAttribute('title');}
        if(unavailable){button.textContent='账号不可用';button.disabled=true;button.setAttribute('aria-label','账号不可用 @'+username);}
        const uncertain=state?.writeQueue?.jobs?.some(j=>j.username===username&&j.status==='unconfirmed');
        if(unavailable || uncertain){
          button.textContent=unavailable?'核实异常':'核实结果';button.disabled=pendingFollows.has(username);button.title=unavailable?'X 已确认账号不可用，点击重新核实':'上次操作结果未确认，只查询资料，不重发关注';
          button.onclick=async event=>{event.preventDefault();event.stopPropagation();if(!event.isTrusted||button.disabled)return;const accountId=state?.accountId,originGroup=groupId;pendingFollows.add(username);render();try{const result=await send('ROSTER_RECHECK',{accountId,username});if(state?.accountId===accountId&&groupId===originGroup){if(result?.state)adopt(result.state);if(!result?.ok)notify('@'+username+'：'+result.error,true);}}catch(e){notify(e.message,true);}finally{pendingFollows.delete(username);render();}};
          continue;
        }
        let time=row.querySelector('.cm-roster-time');
        if(relation==='following'){
          if(!time){time=document.createElement('span');time.className='cm-roster-time';time.style.cssText='font:11px system-ui;color:#63717c;margin-right:8px;white-space:nowrap';button.before(time);}
          const timing=api.rosterFollowTime(user);time.textContent=timing.label;time.title=timing.title;
          time.style.marginLeft=showInteraction?'0':'auto';
          button.style.marginLeft='0';
          if(mode==='all'||mode==='interacted'){
            if(!queuedFollow){button.textContent='已关注';button.title='已关注';button.disabled=true;button.setAttribute('aria-label','已关注 @'+username);}
            button.onclick=null;
            continue;
          }
          if(!queuedFollow){button.textContent=state?.capabilities?.unfollow?'取关':'资料取关';button.title=state?.capabilities?.unfollow?'取消关注':'在 X 原生资料页取消关注';button.disabled=false;button.setAttribute('aria-label',button.textContent+' @'+username);}
          button.onclick=async event=>{
            event.preventDefault();event.stopPropagation();if(!event.isTrusted||button.disabled)return;
            if(!state.capabilities?.unfollow){window.open('https://x.com/'+username,'_blank','noopener,noreferrer');return;}
            const originGroup=groupId,originAccount=state?.accountId;
            button.disabled=true;pendingFollows.add(username);
            const displayName=row.querySelector('a[href]')?.textContent?.trim() || user?.displayName || '此用户';
            if(!await confirmUnfollow(root,displayName)){pendingFollows.delete(username);render();return;}
            button.textContent='取关中…';
            try{const result=await chrome.runtime.sendMessage({action:'ROSTER_UNFOLLOW',groupId:originGroup,accountId:originAccount,userId:user.id,username});
              if(groupId!==originGroup||state?.accountId!==originAccount)return;
              if(result?.state)adopt(result.state);if(!result?.ok)throw Error(result?.error||'取关失败');
              notify('已加入取关队列 @'+username);
            }catch(e){if(groupId===originGroup)notify('@'+username+'：'+e.message,true);}
            finally{pendingFollows.delete(username);render();}
          };
          if(pendingFollows.has(username)){button.disabled=true;button.textContent='处理中…';}
          continue;
        }else{time?.remove();button.style.marginLeft='auto';}
        button.onclick=async event=>{event.preventDefault();event.stopPropagation();if(!event.isTrusted||button.disabled||pendingFollows.has(username))return;const originGroup=groupId,accountId=state?.accountId;pendingFollows.add(username);render();try{const result=await send('ROSTER_FOLLOW',{accountId,userId:user?.id,username});if(groupId===originGroup&&state?.accountId===accountId){if(result?.state)adopt(result.state);if(!result?.ok)notify('@'+username+'：'+(result?.error||'加入队列失败'),true);}}catch(e){notify(e.message,true);}finally{pendingFollows.delete(username);render();}};
      }
      bar.querySelectorAll('[data-mode]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.mode===mode));b.disabled=!state&&b.dataset.mode==='unfollowed';});
      bar.querySelector('[data-blue]').checked=mode!=='unavailable'&&blueOnly;
      bar.querySelector('[data-blue]').disabled=mode==='unavailable';
      const feedbackNode=bar.querySelector('.cm-roster-feedback');feedbackNode.hidden=!feedback||feedback.until<=Date.now();if(!feedbackNode.hidden){feedbackNode.textContent=feedback.text;feedbackNode.dataset.failed=String(feedback.failed);feedbackNode.setAttribute('role',feedback.failed?'alert':'status');}
      const waitingForCache=Boolean(state)&&!(state.relationships?.following?.cachedComplete||state.relationships?.following?.complete);
      const next=bar.querySelector('[data-enrich]');const automatic=!error&&(!state||enrichBusy||remaining>0);next.hidden=automatic||failed===0;next.disabled=enrichBusy||!groupId||group?.retryAt>Date.now();next.textContent='重试失败成员';
      const note=bar.querySelector('.cm-roster-note'),text=error||(!state ? `正在读取缓存 · 已加载 ${rows.length} 人` : `已加载 ${rows.length-selfCount} 人 · ${blueOnly?'蓝V · ':''}${({all:'全部',unfollowed:'未关注',unmatched:'未回关',interacted:'互动',mutual:'互关',unavailable:'异常'})[mode]} ${matched} 人${unknown?(waitingForCache?' · 关注名单尚未完整（已缓存 '+(state.relationships?.following?.users?.length||0)+' 人）':' · '+unknown+' 人关系待确认'):''}${enrichBusy?' · 识别中':''}`);
      note.dataset.loading=String(!(group?.retryAt>Date.now())&&!error&&(!state||enrichBusy||remaining>0));
      if(mode==='unavailable')bar.querySelector('.cm-roster-note').dataset.loading='false';
      const queued=followOrder.length;
      const pause=bar.querySelector('[data-queue-pause]'),cancel=bar.querySelector('[data-queue-cancel]');
      pause.hidden=cancel.hidden=queued===0;pause.textContent=followPaused?'恢复执行':'暂停执行';pause.setAttribute('aria-pressed',String(followPaused));
      cancel.disabled=queued===1&&Boolean(activeFollow?.cancelled);
      const queueState=followPaused?'已暂停':followRetryAt>Date.now()?'限流等待 '+Math.ceil((followRetryAt-Date.now())/1000)+' 秒':activeFollow?'正在关注':followNextAt>Date.now()?'间隔等待 '+Math.ceil((followNextAt-Date.now())/1000)+' 秒':'正在运行';
      const queueText=queued?` · 操作队列 ${queued} 人 · ${queueState}`:'';
      const displayText=mode==='unavailable'?`已加载 ${rows.length-selfCount} 人 · 异常 ${matched} 人`:text;
      if(note.textContent!==displayText+queueText)note.textContent=displayText+queueText;
    }
  }
  async function update(){
    // Mount placeholders before any background/session request, including newly loaded rows.
    if(['x.com','twitter.com'].includes(location.hostname)&&!/^\/i\/chat\//.test(location.pathname)){if(groupId)clear();return;}
    if(busy||Date.now()-last<1500)return;
    if(api.rosterRoots().some(root=>!observed.has(root)||api.rosterListRows(root).some(({row,menu})=>api.rosterNeedsAction(row,menu))))render();
    busy=true;last=Date.now();try{
      const context=await chrome.runtime.sendMessage({action:'FRAME_CONTEXT'});if(!context?.isInfo){clear();return;}
      const rows=api.rosterRoots().flatMap(api.rosterListRows);if(!rows.length){if(groupId)clear();return;}
      if(groupId&&groupId!==context.groupId)clear();groupId=context.groupId;
      const refs=[...new Set(rows.map(r=>r.username))].sort();
      const signature=groupId+':'+refs.join(',');
      if(signature!==lastReferences){
        if(!state){const cached=await send('ROSTER_STATE');if(cached?.ok){adopt(cached.state);render();}}
        const captured=await send('ROSTER_REFERENCES',{usernames:refs});if(!captured?.ok)throw Error(captured?.error||'成员采集失败');lastReferences=signature;
        if(captured.state)adopt(captured.state);
      }
      const result=await send('ROSTER_STATE');if(!result?.ok)throw Error(result?.error||'缓存读取失败');adopt(result.state);render();
      const group=state.groups?.find(g=>g.id===groupId),cachedUsers=api.rosterCachedUsers(state,group),known=new Set((group?.usernames||[]).filter(username=>api.rosterRelation(api.rosterCachedMember(cachedUsers,state,username),state.accountId)!=='unknown')); 
      const waitingForCache=!(state.relationships?.following?.cachedComplete||state.relationships?.following?.complete);
      if(!waitingForCache&&!(group?.retryAt>Date.now())&&group?.usernames?.some(u=>!known.has(u)&&!group.failedReferences?.[u])&&Date.now()-lastBatch>15000)void enrich();
    }catch(e){error=e.message;render();}finally{busy=false;}}
  chrome.storage?.onChanged?.addListener((changes,area)=>{const next=(changes['circlemate_view_'+state?.accountId]||changes.circlemate_local_v1)?.newValue;if(area==='local'&&Array.isArray(next?.groups)&&state?.accountId===next?.accountId&&groupId){adopt(next);render();}});
  setInterval(()=>void update(),3000);void update();
})();
