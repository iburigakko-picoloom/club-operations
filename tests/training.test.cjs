const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const D=require('../web/domain.js'),source=fs.readFileSync('web/app.js','utf8');
function fn(name,end){const start=source.indexOf('function '+name+'(');return source.slice(start,source.indexOf(end,start));}
const sheet=()=>({id:'sh',title:'練習',patterns:[4,5],rows:[{name:'ノック',seconds:60,requiresSets:true,sets:{4:5,5:4}},{name:'休憩',seconds:120,requiresSets:false,sets:{}}],context:{date:'2026-09-10',venue:'大学体育館',participants:20,courts:5}});
function harness(){const text=[],c={fillText:s=>text.push(s),fillRect(){},strokeRect(){},measureText:s=>({width:String(s).length*22})};const ctx={D,practiceDraft:sheet(),esc:s=>s,shell:(a,b,html)=>html,sessionInfo:()=>sheet().context,sessionSummary:()=> '大学体育館 / 20人',action:(act,label,attrs='',cls='')=>`<button data-act="${act}" class="${cls}" ${attrs}>${label}</button>`,setsControl:()=>'',imageCanvas:(w,h)=>[{width:w,height:h},c],jpDate:s=>s,timeSummary:t=>t.patterns.map(p=>p+'人：'+D.secondsText(t.totals[p].seconds)).join(' / ')};vm.createContext(ctx);vm.runInContext(fn('renderPracticeSets','\nrenderPracticeSaved=')+fn('drawTraining','\nfunction trainingHistoryItem'),ctx);return{ctx,text};}
test('set screen supports inline pattern selection, fixed duration and aggregate warnings',()=>{
 const {ctx}=harness();let html=ctx.renderPracticeSets();assert.equal((html.match(/data-act="practice-pattern-toggle"/g)||[]).length,5);assert.match(html,/name="practiceImageTime"/);assert.match(html,/大学体育館/);assert.match(html,/once-pill">2分/);assert.doesNotMatch(html,/1回のみ/);
 ctx.practiceDraft.patterns=[];html=ctx.renderPracticeSets();assert.match(html,/人数を1つ以上/);assert.match(html,/data-act="practice-preview"[^>]*disabled/);
});
test('image time switch, fixed duration and old snapshots render without mutation',()=>{
 const {ctx,text}=harness(),s=sheet(),original=JSON.stringify(s);ctx.drawTraining(s);assert.ok(text.some(t=>t.includes('× 5set')));assert.ok(text.includes('2分'));assert.ok(text.some(t=>t.includes('大学体育館')));assert.ok(!text.includes('1回'));assert.equal(JSON.stringify(s),original);
 text.length=0;s.showImageTime=false;ctx.drawTraining(s);assert.ok(text.includes('5 set'));assert.ok(!text.some(t=>t.includes('×')));assert.ok(text.includes('2分'));
});
test('single person image and long titles are bounded',()=>{
 const {ctx,text}=harness(),s=sheet();s.patterns=[1];s.title='長い名前'.repeat(60);s.rows[0].sets[1]=4;const cv=ctx.drawTraining(s);assert.equal(cv.width,1080);assert.ok(text.includes('セット数 4 set'));assert.ok(text.some(t=>t.endsWith('…')));assert.ok(cv.height>=860);
});
test('saved sheets keep image preference and independent row snapshots through reload',()=>{
 let saved;const draft=sheet();draft.showImageTime=false;const ctx={D,state:{training:{sheets:[]},currentUser:'u'},clone:structuredClone,persist:()=>{saved=JSON.stringify(ctx.state);}};vm.createContext(ctx);vm.runInContext(fn('saveSheet','\n'),ctx);ctx.saveSheet(draft);draft.rows[0].seconds=999;const loaded=JSON.parse(saved);assert.equal(loaded.training.sheets[0].showImageTime,false);assert.equal(loaded.training.sheets[0].rows[0].seconds,60);assert.equal(loaded.training.sheets[0].context.venue,'大学体育館');
});
test('inline pattern changes preserve prior counts and cap comparison at two',()=>{
 const ctx={practiceDraft:sheet(),d:{pattern:'4'},render(){}};vm.createContext(ctx);const start=source.indexOf("case'practice-pattern-toggle':");const body=source.slice(start,source.indexOf("case'practice-patterns':",start));const click=p=>{ctx.d.pattern=String(p);vm.runInContext("switch('practice-pattern-toggle'){"+body+'}',ctx);};
 click(4);click(5);assert.equal(ctx.practiceDraft.patterns.length,0);click(4);assert.equal(ctx.practiceDraft.rows[0].sets[4],5);click(1);assert.equal(ctx.practiceDraft.rows[0].sets[1],1);click(2);assert.equal(ctx.practiceDraft.patterns.length,2);assert.ok(!ctx.practiceDraft.patterns.includes(2));
});
