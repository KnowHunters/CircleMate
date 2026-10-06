(() => {
  'use strict';
  if(window!==window.top)return;
  const pending=new Set();let timer;
  const notice=document.createElement('div');notice.setAttribute('role','status');
  notice.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#202b3b;color:#fff;border-radius:12px;padding:10px 16px;font:13px system-ui;display:none;max-width:85vw';
  document.documentElement.append(notice);let noticeTimer;
  function show(text){notice.textContent=text;notice.style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.style.display='none',3500);}
  function identity(){const raw=document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('twid='))?.slice(5);try{return decodeURIComponent(raw||'').match(/u=(\d+)/)?.[1]||'';}catch{return '';}}
  function postData(article){
    const time=article.querySelector('time');const href=time?.closest('a')?.getAttribute('href');
    let url;try{url=new URL(href,location.origin);}catch{return null;}
    const match=url.pathname.match(/^\/([a-z0-9_]{1,15})\/status\/(\d{1,30})$/i);
    if(!match||!['https://x.com','https://twitter.com'].includes(url.origin)||time.closest('article')!==article)return null;
    const text=article.querySelector('[data-testid="tweetText"]');
    return {id:match[2],author:match[1],text:text?.innerText||'',postedAt:time.getAttribute('datetime')||''};
  }
  async function collect(article){
    const post=postData(article),accountId=identity();if(!post||!accountId){show('无法识别帖子或登录账号，请刷新 X');return;}
    globalThis.CircleMate.applyDialogStyle?.(document);
    const dialog=document.createElement('dialog');dialog.className='cm-confirm-dialog';
    const title=document.createElement('h3');title.textContent='收集这条帖子';
    const hint=document.createElement('p');hint.textContent='仅保存在本机。可在圈友“数据 → 创作收集”中查看。';
    const preview=document.createElement('p');preview.textContent=post.text.slice(0,160)||'此帖包含媒体，可通过原帖查看。';
    const actions=document.createElement('div');actions.className='cm-confirm-actions';
    for(const [label,kind]of [['取消',null],['存为素材','material'],['稍后回复','pending']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;
      b.onclick=async()=>{if(!kind){dialog.close();dialog.remove();return;}for(const btn of actions.querySelectorAll('button'))btn.disabled=true;try{const result=await chrome.runtime.sendMessage({action:'CREATOR_LIBRARY',accountId,command:'save',kind,post});if(!result?.ok)throw Error(result?.error||'保存失败');dialog.close();dialog.remove();show(kind==='material'?'已存入素材箱':'已加入待回复列表');}catch(e){show(e.message);for(const btn of actions.querySelectorAll('button'))btn.disabled=false;}};
      actions.append(b);
    }
    dialog.append(title,hint,preview,actions);dialog.addEventListener('cancel',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();
  }
  function mount(article){
    if(article.querySelector('.cm-collect')||article.closest('[role="dialog"]'))return;
    const share=article.querySelector('[data-testid="reply"]'),icon=share?.querySelector('svg'),group=share?.closest('[role="group"]');
    if(!icon||!group||share.closest('article')!==article||!postData(article))return;
    const b=share.cloneNode(false);b.removeAttribute('data-testid');b.removeAttribute('id');b.classList.add('cm-collect');b.type='button';b.title='收为素材 / 稍后回复';b.setAttribute('aria-label',b.title);
    const wrap=icon.parentElement.cloneNode(true),svg=wrap.querySelector('svg');svg.innerHTML='<path d="M4 3h16v19l-8-5-8 5V3zm2 2v13.4l6-3.7 6 3.7V5H6zM11 7h2v2h2v2h-2v2h-2v-2H9V9h2V7z"/>';svg.setAttribute('viewBox','0 0 24 24');b.append(wrap);
    b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(e.isTrusted)void collect(article);});group.append(b);
  }
  function schedule(){clearTimeout(timer);timer=setTimeout(()=>{for(const a of pending)if(a.isConnected)mount(a);pending.clear();},80);}
  new MutationObserver(records=>{for(const r of records){const a=r.target instanceof Element?r.target.closest('article[data-testid="tweet"]'):null;if(a)pending.add(a);for(const node of r.addedNodes)if(node instanceof Element){if(node.matches('article[data-testid="tweet"]'))pending.add(node);node.querySelectorAll('article[data-testid="tweet"]').forEach(a=>pending.add(a));}}if(pending.size)schedule();}).observe(document.documentElement,{childList:true,subtree:true});
  document.querySelectorAll('article[data-testid="tweet"]').forEach(a=>pending.add(a));schedule();
})();
