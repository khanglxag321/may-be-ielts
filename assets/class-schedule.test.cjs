const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const S=require('./class-schedule.js');
assert.equal(S.make('bach','write',1,'2026-11'),'MBWrite01+ NOV26');
assert.equal(S.make('khang','write',9,'2027-01'),'MBWrite09 JAN27');
assert.equal(S.make('nhi','write',2,'2026-10'),'MBWrite02 OCT26');
assert.equal(S.make('bach','speak',0,'2026-10'),'MBSpeak OCT26');
assert(S.validate('nhi','speak','MBSpeak OCT26'));
assert(S.validate('nhi','write','MBWrite06 OCT26'));
assert.equal(S.validate('bach','write','MBWrite01+ oct26'),'');
assert.equal(S.date('06.01','2026-11'),'2027-01-06');
assert.equal(S.date('28.10','2026-11'),'2026-10-28');
const full={MaLop:'MBWrite06 oct26',GiangVien:'Gia Khang',KhaiGiang:'15.10',TongSlot:8,HocVien:8};
const open={...full,MaLop:'MBWrite09 OCT26',HocVien:4};
assert.deepEqual(S.visible([full,open],'2026-10'),[full,open]);
assert.deepEqual(S.visible([full,open],'2027-03'),[full]);
const next={...open,MaLop:'MBWrite09 NOV26',KhaiGiang:'15.11'};
assert.deepEqual(S.visible([full,open,next],'2026-10'),[open,next]);
const badSpeak={...open,MaLop:'MBSpeak NOV26',GiangVien:'Tuệ Nhi'};
assert.deepEqual(S.visible([full,badSpeak],'2026-10'),[full]);
const speak={...badSpeak,GiangVien:'Hồ Bách'};
assert.deepEqual(S.visible([full,speak],'2026-10'),[speak]);
const old=(code,days,time,end,start='2026-09-01')=>({teacher:'khang',program:'write',code,days,time,start,end,sessions:15});
const schedule=[old('MBWrite90',[1,4],'8–10PM','2026-10-12'),old('MBWrite06 OCT26',[1,4],'8–10PM','2026-12-10','2026-10-15'),old('MBWrite98',[1,4],'2–4PM','2026-11-09'),old('MBWrite99',[3,6],'2–4PM','2026-11-14'),old('MBWrite08 OCT26',[2,5],'2–4PM','2026-11-27','2026-10-02')];
const november=S.continuationCandidates(schedule,'khang','2026-11',2,'2026-10-01');
assert.deepEqual(november.map(item=>item.start),['2026-11-12','2026-11-18']);
assert(!november.some(item=>item.source.code==='MBWrite90'),'already-replaced and October successors excluded');
assert(!november.some(item=>item.source.code==='MBWrite08 OCT26'),'December 1 is not a November opening');
assert.equal(S.continuationCandidates([...schedule,old('MBWrite06 NOV26',[1,4],'2–4PM','2027-01-07','2026-11-12')],'khang','2026-11',2).length,1);
assert(S.allowedSlot('khang',[3,6],'6–8PM'));
assert(!S.allowedSlot('khang',[3,6],'8–10PM'));
assert(S.allowedSlot('nhi',[3,6],'8–10PM'));
for(const file of ['index.html','team/admin.html','team/students.html','team/index.html']){
 const html=fs.readFileSync(file,'utf8');
 for(const [,attrs,body] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
  if(!/\bsrc=|application\/ld\+json/.test(attrs))new vm.Script(body,{filename:file});
 }
}
// Render production public table logic with a minimal DOM, checking registration.
const html=fs.readFileSync('index.html','utf8');
const nodes=Object.fromEntries(['course','tbody-foundation','tbody-master-write','tbody-speaking'].map(id=>[id,{innerHTML:'',children:[],appendChild(n){this.children.push(n)}}]));
const context={document:{getElementById:id=>nodes[id],createElement:()=>({}),querySelectorAll:()=>[]},parseSlotNumber:Number,buildTuitionPlan:()=>'',teacherFilterKey:S.teacher};
vm.createContext(context);
vm.runInContext(html.slice(html.indexOf('    function renderPublicTables'),html.indexOf('    // Tự động chạy khi website vừa load xong')),context);
context.renderPublicTables([full,open].map(row=>({...row,LichHoc:'Thứ 2 + 5 (8 - 10 PM)',KetThuc:'10.12'})));
assert(nodes['tbody-foundation'].innerHTML.includes('Full slot'));
assert.equal(nodes.course.children.length,1);
assert(nodes.course.children[0].value.includes('MBWrite09'));
console.log('PASS: naming, teacher ranges, Speaking restriction, year rollover, full-class retention/replacement, registration exclusion, inline JavaScript syntax');
