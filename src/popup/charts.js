(() => {
  const finite=v=>Number.isFinite(v)&&v>=0?v:null;
  const format=v=>Math.abs(v)>=999950?(v/1000000).toFixed(1).replace(/\.0$/,'')+'M':Math.abs(v)>=1000?(v/1000).toFixed(1).replace(/\.0$/,'')+'K':String(v);
  function days(a){
    if(!Number.isFinite(a?.from)||!Number.isFinite(a?.to)||a.to<=a.from)return [];
    const result=[];for(let d=a.from;d<a.to&&result.length<14;d+=86400000){const key=new Date(d).toISOString().slice(0,10);result.push({date:key,label:key.slice(5).replace('-','/'),values:a.daily?.[key] || {}});}return result;
  }
  function chart(a,kind,labels,metric='Displayed'){
    const rows=days(a),keys=kind==='creation'?['TweetCreate','ReplyCreate']:[metric];
    const values=rows.flatMap(r=>keys.map(k=>finite(r.values[k]))).filter(v=>v!==null);
    if(!rows.length||!values.length)return '';
    const max=Math.max(1,...values),left=38,right=316,top=10,bottom=104;
    const x=i=>left+(right-left)*i/Math.max(1,rows.length-1),y=v=>bottom-v/max*(bottom-top);
    let svg=`<svg viewBox="0 0 330 130" role="img" aria-label="${kind==='creation'?labels.creation:labels.views}">`;
    for(const fraction of [0,.5,1]){const yy=y(max*fraction);svg+=`<path class="chart-grid" d="M${left} ${yy}H${right}"/><text class="chart-axis" x="${left-5}" y="${yy+3}" text-anchor="end">${format(Math.round(max*fraction))}</text>`;}
    rows.forEach((r,i)=>{if(i===0||i===rows.length-1||i===Math.floor(rows.length/2))svg+=`<text class="chart-axis" x="${x(i)}" y="123" text-anchor="middle">${r.label}</text>`;});
    if(kind==='creation')rows.forEach((r,i)=>keys.forEach((key,k)=>{const v=finite(r.values[key]);if(v===null)return;const yy=y(v);svg+=`<rect class="chart-bar series-${k}" x="${x(i)-9+k*10}" y="${v===0?bottom-1:yy}" width="8" height="${Math.max(1,bottom-yy)}" rx="2"><title>${r.date} · ${k?labels.replies:labels.posts}: ${v}</title></rect>`;}));
    else {
      let run=[];
      const flush=()=>{if(run.length>1){const d=run.map((p,i)=>(i?'L':'M')+p.x+' '+p.y).join(' ');svg+=`<path class="chart-area" d="${d} L${run.at(-1).x} ${bottom} L${run[0].x} ${bottom} Z"/><path class="chart-line" d="${d}"/>`;}run=[];};
      rows.forEach((r,i)=>{const v=finite(r.values[metric]);if(v===null){flush();return;}run.push({x:x(i),y:y(v)});});flush();
      rows.forEach((r,i)=>{const v=finite(r.values[metric]);if(v!==null)svg+=`<circle class="chart-point" cx="${x(i)}" cy="${y(v)}" r="3"><title>${r.date} · ${labels.views}: ${v}</title></circle>`;});
    }
    return svg+'</svg>';
  }
  const change=(value,previous)=>!Number.isFinite(value)||!Number.isFinite(previous)?null:previous===0?(value===0?0:null):(value-previous)/Math.abs(previous)*100;
  const comparison=(value,previous)=>{
    if(!Number.isFinite(value)||!Number.isFinite(previous))return {kind:'missing',direction:'flat',percent:null};
    if(previous===0&&value!==0)return {kind:value>0?'new':'negative',direction:value>0?'up':'down',percent:null};
    const percent=change(value,previous);
    return {kind:'percent',direction:percent>0?'up':percent<0?'down':'flat',percent};
  };
  const net=(totals)=>Number.isFinite(totals?.Follow)&&Number.isFinite(totals?.Unfollow)?totals.Follow-totals.Unfollow:null;
  globalThis.CircleMate.charts={days,chart,format,change,comparison,net};
})();
