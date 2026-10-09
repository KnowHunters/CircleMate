(() => {
 if(window!==window.top)return;
 const api=globalThis.CircleMate;let busy=false,accountId='',reviews={},timer=null;
 const selector='a[id^="dm-conversation-option-g"]';
 const css='.cm-group-review-name{display:flex;align-items:center;min-width:0}.cm-group-review-name>.font-chirp{min-width:0;flex:0 1 auto}.cm-group-review{display:inline-flex;align-items:center;flex:none;margin-left:8px;padding:2px 7px;border-radius:10px;font:600 11px system-ui;line-height:1.5;color:#1769aa;background:#e8f3fd;white-space:nowrap;cursor:pointer}.cm-group-review:focus-visible{outline:2px solid #1769aa;outline-offset:2px}.cm-group-review[data-stale=true]{color:#63717c;background:#edf0f2}';
 function viewerId(){try{return decodeURIComponent(document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith('twid='))?.slice(5)||'').replace(/^u=/,'').replace(/"/g,'');}catch{return '';}}
 function rows(){return api.rosterRoots().flatMap(root=>[...root.querySelectorAll(selector)].map(row=>({row,root,id:row.id.replace('dm-conversation-option-','')}))).filter(e=>/^g\d{1,30}$/.test(e.id));}
 function removeBadge(row){const badge=row.querySelector('.cm-group-review');badge?.parentElement.classList.remove('cm-group-review-name');badge?.remove();}
 function clear(){for(const {row} of rows())removeBadge(row);reviews={};accountId='';}
 function render(){
  if(viewerId()!==accountId){clear();return;}
  for(const {row,root,id} of rows()){
   const record=reviews[id];let badge=row.querySelector('.cm-group-review');
   if(!Number.isSafeInteger(record?.count)||record.count<=0){removeBadge(row);continue;}
   if(!root.querySelector('[data-cm-group-review-style]')){const sheet=document.createElement('style');sheet.dataset.cmGroupReviewStyle='1';sheet.textContent=css;(root===document?document.head:root).append(sheet);}
   if(!badge){badge=document.createElement('span');badge.className='cm-group-review';badge.setAttribute('role','button');badge.tabIndex=0;
    const open=event=>{event.preventDefault();event.stopPropagation();if(!event.isTrusted||viewerId()!==accountId)return;location.assign('/i/chat/'+id+'/info');};
    badge.onclick=open;badge.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')open(event);};
    // Keep the native row and its timestamp untouched; native text is never replaced.
    const name=row.querySelector('.font-chirp.line-clamp-1');if(!name)continue;
    name.parentElement.classList.add('cm-group-review-name');name.after(badge);
   }
   const stale=record.status==='error'||Date.now()-(record.updatedAt||0)>120000;
   badge.dataset.stale=String(stale);badge.textContent='待审核 '+record.count+(stale?' · 缓存':'');
   badge.setAttribute('aria-label',badge.textContent+'，打开群详情审核');
   badge.title='入群申请待审核 '+record.count+' 人 · 更新于 '+new Date(record.updatedAt).toLocaleString('zh-CN')+(record.error?' · '+record.error:'')+' · 点击打开群详情';
  }
 }
 async function update(){
  if(busy||document.hidden)return;
  if(!/^\/i\/chat(?:\/|$)/.test(location.pathname)){clear();return;}
  const current=viewerId();if(!/^\d{1,30}$/.test(current)){clear();return;}
  if(current!==accountId){clear();accountId=current;}
  const ids=[...new Set(rows().filter(({row})=>{const rect=row.getBoundingClientRect();return rect.bottom>0&&rect.top<innerHeight;}).map(e=>e.id))].slice(0,20);
  if(!ids.length)return;busy=true;
  try{const result=await chrome.runtime.sendMessage({action:'GROUP_REVIEWS',groupIds:ids});if(viewerId()===current&&result?.ok&&result.accountId===current){accountId=current;reviews={...reviews,...result.reviews};render();}}
  catch{}finally{busy=false;}
 }
 const observed=new WeakSet();
 function observe(){for(const root of api.rosterRoots()){if(observed.has(root))continue;observed.add(root);new MutationObserver(records=>{
   if(records.every(record=>record.target.closest?.('.cm-group-review')||[...record.addedNodes,...record.removedNodes].every(node=>node.nodeType===1&&node.matches?.('.cm-group-review,[data-cm-group-review-style]'))))return;
   render();if(timer!==null)return;timer=setTimeout(()=>{timer=null;observe();void update();},1000);
  }).observe(root===document?document.documentElement:root,{childList:true,subtree:true});}}
 chrome.storage?.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(viewerId()!==accountId){clear();return;}const next=changes['circlemate_view_'+accountId]?.newValue;if(next?.accountId===accountId){reviews=next.groupReviews||{};render();}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void update();});
 document.addEventListener('scroll',()=>{if(timer!==null)return;timer=setTimeout(()=>{timer=null;void update();},1000);},true);
 observe();void update();setInterval(()=>{observe();render();void update();},30000);
})();
