import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const html=`<!doctype html><html><meta charset="utf-8"><body style="margin:0;background:#eef1f3;font:16px system-ui"><h2 style="margin:32px">浮动面板测试（模拟数据）</h2><button id="peer-toggle">展开 / 收起 XClearReply 示例面板</button><div id="xclearreply-widget" style="position:fixed;right:16px;bottom:18px;width:52px;height:52px"></div><script>
window.chrome={runtime:{id:'fixture',getURL:p=>new URL(p||'/','http://127.0.0.1:4186').href}};
const peer=document.getElementById('xclearreply-widget').attachShadow({mode:'open'});
peer.innerHTML='<style>.panel{display:none;position:fixed;right:16px;top:16px;width:390px;height:480px;background:white;border:1px solid #ddd;border-radius:18px}.panel.open{display:block}button{width:52px;height:52px;border-radius:16px}</style><div class="panel">XClearReply 示例面板</div><button title="XClearReply">盾</button>';
document.getElementById('peer-toggle').onclick=()=>peer.querySelector('.panel').classList.toggle('open');
</script><script src="/panel.js"></script></body></html>`;
createServer(async(req,res)=>{res.setHeader('Content-Type',req.url==='/panel.js'?'text/javascript':'text/html');res.end(req.url==='/panel.js'?await readFile(new URL('../src/content/panel.js',import.meta.url)):html);}).listen(4187,'127.0.0.1',()=>console.log('Panel fixture: http://127.0.0.1:4187'));
