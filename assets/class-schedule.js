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
    const suffix = months[Number(month.slice(5))-1] + month.slice(2,4);
    return program === 'speak' ? `MBSpeak ${suffix}` : `MBWrite${String(number).padStart(2,'0')}${teacher==='bach'?'+':''} ${suffix}`;
  }
  function validate(teacher, program, code) {
    if (program === 'speak' && teacher !== 'bach') return 'Lớp Speaking chỉ do thầy Hồ Bách phụ trách.';
    const info = parse(code);
    if (!info || info.program !== program || make(teacher,program,info.number,info.month).toLowerCase() !== code.trim().toLowerCase()) return 'Mã lớp cần đúng số của giáo viên và đuôi đợt tuyển sinh, ví dụ MBWrite06 NOV26.';
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
  const api={months,numbers,parse,make,validate,teacher,date,cohort,available,visible};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MaybeSchedule=api;
})(typeof globalThis!=='undefined'?globalThis:this);
