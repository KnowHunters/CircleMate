(() => {
  let context=null,filter='material',signature='';
  const api=globalThis.CircleMate;
  api.renderCreatorLibrary=(state,tabId,language)=>{
    const root=document.getElementById('creator-library-list');if(!root)return;
    context={state,tabId,language};
    const posts=state.creatorLibrary?.posts||[];
    const next=state.accountId+':'+language+':'+filter+':'+JSON.stringify(posts);
    if(signature===next)return;signature=next;
    const en=language==='en',t=(zh,english)=>en?english:zh;
    root.replaceChildren();
    const choices=document.getElementById('creator-library-filters');choices.replaceChildren();
    for(const [key,label]of [['material',t('素材箱','Materials')],['pending',t('待回复','To reply')],['handled',t('已处理','Handled')]]){
      const button=document.createElement('button');button.type='button';button.className='row-action';button.textContent=label;button.setAttribute('aria-pressed',String(filter===key));button.onclick=()=>{filter=key;signature='';api.renderCreatorLibrary(context.state,context.tabId,context.language);};choices.append(button);
    }
    document.getElementById('creator-library-count').textContent=t('本地保存 · ','Saved locally · ')+posts.length+t(' 条',' posts');
    const selected=posts.filter(p=>filter==='material'?p.material:filter==='pending'?p.replyStatus==='pending':['done','skip'].includes(p.replyStatus)).sort((a,b)=>b.savedAt-a.savedAt);
    if(!selected.length){const p=document.createElement('p');p.className='muted';p.textContent=t('点击帖子指标中的收集图标，保存素材或加入待回复列表。','Use the collect icon on a post to save material or add it to your reply list.');root.append(p);}
    for(const post of selected){
      if(!/^\d{1,30}$/.test(post.id)||!/^[a-z0-9_]{1,15}$/i.test(post.author))continue;
      const row=document.createElement('article');row.className='creator-library-post';
      const head=document.createElement('div');head.className='creator-library-head';
      const author=document.createElement('strong');author.textContent='@'+post.author;
      const link=document.createElement('a');link.href=`https://x.com/${post.author}/status/${post.id}`;link.target='_blank';link.rel='noopener noreferrer';link.textContent=t('查看原帖 ↗','Open post ↗');head.append(author,link);
      const body=document.createElement('p');body.className='creator-library-text';body.textContent=post.text||t('媒体帖子，请查看原帖','Media post; open the original');
      const note=document.createElement('textarea');note.rows=2;note.maxLength=2000;note.value=post.note||'';note.placeholder=t('写下选题或回复思路…','Add an idea or reply note…');note.setAttribute('aria-label',t('帖子笔记','Post notes'));
      const actions=document.createElement('div');actions.className='button-row';
      const status=document.createElement('p');status.className='muted';status.setAttribute('role','status');
      async function update(extra){for(const b of actions.querySelectorAll('button'))b.disabled=true;const accountId=state.accountId;try{const result=await chrome.runtime.sendMessage({action:'CREATOR_LIBRARY',tabId,accountId,postId:post.id,...extra});if(!result?.ok)throw Error(result?.error||t('保存失败','Save failed'));if(context.state.accountId!==accountId)return;api.renderCreatorLibrary(result.state,tabId,language);status.textContent=t('已保存','Saved');}catch(e){status.textContent=e.message;}finally{for(const b of actions.querySelectorAll('button'))b.disabled=false;}}
      function action(label,extra){const b=document.createElement('button');b.type='button';b.className='row-action';b.textContent=label;b.onclick=()=>void update(typeof extra==='function'?extra():extra);actions.append(b);}
      action(t('保存笔记','Save notes'),()=>({command:'note',note:note.value}));
      if(filter==='pending'){action(t('标记已回复','Mark replied'),{command:'status',status:'done'});action(t('暂不回复','Skip'),{command:'status',status:'skip'});}
      else if(filter==='handled')action(t('重新待回复','Reply later'),{command:'status',status:'pending'});
      else {action(t('稍后回复','Reply later'),{command:'status',status:'pending'});action(t('移出素材','Remove material'),{command:'material',material:false});}
      action(t('移除记录','Remove'),{command:'remove'});
      row.append(head,body,note,actions,status);root.append(row);
    }
  };
})();
