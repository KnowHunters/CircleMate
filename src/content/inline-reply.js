(() => {
  'use strict';
  if (window !== window.top) return;
  const api = globalThis.CircleMate ||= {};
  api.inlineReplyCss = `.cm-inline-reply{margin:10px 0 4px;padding:12px;background:#1d9bf008;border:1px solid var(--cm-line,#cfd9de88);border-radius:12px;color:inherit;font:13px system-ui}.cm-inline-reply label{display:block;color:var(--cm-muted,#536471);font-size:12px}.cm-inline-reply textarea{display:block;box-sizing:border-box;width:100%;margin-top:8px;padding:10px;border:1px solid var(--cm-line,#cfd9de88);border-radius:10px;resize:vertical;min-height:94px;max-height:220px;font:14px/1.6 system-ui;background:transparent;color:inherit}.cm-inline-reply textarea:focus{outline:2px solid #1d9bf0;outline-offset:1px}.cm-inline-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:10px}.cm-inline-reply button{border:0;border-radius:18px;min-height:34px;padding:7px 12px;font:13px system-ui;background:transparent;color:var(--cm-muted,#536471);cursor:pointer}.cm-inline-reply button:focus-visible{outline:2px solid #1d9bf0;outline-offset:2px}.cm-inline-reply button:disabled{cursor:default}.cm-inline-reply .cm-inline-send{background:#1d9bf0;color:#fff;font-weight:600;padding:7px 14px}.cm-inline-reply .cm-inline-send:disabled{background:#1d9bf020;color:var(--cm-muted,#536471);opacity:1}.cm-inline-status{font-size:12px;line-height:1.5;color:var(--cm-muted,#536471);margin:8px 0}.cm-inline-status:empty{display:none}`;
  const drafts = new Map();
  // The verified transport is supplied by the post panel; this view owns no endpoint.
  api.createInlineReply = ({accountId, tweetId, username, onSend, onClose}) => {
    const key = `${accountId}:${tweetId}`;
    const form = document.createElement('form');
    form.className = 'cm-inline-reply';
    const label = document.createElement('label');
    label.textContent = `回复 @${username}`;
    const input = document.createElement('textarea');
    input.rows = 3;
    input.placeholder = '写下你的回复…';
    input.setAttribute('aria-label', `回复 @${username} 的内容`);
    input.value = drafts.get(key) || '';
    label.append(input);
    const status = document.createElement('p');
    status.className = 'cm-inline-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const actions = document.createElement('div');
    actions.className = 'cm-inline-actions';
    const button = (text, type = 'button') => {
      const item = document.createElement('button');
      item.type = type;
      item.textContent = text;
      return item;
    };
    const cancel = button('收起');
    const send = button('发送回复', 'submit');
    send.className = 'cm-inline-send';
    let pending = false, locked = false, token = crypto.randomUUID();
    const update = () => {
      send.disabled = pending || locked || !input.value.trim() || typeof onSend !== 'function';
      cancel.disabled = pending;
      input.readOnly = pending || locked;
      form.setAttribute('aria-busy', String(pending));
    };
    input.addEventListener('input', () => {
      drafts.set(key, input.value);
      if (drafts.size > 100) drafts.delete(drafts.keys().next().value);
      update();
    });
    cancel.onclick = () => { if (!pending) onClose(); };
    form.onsubmit = async event => {
      event.preventDefault();
      if (!event.isTrusted || send.disabled) return;
      pending = true;
      status.textContent = '正在发送，请勿重复提交…';
      update();
      try {
        const result = await onSend(input.value, token);
        if (!result?.confirmed) {
          locked = true;
          status.textContent = '发送结果尚未确认，请先到原帖核验，避免重复回复。';
        } else {
          drafts.delete(key);
          input.value = '';
          status.textContent = '回复已发送';
          token = crypto.randomUUID();
        }
      } catch (error) {
        locked = error?.code !== 'WRITE_NOT_SENT';
        status.textContent = locked ? '发送结果尚未确认，请到原帖核验。草稿已保留。' : (error.message || '尚未发送，请重试');
      } finally {
        pending = false;
        update();
      }
    };
    actions.append(cancel, send);
    form.append(label, status, actions);
    update();
    return {element: form, focus: () => input.focus({preventScroll: true})};
  };
})();
