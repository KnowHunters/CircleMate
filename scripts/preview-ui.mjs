// Local UI fixtures only; not included in extension builds. No X requests.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
const root = new URL('../src/', import.meta.url);
const fixture = {
  accountId: '1', account: { displayName: '林间', username: 'linjian', followingCount: 146, followersCount: 203, statusesCount: 428 },
  groups: [{ id: 'demo', label: '创作者交流圈', usernames: ['alice', 'bob', 'carol', 'dave'], users: [
    { id: '2', username: 'alice', displayName: '小林的创作笔记', following: false, blueVerified: true, description: '记录写作与产品，分享每天的发现。' },
    { id: '3', username: 'bob', displayName: '海边读书人', following: false, description: '读书、摄影，走过城市和海岸。' },
    { id: '4', username: 'carol', displayName: '阿青', following: false, description: '用代码做有用的工具。' },
    { id: '5', username: 'dave', displayName: '陈墨', following: true, followedBy: true }
  ] }], relationships: { verifiedFollowers: { users: [], complete: false } }, tasks: {},
  creator: { today: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()), posts: 2, replies: 7, reposts: 1, complete: false },
  analytics: { verifiedFollowers: 82, totals: { Displayed: 12560, Reply: 48, Fav: 126 }, activeFollowers: 64, activeApproximate: true, from: Date.now() - 7 * 86400000, to: Date.now() }, updatedAt: Date.now()
};
// Seven sample UTC day buckets, never sent to X.
fixture.analytics.from=Math.floor(Date.now()/86400000)*86400000-6*86400000;
fixture.analytics.to=fixture.analytics.from+7*86400000;
fixture.analytics.fetchedAt=Date.now();fixture.analytics.daily={};
const samples=[[2,4,920,12],[1,7,1640,18],[3,5,1320,16],[2,9,2450,28],[4,8,3100,32],[2,6,2010,25],[1,3,1120,15]];
for(let i=0;i<7;i++)fixture.analytics.daily[new Date(fixture.analytics.from+i*86400000).toISOString().slice(0,10)]={TweetCreate:samples[i][0],ReplyCreate:samples[i][1],Displayed:samples[i][2],Fav:samples[i][3]};
fixture.analytics.totals=Object.fromEntries(['TweetCreate','ReplyCreate','Displayed','Fav'].map(k=>[k,Object.values(fixture.analytics.daily).reduce((n,d)=>n+d[k],0)]));
const scenario = process.env.CIRCLEMATE_PREVIEW_SYNC;
if (scenario) {
 fixture.tasks = {following:{status:'paused'},followers:{status:scenario==='waiting'?'paused':'error'},verifiedFollowers:{status:'paused'}};
 fixture.autoSync = {running:false,jobs:{following:{},followers:scenario==='waiting'?{}:{error:{code:'HTTP_404'}},verifiedFollowers:scenario==='failed'?{error:{code:'HTTP_404'}}:{}}};
 if(scenario==='failed')fixture.autoSync.jobs.following={error:{code:'HTTP_404'}};
}
const previewPort=Number(process.env.CIRCLEMATE_PREVIEW_PORT || 4177);
const mock = `<script>const demoState=${JSON.stringify(fixture)};globalThis.chrome={tabs:{query:async()=>[{id:1}],sendMessage:(id,m,cb)=>cb({isChat:true,groupId:'demo',accountUsername:'linjian'}),create:async()=>{}},runtime:{sendMessage:async m=>{if(m.action==='FOLLOW')demoState.groups[0].users.find(u=>u.id===m.userId).following=true;return{ok:true,state:structuredClone(demoState)}}},storage:{local:{get:async()=>JSON.parse(localStorage.getItem('uiPrefs')||'{}'),set:async p=>localStorage.setItem('uiPrefs',JSON.stringify(p))},onChanged:{addListener(){}}}};</script>`;
createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!/^\/(popup|shared)\/[a-zA-Z0-9.-]+$/.test(path)) { res.writeHead(404).end(); return; }
    let data = await readFile(new URL(path.slice(1), root));
    if (path.endsWith('.html')) data = data.toString().replace('<body>', '<body>' + mock);
    res.setHeader('Content-Type', path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : 'text/html');
    res.end(data);
  } catch { res.writeHead(404).end(); }
}).listen(previewPort, '127.0.0.1', () => console.log('Fixture preview port:',previewPort));
