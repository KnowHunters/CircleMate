import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
const source=await readFile(new URL('../src/content/content.js',import.meta.url),'utf8');
function button(label,href){return {getAttribute:()=>label,parentElement:{children:[{tagName:'A',getAttribute:()=>href}]}};}
async function run(isInfo){
  const calls=[];let tick;
  const window={top:{}};
  const context={window,URL,Set,setTimeout:fn=>{tick=fn;return 1;},clearTimeout(){},MutationObserver:class{observe(){}},
    document:{documentElement:{},querySelectorAll:()=>[button('更多 Member 的选项','https://x.com/Member'),button('More options for Other','https://x.com/Other'),button('更多','https://x.com/message_author'),button('更多 Fake 的选项','https://evil.example/fake')]},
    chrome:{runtime:{onMessage:{addListener(){}},async sendMessage(m){calls.push(m);return m.action==='FRAME_CONTEXT'?{groupId:'g1',isInfo}:{ok:true};}}}};
  vm.runInNewContext(source,context);tick();await new Promise(setImmediate);return calls;
}
test('opaque embedded member collector reads only explicit member rows',async()=>{
  const calls=await run(true);assert.equal(calls[1].action,'ROSTER_REFERENCES');
  assert.deepEqual(Array.from(calls[1].usernames),['member','other']);assert.equal(calls[1].groupId,'g1');
});
test('collector does not submit references outside group info',async()=>{
  const calls=await run(false);assert.equal(calls.length,1);
});
test('manifest includes origin fallback frames and no main-world fetch interception',async()=>{
  const manifest=JSON.parse(await readFile(new URL('../public/manifest.json',import.meta.url),'utf8'));
  assert.equal(manifest.content_scripts[0].all_frames,true);assert.equal(manifest.content_scripts[0].match_origin_as_fallback,true);
  assert.equal(manifest.content_scripts.some(c=>c.world==='MAIN'),false);
});
