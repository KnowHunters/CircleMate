import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const context={CircleMate:{}};vm.createContext(context);vm.runInContext(await readFile(new URL('../src/popup/charts.js',import.meta.url),'utf8'),context);
const charts=context.CircleMate.charts,labels={creation:'Daily creation',views:'Views',posts:'Posts',replies:'Published replies'};
const from=Date.parse('2026-10-01T00:00:00Z'),base={from,to:from+3*86400000};

test('all metric comparisons handle missing, zero baseline and negative net consistently',()=>{
 assert.equal(charts.comparison(undefined,10).kind,'missing');
 assert.equal(charts.comparison(10,undefined).kind,'missing');
 assert.equal(charts.comparison(10,0).kind,'new');
 assert.equal(charts.comparison(-10,0).kind,'negative');
 assert.equal(charts.comparison(0,0).percent,0);
 assert.equal(charts.comparison(20,10).percent,100);
 assert.equal(charts.comparison(-5,-10).percent,50);
 assert.equal(charts.comparison(-15,-10).direction,'down');
});
test('daily charts preserve missing buckets and explicit zero, without connecting across absent dates',()=>{
 const a={...base,daily:{'2026-10-01':{Displayed:0},'2026-10-03':{Displayed:20}}};
 const rows=charts.days(a);assert.equal(rows.length,3);assert.equal(rows[1].values.Displayed,undefined);
 const svg=charts.chart(a,'views',labels);assert.equal((svg.match(/<circle/g)||[]).length,2);assert.ok(!svg.includes('class="chart-line"'));
 assert.ok(svg.includes('Views: 0'));assert.equal(charts.chart(base,'views',labels),'');
});
test('creation bars use published reply events, rather than received replies',()=>{
 const svg=charts.chart({...base,daily:{'2026-10-01':{TweetCreate:2,ReplyCreate:3,Reply:900}}},'creation',labels);
 assert.ok(svg.includes('Posts: 2'));assert.ok(svg.includes('Published replies: 3'));assert.ok(!svg.includes('900'));
});
test('comparison and net followers preserve unknown values; selectable trends use the chosen metric',()=>{
 assert.equal(charts.net({Follow:20,Unfollow:3}),17);assert.equal(charts.net({Follow:20}),null);
 assert.equal(charts.change(20,10),100);assert.equal(charts.change(20,0),null);assert.equal(charts.change(0,0),0);
 assert.equal(charts.format(13100),'13.1K');assert.equal(charts.format(2000000),'2M');
 const data={from:Date.UTC(2026,9,1),to:Date.UTC(2026,9,2),daily:{'2026-10-01':{Fav:7}}};
 assert.ok(charts.chart(data,'views',{views:'Likes'},'Fav').includes('Likes: 7'));
 assert.equal(charts.chart(data,'views',{views:'Views'}),'');
});
