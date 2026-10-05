(() => {
  if (window !== window.top || document.getElementById('circlemate-widget')) return;
  const host=document.createElement('div');host.id='circlemate-widget';
  const root=host.attachShadow({mode:'open'});
  root.innerHTML=`<style>
    :host{all:initial;position:fixed;right:16px;bottom:18px;width:52px;height:52px;z-index:2147483645;font-family:system-ui}
    *{box-sizing:border-box}.launcher{width:100%;height:100%;display:grid;place-items:center;padding:0;border:1px solid #cfd9de;border-radius:16px;background:rgba(255,255,255,.85);color:rgb(15,20,25);box-shadow:0 0 15px rgba(101,119,134,.2),0 0 3px 1px rgba(101,119,134,.15);cursor:pointer;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);transition:background-color .2s,box-shadow .2s;outline:none}
    .launcher:hover{background:rgba(255,255,255,.95)}
    .launcher svg{width:32px;height:32px;max-width:70%;max-height:70%;fill:none;stroke:currentColor;stroke-width:2.1;stroke-linecap:round}.launcher:focus-visible{outline:2px solid #589f80;outline-offset:3px}
    .panel{position:fixed;right:16px;top:16px;width:min(390px,calc(100vw - 32px));height:360px;max-height:calc(100vh - 32px);border:1px solid #d9dfe1;border-radius:18px;background:#f5f6f7;box-shadow:0 22px 60px #2f3a3e29;overflow:hidden;transition:height .18s ease}
    iframe{display:block;width:100%;height:100%;border:0}.panel[hidden],.launcher[hidden]{display:none}
    @media(prefers-color-scheme:dark){.launcher{background:rgba(0,0,0,.65);border-color:rgb(47,51,54);color:rgb(231,233,234);box-shadow:0 0 15px rgba(255,255,255,.12),0 0 3px 1px rgba(255,255,255,.08)}.launcher:hover{background:rgba(0,0,0,.78)}}
    @media(prefers-reduced-motion:reduce){.panel,.launcher{transition:none}}
  </style><section class="panel" hidden aria-label="圈友 CircleMate"></section><button class="launcher" type="button" aria-label="打开圈友 CircleMate" aria-expanded="false" title="圈友 CircleMate"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 19v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/></svg></button>`;
  document.documentElement.append(host);
  const panel=root.querySelector('.panel'),button=root.querySelector('button');
  let frame=null,open=false,contentHeight=360;
  function setOpen(value){open=value;panel.hidden=!value;button.hidden=value;button.setAttribute('aria-expanded',String(value));if(value&&!frame){frame=document.createElement('iframe');frame.title='圈友 CircleMate';frame.src=chrome.runtime.getURL('popup/index.html')+'?embedded=1';panel.append(frame);}position();if(!value)button.focus({preventScroll:true});}
  function position(){
    const peer=document.getElementById('xclearreply-widget');
    const anchors=[peer,...document.querySelectorAll('button[aria-label*="Grok"]')].filter(Boolean).map(e=>e.getBoundingClientRect()).filter(r=>r.width>=40&&r.width<=88&&r.height>=40&&r.right>innerWidth-140&&r.top>innerHeight*.45);
    // Keep the entire stack on the same center line; never take the last anchor's right offset.
    const anchor=anchors.sort((a,b)=>a.top-b.top)[0];
    const size=anchor?Math.max(40,Math.min(64,Math.round(Math.min(anchor.width,anchor.height)))):52;
    let gap=12;
    if(anchor){
      const left=anchor.left ?? anchor.right-anchor.width;
      const gaps=[...document.querySelectorAll('button,a,[role="button"]')].filter(e=>!host.contains?.(e)).map(e=>e.getBoundingClientRect()).filter(r=>r.width>=40&&r.width<=88&&r.height>=40&&r.height<=88&&Math.abs((r.left ?? r.right-r.width)-left)<=12).map(r=>r.top-(anchor.top+anchor.height)).filter(g=>g>=2&&g<=40);
      if(gaps.length)gap=Math.round(Math.min(...gaps));
    }
    const left=anchor?Math.round(Math.max(8,Math.min(innerWidth-size-8,(anchor.left ?? anchor.right-anchor.width)+(anchor.width-size)/2))):Math.max(8,innerWidth-size-16);
    const launcherTop=anchor?anchor.top-size-gap:innerHeight-18-size;
    host.style.width=size+'px';host.style.height=size+'px';host.style.left=left+'px';host.style.right='auto';
    host.style.bottom=Math.round(Math.min(Math.max(8,innerHeight-size-8),Math.max(8,innerHeight-launcherTop-size)))+'px';
    let top=16,panelRight=16,width=Math.min(390,innerWidth-32),available=innerHeight-32,blocked=false;
    const peerPanel=peer?.shadowRoot?.querySelector('.panel.open');
    if(peerPanel){const r=peerPanel.getBoundingClientRect();
      if(r.left>=296){panelRight=innerWidth-r.left+12;width=Math.min(390,r.left-28);}
      else if(innerHeight-r.bottom-28>=160){top=r.bottom+12;available=innerHeight-top-16;}
      else blocked=true;
    }
    if(blocked&&open){open=false;panel.hidden=true;button.hidden=false;button.setAttribute('aria-expanded','false');}
    button.disabled=blocked;button.title=blocked?'请先最小化 XClearReply，再打开圈友':'圈友 CircleMate';
    panel.style.right=panelRight+'px';panel.style.top=top+'px';panel.style.width=Math.max(0,width)+'px';panel.style.maxHeight=Math.max(0,available)+'px';panel.style.height=Math.max(0,Math.min(contentHeight+2,available))+'px';
  }
  button.addEventListener('click',()=>setOpen(true));
  window.addEventListener('message',event=>{
    if(!frame||event.source!==frame.contentWindow||event.origin!==(new URL(chrome.runtime.getURL('/')).protocol+'//'+new URL(chrome.runtime.getURL('/')).host))return;
    if(event.data?.type==='CIRCLEMATE_RESIZE'&&Number.isFinite(event.data.height)&&event.data.height>0){contentHeight=Math.min(10000,Math.ceil(event.data.height));position();}
    if(event.data?.type==='CIRCLEMATE_MINIMIZE')setOpen(false);
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open)setOpen(false);});
  window.addEventListener('resize',position,{passive:true});
  const timer=setInterval(()=>{if(!chrome.runtime?.id){clearInterval(timer);host.remove();return;}position();},1000);
  position();
})();
