// Local UI test harness. Native response fixtures; no X writes or real login cookies.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {parseRecentPosts} from '../src/background/recent-posts.js';
const payload=JSON.parse(await readFile(new URL('../tests/fixtures/recent-posts-member-native-2026-10-07.json',import.meta.url)));
const posts=parseRecentPosts(payload,'580706651','knowhunters',20);
const script=await readFile(new URL('../src/content/profile-posts.js',import.meta.url),'utf8');
const html=`<!doctype html><meta charset="utf-8"><title>CircleMate 资料卡交互本地测试</title><style>body{font:14px system-ui;background:#f5f8fa;padding:40px}</style><h1>资料卡交互 · 本地测试</h1><p>真实公开帖子响应样本，操作不写入 X。</p><div data-testid="xchatEmbedRoute"></div><script>
const host=document.querySelector('[data-testid=xchatEmbedRoute]');const root=host.attachShadow({mode:'open'});root.innerHTML='<div role="presentation" data-open data-side="bottom" style="margin-left:400px;width:300px"><div data-base-ui-focusable style="background:white;color:#0f1419;border:1px solid #cfd9de;border-radius:12px;padding:16px"><a href="/knowhunters">知识猎人</a><p>@knowhunters</p><p>原生群成员悬浮结构的本地样本</p></div></div>';
window.CircleMate={rosterRoots:()=>[document,root]};const posts=${JSON.stringify(posts)};let calls=0;window.chrome={runtime:{sendMessage:async m=>{calls++;if(m.action==='POSTS_LIKE'){const p=posts.find(p=>p.id===m.tweetId);if(p){p.liked=m.liked;p.likes+=m.liked?1:-1;}}return {ok:true,accountId:'1',username:'knowhunters',userId:'580706651',at:Date.now(),posts:structuredClone(posts)};}}};window.testCallCount=()=>calls;
</script><script>${script}</script>`;
createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Set-Cookie','twid=u%3D1; SameSite=Lax; Path=/');res.end(html);}).listen(4184,'127.0.0.1',()=>console.log('Profile post fixture http://127.0.0.1:4184/i/chat/g123/info'));
