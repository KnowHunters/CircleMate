(() => {
  'use strict';
  if (window !== window.top) return;
  const articles = new Set(), pending = new Set();
  const excluded = new Set(['home','explore','search','notifications','settings','messages','i','compose','tos','privacy']);
  let path = '', timer;
  const isProfile = () => {
    const match = location.pathname.match(/^\/([a-z0-9_]{1,15})(?:\/(with_replies|media|reposts|highlights))?\/?$/i);
    return Boolean(match && !excluded.has(match[1].toLowerCase()));
  };
  const style = document.createElement('style');
  style.textContent = '.cm-quick-reply{display:inline-flex;align-items:center;justify-content:center;flex:0 0 28px;width:28px;height:28px;margin:0 0 0 4px;padding:0;border:0;border-radius:50%;background:transparent;color:#1d9bf0;cursor:pointer}.cm-quick-reply:hover{background:rgba(29,155,240,.12)}.cm-quick-reply:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}.cm-quick-reply:disabled{opacity:.4;cursor:default}.cm-quick-reply svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}';
  document.head.append(style);
  function update(article) {
    const existing = article.querySelector('.cm-quick-reply');
    const reply = article.querySelector('[data-testid="reply"]');
    const group = reply?.closest('[role="group"]');
    if (!isProfile() || article.closest('[role="dialog"]') || !reply || !group || reply.closest('article') !== article) {
      existing?.remove(); return;
    }
    if (existing) { if (existing.disabled !== reply.disabled) existing.disabled = reply.disabled; return; }
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'cm-quick-reply';
    const label = document.documentElement.lang.startsWith('zh') ? '快速回复' : 'Quick reply';
    button.title = label; button.setAttribute('aria-label', label); button.disabled = reply.disabled;
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5H5a2 2 0 0 0-2 2v11l4-3h8a2 2 0 0 0 2-2v-1M13 9l7-7 2 2-7 7-3 1z"/></svg>';
    button.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      if (!event.isTrusted || !isProfile()) return;
      const target = article.querySelector('[data-testid="reply"]');
      if (target && target.closest('article') === article && !target.disabled) target.click();
    });
    group.append(button);
  }
  function flush() {
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
    if (pending.size || path !== location.pathname) schedule();
  }).observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled']});
  addEventListener('popstate', schedule);
  schedule();
})();
