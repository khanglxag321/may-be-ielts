(function (root) {
  'use strict';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const numbers = {bach:[1], nhi:[2,3,4,5], khang:[6,7,8,9]};
  function parse(code) {
    const match = String(code || '').trim().match(/^MB(Write(\d{2})(\+)?|Speak)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})$/i);
    if (!match) return null;
    return {program:/^Speak$/i.test(match[1])?'speak':'write', number:Number(match[2] || 0), plus:!!match[3], month:`20${match[5]}-${String(months.indexOf(match[4].toUpperCase())+1).padStart(2,'0')}`};
  }
  function make(teacher, program, number, month) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) return '';
    if (program === 'speak' && teacher !== 'bach') return '';
    if (program !== 'speak' && !numbers[teacher]?.includes(Number(number))) return '';
    const suffix = months[Number(month.slice(5))-1].toLowerCase() + month.slice(2,4);
    return program === 'speak' ? `MBSpeak ${suffix}` : `MBWrite${String(number).padStart(2,'0')}${teacher==='bach'?'+':''} ${suffix}`;
  }
  function validate(teacher, program, code) {
    if (program === 'speak' && teacher !== 'bach') return 'Lớp Speaking chỉ do thầy Hồ Bách phụ trách.';
    const info = parse(code);
    if (!info || info.program !== program || make(teacher,program,info.number,info.month).toLowerCase() !== code.trim().toLowerCase()) return 'Mã lớp cần đúng số của giáo viên và đuôi đợt tuyển sinh, ví dụ MBWrite06 nov26.';
    return '';
  }
  function teacher(name) {
    const text=String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    return ['bach','nhi','khang'].find(key=>text.includes(key)) || '';
  }
  function date(value, referenceMonth) {
    const text=String(value||'').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const match=text.match(/^(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?$/);
    if (!match) return '';
    let year=match[3]?Number(match[3].length===2?'20'+match[3]:match[3]):Number(referenceMonth.slice(0,4));
    const month=Number(match[2]), day=Number(match[1]);
    if (!match[3]) {const delta=month-Number(referenceMonth.slice(5,7));if(delta>6)year--;if(delta< -6)year++;}
    const check=new Date(Date.UTC(year,month-1,day));
    if(check.getUTCMonth()!==month-1||check.getUTCDate()!==day)return '';
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  function cohort(row, fallbackMonth) {return parse(row.MaLop)?.month || date(row.KhaiGiang,fallbackMonth).slice(0,7);}
  function available(row) {const n=v=>Number(String(v??'').replace(/[^\d-]/g,''))||0;return n(row.TongSlot)>n(row.HocVien);}
  function visible(rows, currentMonth) {
    const valid=rows.filter(row=>/^MBWrite/i.test(row.MaLop)||(/^MBSpeak/i.test(row.MaLop)&&teacher(row.GiangVien)==='bach'));
    const known=valid.map(row=>parse(row.MaLop)?.month).filter(Boolean).sort().at(-1)||currentMonth;
    const latest=valid.map(row=>cohort(row,known)).filter(Boolean).sort().at(-1);
    return valid.filter(row=>{
      const month=cohort(row,known);
      if (!month) return false;
      // A full cohort stays visible until a later cohort is actually published.
      return available(row) ? date(row.KhaiGiang,month)>=`${currentMonth}-01` : month===latest;
    });
  }
  const fixedKhangSlots=[
    {days:[1,4],time:'2–4PM'},{days:[2,5],time:'2–4PM'},{days:[3,6],time:'2–4PM'},
    {days:[1,4],time:'8–10PM'},{days:[2,5],time:'8–10PM'},{days:[3,6],time:'6–8PM'}
  ];
  function allowedSlot(teacherId,days,time) {
    return teacherId!=='khang'||fixedKhangSlots.some(slot=>slot.time===time&&slot.days.join(',')===days.join(','));
  }
  function nextLesson(end,days) {
    const day=new Date(end+'T00:00:00Z');
    if(!Number.isFinite(day.getTime())||!days.length)return '';
    do {day.setUTCDate(day.getUTCDate()+1);}while(!days.includes(day.getUTCDay()));
    return day.toISOString().slice(0,10);
  }
  function lessonEnd(start,days,count) {
    let result=start;
    for(let i=1;i<count;i++)result=nextLesson(result,days);
    return result;
  }
  function continuationCandidates(items,teacherId,month,buffer=2,today='') {
    const candidates=items.filter(item=>item.teacher===teacherId&&item.program==='write'&&item.end&&allowedSlot(teacherId,item.days,item.time)).map(source=>{
      const start=nextLesson(source.end,source.days);
      return {source,start,end:lessonEnd(start,source.days,source.sessions+buffer)};
    }).filter(item=>item.start.startsWith(month)&&(!today||item.start>=today)).filter(candidate=>
      !items.some(other=>other!==candidate.source&&other.teacher===teacherId&&other.time===candidate.source.time&&
        other.days.some(day=>candidate.source.days.includes(day))&&other.start<=candidate.end&&other.end>=candidate.start)
    ).sort((a,b)=>a.start.localeCompare(b.start)||a.source.time.localeCompare(b.source.time));
    // One successor per fixed teaching slot; existing future classes count as occupied.
    const seen=new Set();
    return candidates.filter(item=>{const key=item.source.days.join(',')+'|'+item.source.time;if(seen.has(key))return false;seen.add(key);return true;});
  }
  function normalizeCode(code) {return String(code||'').trim().replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)(\d{2})$/i,match=>match.toLowerCase());}
  function escapeHtml(value) {return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function codeMarkup(code) {
    const text=normalizeCode(code),info=parse(text);
    if(!info)return escapeHtml(text);
    const split=text.lastIndexOf(' '),month=Number(info.month.slice(5));
    return `<span class="schedule-code">${escapeHtml(text.slice(0,split))} <span class="cohort-tag cohort-${month}" title="Đợt tuyển sinh tháng ${month}/${info.month.slice(0,4)}">${text.slice(split+1)}</span></span>`;
  }
  function dateMarkup(value,referenceMonth) {
    const iso=date(value,referenceMonth);
    if(!iso)return escapeHtml(value)||'—';
    return `<time class="schedule-date" datetime="${iso}">${iso.slice(8)}.${iso.slice(5,7)}<span class="date-year">${iso.slice(0,4)}</span></time>`;
  }
  const api={months,numbers,parse,make,validate,teacher,date,cohort,available,visible,fixedKhangSlots,allowedSlot,nextLesson,lessonEnd,continuationCandidates,normalizeCode,codeMarkup,dateMarkup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MaybeSchedule=api;
})(typeof globalThis!=='undefined'?globalThis:this);
