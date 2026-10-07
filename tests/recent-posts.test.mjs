import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseRecentPosts} from '../src/background/recent-posts.js';
const tweet=(id,time,extra={})=>({__typename:'Tweet',rest_id:id,core:{user_results:{result:{rest_id:'7',core:{screen_name:'alice'}}}},legacy:{user_id_str:'7',full_text:'正文 <script>',created_at:time,favorited:false,favorite_count:0,reply_count:2,...extra}});
const entry=t=>({content:{itemContent:{tweet_results:{result:t}}}});
const response=entries=>({data:{user:{result:{rest_id:'7',timeline:{timeline:{instructions:[{type:'TimelineAddEntries',entries}]}}}}}});
test('recent authored posts sort by publication, deduplicate and never collect quoted content',()=>{
 const older=tweet('10','2026-10-01');older.quoted_status_result={result:tweet('99','2026-10-07')};
 const newer=tweet('11','2026-10-06');
 const r=parseRecentPosts(response([entry(older),entry(newer),entry(newer),entry(tweet('12','2026-10-05',{user_id_str:'8'}))]),'7','Alice');
 assert.deepEqual(r.map(p=>p.id),['11','10']);assert.equal(r[0].likes,0);assert.equal(r[0].liked,false);assert.equal(r[0].url,'https://x.com/alice/status/11');
});
test('cursor, promotion, retweets, unavailable and malformed tweet entries are skipped',()=>{
 const ad=entry(tweet('20','2026-10-02'));ad.content.itemContent.promotedMetadata={};
 const r=parseRecentPosts(response([ad,entry(tweet('21','2026-10-03',{retweeted_status_result:{result:tweet('22','2026-10-01')}})),{content:{cursorType:'Bottom',value:'cursor'}},entry({__typename:'TweetUnavailable'}),entry(tweet('23','bad date'))]),'7','alice');assert.deepEqual(r,[]);
});
test('visibility wrapper and module posts are supported, missing state stays unknown',()=>{
 const t=tweet('30','2026-10-06',{favorited:undefined,favorite_count:undefined});t.note_tweet={note_tweet_results:{result:{text:'完整长文'}}};
 const payload=response([{content:{items:[{item:{itemContent:{tweet_results:{result:{__typename:'TweetWithVisibilityResults',tweet:t}}}}}]}}]);
 const [p]=parseRecentPosts(payload,'7','alice');assert.equal(p.text,'完整长文');assert.equal(p.liked,null);assert.equal(p.likes,null);
});
test('wrong owner and unknown response schema fail rather than appearing empty',()=>{
 assert.throws(()=>parseRecentPosts(response([]),'8','alice'),/不匹配/);
 assert.throws(()=>parseRecentPosts({data:{user:{result:{__typename:'UserUnavailable'}}}},'7','alice'),/不可用/);
 assert.throws(()=>parseRecentPosts({data:{user:{result:{}}}},'7','alice'),/结构/);
 assert.throws(()=>parseRecentPosts({errors:[{message:'limited'}]},'7','alice'),/未返回/);
});
import {readFile} from 'node:fs/promises';
test('native 2026-10-07 response yields authored originals in publication order',async()=>{
 const payload=JSON.parse(await readFile(new URL('./fixtures/recent-posts-native-2026-10-07.json',import.meta.url)));
 const posts=parseRecentPosts(payload,'1638101918869524482','jiaoxiawo');
 assert.equal(posts[0].id,'2107288027710308376');assert.equal(posts[1].id,'2107285421222928664');assert.equal(posts[2].id,'1638107334219276291');
 assert.equal(posts[0].likes,0);assert.equal(posts[0].liked,false);assert.equal(posts[0].hasMedia,true);
});
test('second native member sample excludes old pinned article from latest three',async()=>{
 const payload=JSON.parse(await readFile(new URL('./fixtures/recent-posts-member-native-2026-10-07.json',import.meta.url)));
 const posts=parseRecentPosts(payload,'580706651','knowhunters');
 assert.deepEqual(posts.map(p=>p.id),['2106224569686368292','2105949907903484183','2105852104967643372']);
 assert.ok(!posts.some(p=>p.id==='2096818185270182362'));
});
test('X text entities render as text, including arrows, without recursive HTML decoding',()=>{
 const [p]=parseRecentPosts(response([entry(tweet('44','2026-10-07',{full_text:'A -&gt; B &amp; C &lt;script&gt; &#39; &amp;lt;'}))]),'7','alice');
 assert.equal(p.text,"A -> B & C <script> ' &lt;");
});
