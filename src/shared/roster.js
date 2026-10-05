(() => {
  const api=globalThis.CircleMate ||= {};
  const rootCaches=new WeakMap();
  api.rosterRoots = (root=document) => {
    let cache=rootCaches.get(root);
    if(!cache){
      cache={roots:[root]};rootCaches.set(root,cache);
      const scan=node=>{for(const element of [node,...(node.querySelectorAll?.('*')||[])])if(element.shadowRoot&&!cache.roots.includes(element.shadowRoot)){cache.roots.push(element.shadowRoot);watch(element.shadowRoot);scan(element.shadowRoot);}};
      const watch=surface=>{if(typeof MutationObserver!=='function')return;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes||[])if(node.nodeType===1)scan(node);}).observe(surface,{childList:true,subtree:true});};
      cache.scan=scan;watch(root);scan(root);
    }
    cache.roots=cache.roots.filter(surface=>!surface.host || surface.host.isConnected!==false);
    // attachShadow on an existing host does not emit a childList mutation.
    // Native chat hosts are observed on the real page; check only these hosts.
    for(const surface of [...cache.roots])for(const host of surface.querySelectorAll?.('[data-testid="xchatEmbedRoute"],[data-testid="xchatEmbedOverlays"]')||[]){
      if(host.shadowRoot&&!cache.roots.includes(host.shadowRoot))cache.scan(host);
    }
    return cache.roots;
  };
  api.rosterRows = root => {
    const candidates=[],seen=new Set();
    for(const menu of root.querySelectorAll('button[aria-label]')){
      if(!/^更多 .+的选项$/.test(menu.getAttribute('aria-label')||'')&&!/^More options for .+$/i.test(menu.getAttribute('aria-label')||''))continue;
      const row=menu.parentElement,anchor=[...(row?.children||[])].find(e=>e.tagName==='A');if(anchor){candidates.push({row,menu,anchor});seen.add(row);}
    }
    // The viewer's own member row has an avatar/profile link but no options menu.
    for(const anchor of root.querySelectorAll('a[href]')){
      if(anchor.tagName!=='A'||!anchor.querySelector?.('img[alt="user avatar"]')||seen.has(anchor.parentElement))continue;
      candidates.push({row:anchor.parentElement,menu:null,anchor});seen.add(anchor.parentElement);
    }
    return candidates.flatMap(({row,menu,anchor})=>{
      try{const url=new URL(anchor.getAttribute('href'),'https://x.com');const username=url.pathname.match(/^\/([a-z0-9_]{1,15})\/?$/i)?.[1]?.toLowerCase();
        return username&&['https://x.com','https://twitter.com'].includes(url.origin)?[{row,menu,username}]:[];
      }catch{return [];}
    });
  };
  api.rosterListScope = root => {
    const input=[...root.querySelectorAll('input')].find(e=>/^(搜索参与者|搜索成员|search participants|search members)$/i.test((e.getAttribute('placeholder')||'').trim()));
    if(!input)return null;
    for(let node=input.parentElement || root;node;node=node.parentElement)if(api.rosterRows(node).length)return node;
    return null;
  };
  api.rosterNeedsAction = (row,menu) => Boolean(menu && !row.querySelector('.cm-roster-action'));
  api.rosterListRows = root => {const scope=api.rosterListScope(root);return scope ? api.rosterRows(scope) : [];};
  // Native badges fill gaps left by relationship-only cache joins; gold/grey badges do not qualify.
  api.rosterBlueVerified = row => [...row.querySelectorAll('svg[aria-label],svg[data-testid="icon-verified"],svg[data-icon="icon-verified"]')].some(icon => {
    const label=icon.getAttribute('aria-label') || '';
    if (!/verified|认证|已验证/i.test(label) && icon.getAttribute('data-testid')!=='icon-verified' && icon.getAttribute('data-icon')!=='icon-verified') return false;
    const paint=globalThis.getComputedStyle?.(icon);
    return [paint?.color,paint?.fill,icon.getAttribute('fill')].some(value => /^(#1d9bf0|#1e9cf1|rgb\(\s*(?:29\s*,\s*155\s*,\s*240|30\s*,\s*156\s*,\s*241)\s*\)|rgba\(\s*(?:29\s*,\s*155\s*,\s*240|30\s*,\s*156\s*,\s*241)\s*,\s*1\s*\))$/i.test(value || ''));
  });
  api.rosterMember = (cached,row,username,account) => {
    const self=account?.username && username.toLowerCase()===account.username.toLowerCase();
    return { ...cached, ...(self ? {id:account.id} : {}), ...(api.rosterBlueVerified(row) ? {blueVerified:true} : {}) };
  };
  api.rosterCachedUsers = (state,group) => {
    const users=new Map((group?.users||[]).map(u=>[u.username,u]));
    for(const [kind,field] of [['following','following'],['followers','followedBy']]){
      const list=state?.relationships?.[kind];if(!list || list.stale)continue;
      const members=list.cachedUsers || list.users || [],names=new Set(members.map(u=>u.username));
      for(const member of members)if(!users.has(member.username))users.set(member.username,{...member});
      for(const [username,user] of users){if(user.fieldSources?.[field] && user.fieldSources[field].observedAt>=(list.startedAt||0))continue;if(names.has(username))users.set(username,{...user,[field]:true});else if(list.cachedComplete||list.complete)users.set(username,{...user,[field]:false});}
    }
    return users;
  };
  api.rosterCachedMember = (users,state,username) => {
    const user={...users.get(username),username};
    for(const [kind,field] of [['following','following'],['followers','followedBy']]){const list=state?.relationships?.[kind];if((list?.cachedComplete||list?.complete)&&!list.stale && user[field]==null)user[field]=false;}
    return user;
  };
  api.rosterAcceptState = (current,incoming) => !incoming ? current : current?.accountId===incoming.accountId && (current.revision!==undefined&&incoming.revision!==undefined?current.revision>incoming.revision:(current.updatedAt || 0)>(incoming.updatedAt || 0)) ? current : incoming;
  api.rosterFollowResult = (state,groupId,username) => {
    const user=state?.groups?.find(g=>g.id===groupId)?.users?.find(u=>u.username===username);
    if (user?.followRequested===true) return {following:user.following===true,followRequested:true};
    if (user?.following===true) return {following:true,followRequested:false};
    throw new Error('X 未确认关注结果，请在原生页面核实后再操作');
  };
  api.rosterFollowDelay = (random=Math.random) => 3000+Math.floor(Math.min(1,Math.max(0,random()))*4000);
  api.rosterQueuedFollow = (queue,username,accountId,retryAt=0,now=Date.now(),paused=false) => {
    const index=queue.findIndex(job=>String(job.username).toLowerCase()===String(username).toLowerCase()&&String(job.accountId)===String(accountId));
    if(index<0)return null;
    return {label:paused?'已暂停':retryAt>now?'等待冷却…':index===0?'关注中…':'排队中…',position:index+1};
  };
  api.rosterFollowTime = (user,now=Date.now()) => {
    const provenance=user?.fieldSources?.following;
    const timestamp=user?.followedAt || (user?.following===true&&provenance?.source==='follow-write'?provenance.observedAt:null);
    if(!timestamp||user?.following!==true)return {label:'关注时间未知',title:'已有关注名单未提供关注时间'};
    const date=new Date(timestamp),today=new Date(now),format=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai'});
    const day=d=>Date.parse(format.format(d)+'T00:00:00+08:00');
    const days=Math.max(0,Math.floor((day(today)-day(date))/86400000));
    return {label:days===0?'今天关注':days===1?'昨天关注':days+'天前关注',title:'本地确认时间（北京时间）：'+date.toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})};
  };
  api.rosterRelation = (user,accountId) => !user ? 'unknown' : accountId != null && user.id != null && String(user.id)===String(accountId) ? 'self' : user.availability==='unavailable' ? 'unavailable' : user.followRequested ? 'requested' : user.following===true ? 'following' : user.following===false ? 'unfollowed' : 'unknown';
  api.rosterMatches = (user,accountId,mode,blueOnly=false) => {
    const relation=api.rosterRelation(user,accountId);
    if(mode==='unavailable')return relation==='unavailable';
    return relation!=='self' && (!blueOnly || user?.blueVerified===true) && (mode==='all' || mode==='unfollowed' && relation==='unfollowed' && user?.availability!=='unavailable' || mode==='unavailable' && user?.availability==='unavailable' || mode==='unmatched' && relation==='following' && user.followedBy===false || mode==='mutual' && relation==='following' && user.followedBy===true);
  };
})();

