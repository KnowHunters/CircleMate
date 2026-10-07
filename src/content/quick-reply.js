(() => {
  'use strict';
  if (window !== window.top) return;
  const api=globalThis.CircleMate ||= {},articles = new Set(), pending = new Set();
  let path = '', timer, active=null;
  const isProfile = () => api.isTimelinePath?.(location.pathname) === true;
  function account(){try{return decodeURIComponent(document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith('twid='))?.slice(5)||'').replace(/^u=/,'').replace(/"/g,'');}catch{return '';}}
  function target(article){const anchor=article.querySelector('a[href] time')?.closest('a');if(!anchor||anchor.closest('article')!==article)return null;const url=new URL(anchor.href,location.origin),match=url.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{1,30})\/?$/i);return url.origin===location.origin&&match?{username:match[1].toLowerCase(),tweetId:match[2]}:null;}
  function hide(){if(!active)return;active.view.element.remove();active.button.setAttribute('aria-expanded','false');active=null;}
  function open(article,button){
    const post=target(article),accountId=account();if(!isProfile()||!post||!/^\d{1,30}$/.test(accountId))return;
    if(active?.view.element.getAttribute('aria-busy')==='true'||(active?.article===article&&active.tweetId===post.tweetId)){active.view.focus();return;}hide();const route=location.pathname;
    const valid=()=>article.isConnected&&isProfile()&&location.pathname===route&&account()===accountId&&target(article)?.tweetId===post.tweetId;
    const view=api.createInlineReply({accountId,...post,onClose:()=>{hide();button.focus({preventScroll:true});},onSend:async(text,token)=>{
      if(!valid())throw Object.assign(new Error('帖子或账号已切换，请重新展开回复框'),{code:'WRITE_NOT_SENT'});
      const result=await chrome.runtime.sendMessage({action:'TIMELINE_REPLY',accountId,...post,text,token});if(!result?.ok)throw Object.assign(new Error(result?.error||'回复结果未确认'),{code:result?.code});return result;
    }});
    view.element.classList.add('cm-timeline-reply');const color=getComputedStyle(article).color.match(/\d+/g);view.element.dataset.dark=String(color&&Number(color[0])>160);
    for(const type of ['click','keydown','pointerdown'])view.element.addEventListener(type,event=>event.stopPropagation());
    button.closest('[role=group]').parentElement.append(view.element);active={article,button,view,tweetId:post.tweetId,accountId,route};button.setAttribute('aria-expanded','true');view.element.scrollIntoView({block:'nearest'});view.focus();
  }
  const style = document.createElement('style');
  style.textContent = '.cm-quick-reply{flex:0 0 auto;margin:0;cursor:pointer}.cm-quick-reply:hover{color:rgb(29,155,240)!important}.cm-quick-reply:hover>div{background:rgba(29,155,240,.1);border-radius:50%}.cm-quick-reply:focus-visible{outline:2px solid rgb(29,155,240);outline-offset:2px}.cm-quick-reply:disabled{opacity:.4;cursor:default}.cm-quick-reply svg{fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}';
  document.head.append(style);
  style.textContent+=api.inlineReplyCss+'.cm-quick-reply[aria-expanded=true]{color:rgb(29,155,240)!important}.cm-timeline-reply{margin:12px 0 8px;--cm-muted:#536471;--cm-line:#cfd9de88}.cm-timeline-reply[data-dark=true]{--cm-muted:#a0adb8;--cm-line:#53647188}';
  function update(article) {
    const existing = article.querySelector('.cm-quick-reply');
    const reply = article.querySelector('[data-testid="reply"]');
    const group = reply?.closest('[role="group"]');
    const post=target(article);
    if (!isProfile() || article.closest('[role="dialog"]') || !reply || !group || reply.closest('article') !== article || !post) {
      existing?.remove();if(active?.article===article)hide();return;
    }
    if(active?.article===article&&active.tweetId!==post.tweetId)hide();
    if (existing) { existing.disabled=reply.disabled||reply.getAttribute('aria-disabled')==='true';return; }
    const nativeIcon = reply.querySelector('svg');
    if (!nativeIcon) return;
    const button = reply.cloneNode(false);
    button.removeAttribute('data-testid'); button.removeAttribute('id');
    button.removeAttribute('aria-describedby');button.removeAttribute('aria-pressed');button.setAttribute('aria-expanded','false');
    button.type = 'button'; button.classList.add('cm-quick-reply');
    const label = document.documentElement.lang.startsWith('zh') ? '快速回复' : 'Quick reply';
    button.title = label; button.setAttribute('aria-label', label); button.disabled = reply.disabled||reply.getAttribute('aria-disabled')==='true';
    // Reuse the native icon container and sizing classes for X themes and density.
    const iconContainer = nativeIcon.parentElement.cloneNode(true);
    const icon = iconContainer.querySelector('svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = '<path d="M14 5H5a2 2 0 0 0-2 2v11l4-3h8a2 2 0 0 0 2-2v-1M13 9l7-7 2 2-7 7-3 1z"/>';
    button.append(iconContainer);
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (!event.isTrusted || !isProfile() || button.disabled) return;
      open(article,button);
    });
    group.append(button);
  }
  function flush() {
    if(active&&(!active.article.isConnected||!isProfile()||active.route!==location.pathname||active.accountId!==account()||target(active.article)?.tweetId!==active.tweetId))hide();
    if (path !== location.pathname) {
      path = location.pathname;
      document.querySelectorAll('article[data-testid="tweet"]').forEach(article => { articles.add(article); pending.add(article); });
      for (const article of articles) pending.add(article);
    }
    for (const article of pending) {
      if (article.isConnected) { articles.add(article); update(article); }
      else articles.delete(article);
    }
    pending.clear();
    for (const article of articles) if (!article.isConnected) articles.delete(article);
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(flush, 60); };
  new MutationObserver(records => {
    for (const record of records) {
      if (record.target instanceof Element) {
        const article = record.target.closest('article[data-testid="tweet"]');
        if (article) pending.add(article);
      }
      for (const node of record.addedNodes) if (node instanceof Element && !node.matches('.cm-quick-reply')) {
        if (node.matches('article[data-testid="tweet"]')) pending.add(node);
        node.querySelectorAll('article[data-testid="tweet"]').forEach(article => pending.add(article));
      }
    }
    if (pending.size || path !== location.pathname || active) schedule();
  }).observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled','aria-disabled','href']});
  addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});setInterval(()=>{if(active)schedule();},1000);
  schedule();
})();
