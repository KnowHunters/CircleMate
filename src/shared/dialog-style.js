(() => {
  const api=globalThis.CircleMate ||= {};
  const css=`.confirm-dialog,.cm-confirm-dialog{width:min(350px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;padding:18px;border:1px solid #ffffffd6;border-radius:20px;color:#202b3b;background:#fffffff5;box-shadow:0 22px 58px #222d4633,0 3px 10px #222d4614;font:13px system-ui}.confirm-dialog::backdrop,.cm-confirm-dialog::backdrop{background:#171f2a42;backdrop-filter:blur(8px)}.confirm-dialog h2,.cm-confirm-dialog h3{margin:1px 0 0;font-size:13px;line-height:1.35}.confirm-dialog p,.cm-confirm-dialog p{margin:6px 0 0;color:#63717c;font-size:11px;line-height:1.55}.confirm-dialog-actions,.cm-confirm-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.confirm-dialog-actions button,.cm-confirm-actions button{min-width:68px;padding:6px 10px;border:1px solid #d9dfe1;border-radius:9px;background:#f7f9fa;color:#25313a;font:600 11px system-ui;cursor:pointer}.confirm-dialog-actions .confirm-primary,.cm-confirm-actions .confirm-primary{background:#43594d;color:#fff;border-color:#43594d}.confirm-primary:hover{background:#354a3e}.confirm-dialog button:focus-visible,.cm-confirm-dialog button:focus-visible{outline:2px solid #589f80;outline-offset:3px}`;
  api.applyDialogStyle=root=>{
    if(root.querySelector('[data-cm-dialog-style]'))return;
    const sheet=document.createElement('style');sheet.dataset.cmDialogStyle='1';sheet.textContent=css;
    (root===document?document.head:root).append(sheet);
  };
})();
