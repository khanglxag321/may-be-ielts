(function (root) {
  'use strict';
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  // Keep existing class numbers stable while allowing six teaching tracks.
  const numbers = {bach:[1,12,13,14,15,16], nhi:[2,3,4,5,10,11], khang:[6,7,8,9,17,18]};
  const speakingNumbers = [0,2,3,4,5,6];
  function parse(code) {
    const match = String(code || '').trim().match(/^MB(Write(\d{2})(\+)?|Speak(\d{2})?)\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})$/i);
    if (!match) return null;
    return {program:/^Speak/i.test(match[1])?'speak':'write', number:Number(match[2] || match[4] || 0), plus:!!match[3], month:`20${match[6]}-${String(months.indexOf(match[5].toUpperCase())+1).padStart(2,'0')}`};
  }
  function make(teacher, program, number, month) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) return '';
    if (program === 'speak' && (teacher !== 'bach' || !speakingNumbers.includes(Number(number)))) return '';
    if (program !== 'speak' && !numbers[teacher]?.includes(Number(number))) return '';
    const suffix = months[Number(month.slice(5))-1].toLowerCase() + month.slice(2,4);
    return program === 'speak' ? `MBSpeak${Number(number)?String(number).padStart(2,'0'):''} ${suffix}` : `MBWrite${String(number).padStart(2,'0')}${teacher==='bach'?'+':''} ${suffix}`;
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
  const tuitionEffectiveMonth = '2026-12';
  function money(amount) {return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g,'.');}
  function tuitionPolicy(teacherId,program,month) {
    if(program!=='write'||!numbers[teacherId]||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'')||month<tuitionEffectiveMonth)return null;
    const lowest=teacherId==='bach'?6500000:6000000;
    return {lowest,middle:lowest+500000,original:lowest+1000000,effectiveMonth:tuitionEffectiveMonth};
  }
  function tuitionFees(item,month=parse(item.code)?.month||item.cohort||String(item.start||'').slice(0,7)) {
    const policy=tuitionPolicy(item.teacher,item.program,month);
    return policy?{promoFee:money(policy.lowest),fullFee:money(policy.original)}:{promoFee:item.promoFee,fullFee:item.fullFee};
  }
  // Keep the public site's established cutover dates in one shared function.
  function tuitionCutovers(startIso,classCode='') {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(startIso||''))return null;
    const start=new Date(startIso+'T00:00:00Z');
    if(!Number.isFinite(start.getTime())||start.toISOString().slice(0,10)!==startIso)return null;
    const day=start.getUTCDate(),info=parse(classCode);
    const policy=day>=7&&day<=12?'early':day>=18&&day<=24?'late':info?(info.number>=2&&info.number<=5?'early':'late'):(day<=14||day>=25?'early':'late');
    let year=start.getUTCFullYear(),month=start.getUTCMonth();
    if(info){year=Number(info.month.slice(0,4));month=Number(info.month.slice(5))-1;}
    else if(policy==='early'&&day>=25){month++;if(month>11){month=0;year++;}}
    const iso=(y,m,d)=>new Date(Date.UTC(y,m,d)).toISOString().slice(0,10);
    return policy==='early'?{policy,middleStartIso:iso(year,month-1,20),fullStartIso:iso(year,month,1)}:{policy,middleStartIso:iso(year,month,1),fullStartIso:iso(year,month,10)};
  }
  function tuitionPlan(startIso,classCode,lowestValue,originalValue,today='') {
    const cutovers=tuitionCutovers(startIso,classCode),amount=value=>Number(String(value||'').replace(/\D/g,''))||0;
    const lowest=amount(lowestValue),original=amount(originalValue);
    if(!cutovers||!lowest||!original)return null;
    const previous=iso=>{const value=new Date(iso+'T00:00:00Z');value.setUTCDate(value.getUTCDate()-1);return value.toISOString().slice(0,10);};
    return {...cutovers,earlyIso:previous(cutovers.middleStartIso),promotionIso:previous(cutovers.fullStartIso),lowest,middle:Math.round(((lowest+original)/2)/100000)*100000,original,active:today<cutovers.middleStartIso?0:today<cutovers.fullStartIso?1:2};
  }
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
    const validDays=normalizedDays(days);
    if(!Number.isFinite(day.getTime())||!validDays.length)return '';
    do {day.setUTCDate(day.getUTCDate()+1);}while(!validDays.includes(day.getUTCDay()));
    return day.toISOString().slice(0,10);
  }
  function lessonEnd(start,days,count) {
    if(!Number.isFinite(Number(count))||Number(count)<1||!normalizedDays(days).length)return '';
    let result=start;
    for(let i=1;i<count;i++)result=nextLesson(result,days);
    return result;
  }
  function normalizedDays(days) {return [...new Set((Array.isArray(days)?days:[]).map(Number).filter(day=>Number.isInteger(day)&&day>=0&&day<=6))].sort((a,b)=>a-b);}
  function timeRange(time) {
    const match=String(time||'').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
    if(!match)return null;
    const period=String(match[5]||'').toUpperCase();
    const minutes=(hour,minute)=>{let value=Number(hour);if(period)value=value%12+(period==='PM'?12:0);return value*60+Number(minute||0);};
    const result=[minutes(match[1],match[2]),minutes(match[3],match[4])];
    return result[0]>=0&&result[1]<=1440&&result[0]<result[1]?result:null;
  }
  function sameSlot(a,b) {
    const left=timeRange(a.time),right=timeRange(b.time);
    return normalizedDays(a.days).join(',')===normalizedDays(b.days).join(',')&&
      (left&&right?left[0]===right[0]&&left[1]===right[1]:a.time===b.time);
  }
  function slotsOverlap(a,b) {
    if(!normalizedDays(a.days).some(day=>normalizedDays(b.days).includes(day)))return false;
    const left=timeRange(a.time),right=timeRange(b.time);
    // An unrecognized time cannot safely be treated as a free teaching window.
    return !left||!right||left[0]<right[1]&&right[0]<left[1];
  }
  function itemsOverlap(a,b) {return a.teacher===b.teacher&&a.start<=b.end&&a.end>=b.start&&slotsOverlap(a,b);}
  function firstLessonOnOrAfter(iso,days) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso||'')||!normalizedDays(days).length)return '';
    const previous=new Date(iso+'T00:00:00Z');
    previous.setUTCDate(previous.getUTCDate()-1);
    return nextLesson(previous.toISOString().slice(0,10),normalizedDays(days));
  }
  function slotLabel(slot) {return `${slot.dayLabel||normalizedDays(slot.days).map(day=>day===0?'Chủ nhật':`Thứ ${day+1}`).join('+')} · ${slot.time}`;}
  function slotCovered(items,slot,from,to) {
    for(let lesson=firstLessonOnOrAfter(from,slot.days);lesson&&lesson<=to;lesson=nextLesson(lesson,slot.days)) {
      if(!items.some(item=>sameSlot(item,slot)&&item.start<=lesson&&item.end>=lesson))return false;
    }
    return true;
  }
  function monthlyPlan(items,teacherId,month,buffer=2,today='') {
    const target=6,result={teacher:teacherId,month,target,existingCount:0,existingCoveredCount:0,coveredCount:0,plannedCount:0,candidates:[],slots:[],unmet:[],targetReached:false};
    if(!numbers[teacherId]||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month||'')) {
      result.unmet.push('Hãy chọn giáo viên và tháng hợp lệ.');return result;
    }
    const monthStart=month+'-01',monthEnd=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
    const floor=today&&today>monthStart?today:monthStart;
    if(floor>monthEnd){result.unmet.push('Tháng đã qua; không tự tạo lớp có ngày khai giảng trong quá khứ.');return result;}
    const bufferSessions=Math.min(3,Math.max(2,Math.trunc(Number(buffer)||2)));
    const records=items.filter(item=>item.teacher===teacherId&&item.start&&item.end&&item.start<=item.end&&normalizedDays(item.days).length);
    const active=records.filter(item=>item.start<=monthEnd&&item.end>=floor);
    const slots=[];
    const addSlot=item=>{
      if(slots.length>=target||!timeRange(item.time)||!allowedSlot(teacherId,normalizedDays(item.days),item.time))return;
      const slot={days:normalizedDays(item.days),time:item.time,program:item.program==='speak'&&teacherId==='bach'?'speak':'write',dayLabel:item.dayLabel,suggestedSlot:teacherId!=='khang'&&!item.code};
      if(slots.some(other=>slotsOverlap(slot,other)))return;
      if(!slot.dayLabel)slot.dayLabel=slot.days.map(day=>day===0?'Chủ nhật':`Thứ ${day+1}`).join('+');
      slots.push(slot);
    };
    if(teacherId==='khang')fixedKhangSlots.forEach(addSlot);
    else {
      // Prefer the teacher's real timetable before suggesting any vacant frame.
      [...active].sort((a,b)=>b.start.localeCompare(a.start)).forEach(addSlot);
      [...records].sort((a,b)=>b.end.localeCompare(a.end)).forEach(addSlot);
      fixedKhangSlots.forEach(addSlot);
      ['2–4PM','4–6PM','6–8PM','8–10PM'].forEach(time=>[[1,4],[2,5],[3,6]].forEach(days=>addSlot({days,time})));
    }
    const used=new Set(records.map(item=>normalizeCode(item.code).toLowerCase()));
    const combined=[...records];
    for(const slot of slots) {
      const matching=records.filter(item=>sameSlot(item,slot));
      const slotResult={...slot,existing:matching.filter(item=>item.start<=monthEnd&&item.end>=floor),existingCovered:slotCovered(records,slot,floor,monthEnd),candidates:[],covered:false};
      result.slots.push(slotResult);
      if(slotResult.existing.length)result.existingCount++;
      if(slotResult.existingCovered)result.existingCoveredCount++;
      let cursor=firstLessonOnOrAfter(floor,slot.days),attempts=0;
      while(cursor&&cursor<=monthEnd&&attempts++<40) {
        const current=combined.filter(item=>sameSlot(item,slot)&&item.start<=cursor&&item.end>=cursor).sort((a,b)=>b.end.localeCompare(a.end))[0];
        if(current){cursor=nextLesson(current.end,slot.days);continue;}
        const source=[...matching].filter(item=>item.end<cursor).sort((a,b)=>b.end.localeCompare(a.end))[0]||null;
        const program=source?.program==='speak'&&teacherId==='bach'?'speak':slot.program;
        const requestedSessions=Number(source?.sessions),sessions=Number.isFinite(requestedSessions)&&requestedSessions>0?Math.trunc(requestedSessions):(program==='speak'?6:15);
        const candidate={teacher:teacherId,program,days:[...slot.days],dayLabel:slot.dayLabel,time:slot.time,sessions,bufferSessions,start:cursor,end:lessonEnd(cursor,slot.days,sessions+bufferSessions),students:0,capacity:teacherId==='khang'?15:20,source,suggestedSlot:slot.suggestedSlot,reason:source&&nextLesson(source.end,slot.days)===cursor?'successor':'vacant',fullFee:source?.fullFee||(program==='speak'?'5.000.000':'6.000.000'),promoFee:source?.promoFee||(program==='speak'?'3.500.000':'5.000.000')};
        const conflict=combined.filter(other=>itemsOverlap(candidate,other)).sort((a,b)=>a.start.localeCompare(b.start))[0];
        if(conflict) {
          result.unmet.push(`${slotLabel(slot)}: khoảng trống từ ${cursor} không đủ ${sessions+bufferSessions} buổi trước lớp ${normalizeCode(conflict.code)} (${conflict.start}–${conflict.end}).`);
          cursor=nextLesson(conflict.end,slot.days);continue;
        }
        const pool=program==='speak'?speakingNumbers:numbers[teacherId],old=parse(source?.code);
        const preferred=old&&old.program===program&&pool.includes(old.number)?old.number:pool[0];
        const code=[preferred,...pool.filter(number=>number!==preferred)].map(number=>make(teacherId,program,number,month)).find(value=>value&&!used.has(value.toLowerCase()));
        if(!code){result.unmet.push(`${slotLabel(slot)}: đã dùng hết mã lớp ${program==='speak'?'Speaking':'Writing'} của đợt ${month}.`);break;}
        candidate.code=code;Object.assign(candidate,tuitionFees(candidate,month));used.add(code.toLowerCase());combined.push(candidate);result.candidates.push(candidate);slotResult.candidates.push(candidate);
        cursor=nextLesson(candidate.end,slot.days);
      }
      // Count tracks, not the number of old/new cohorts touching the month.
      slotResult.covered=slotCovered(combined,slot,floor,monthEnd);
      if(slotResult.covered)result.coveredCount++;
    }
    if(slots.length<target)result.unmet.push(`Chỉ tìm được ${slots.length}/${target} khung giờ phù hợp; hãy bổ sung khung giờ dạy.`);
    result.candidates.sort((a,b)=>a.start.localeCompare(b.start)||a.time.localeCompare(b.time)||a.days.join(',').localeCompare(b.days.join(',')));
    result.plannedCount=result.candidates.length;
    result.targetReached=result.coveredCount===target;
    return result;
  }
  function continuationCandidates(items,teacherId,month,buffer=2,today='') {
    const candidates=items.filter(item=>item.teacher===teacherId&&item.program==='write'&&item.end&&allowedSlot(teacherId,item.days,item.time)).map(source=>{
      const start=nextLesson(source.end,source.days);
      return {source,start,end:lessonEnd(start,source.days,source.sessions+buffer)};
    }).filter(item=>item.start.startsWith(month)&&(!today||item.start>=today)).filter(candidate=>
      !items.some(other=>other!==candidate.source&&itemsOverlap({...candidate.source,start:candidate.start,end:candidate.end},other))
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
  const api={months,numbers,speakingNumbers,parse,make,validate,teacher,date,cohort,tuitionEffectiveMonth,tuitionPolicy,tuitionFees,tuitionCutovers,tuitionPlan,available,visible,fixedKhangSlots,allowedSlot,nextLesson,lessonEnd,monthlyPlan,timeRange,sameSlot,slotsOverlap,itemsOverlap,continuationCandidates,normalizeCode,codeMarkup,dateMarkup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MaybeSchedule=api;
})(typeof globalThis!=='undefined'?globalThis:this);
