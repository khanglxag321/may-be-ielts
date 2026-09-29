/* Static, read-only snapshot. No Google account, API key or remote document request. */
(() => {
  const dialog = document.getElementById('feedbackDialog');
  const heading = document.getElementById('feedbackTitle');
  const home = document.getElementById('cvHome');
  const reader = document.getElementById('cvReader');
  const paper = document.getElementById('cvPaper');
  const notes = document.getElementById('cvNotes');
  const status = document.getElementById('cvStatus');
  let samples, current, lastChoice;
  new ResizeObserver(entries=>{
    dialog.style.setProperty('--cv-header-height',entries[0].target.getBoundingClientRect().height+'px');
  }).observe(dialog.querySelector('.privilege-dialog-head'));
  const el = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  const teacher = s => `${s.theme === 'nhi' ? 'Cô' : 'Thầy'} ${s.teacher}`;
  async function load() {
    if (samples) return samples;
    const response = await fetch('assets/correction-samples.json');
    if (!response.ok) throw new Error('Không tải được bài mẫu.');
    samples = await response.json();
    return samples;
  }
  function selectNote(id, fromText = true) {
    const note = document.getElementById(`cv-note-${id}`);
    if (!note) return;
    dialog.querySelectorAll('.cv-active').forEach(n => n.classList.remove('cv-active'));
    note.classList.add('cv-active');
    note.open = true;
    paper.querySelectorAll('[data-note]').forEach(n => {
      if (n.dataset.note.split(' ').includes(id)) n.classList.add('cv-active');
    });
    if (fromText) {
      if (window.matchMedia('(min-width: 801px)').matches) {
        notes.scrollTop += note.getBoundingClientRect().top - notes.getBoundingClientRect().top - 2;
      } else {
        note.scrollIntoView({block:'start',behavior:'auto'});
      }
      note.querySelector('summary').focus({preventScroll:true});
    } else {
      const anchor = [...paper.querySelectorAll('[data-note]')].find(n => n.dataset.note.split(' ').includes(id));
      if (anchor) { anchor.scrollIntoView({block:'center',behavior:'auto'}); anchor.focus({preventScroll:true}); }
    }
  }
  function render(s) {
    current = s;
    dialog.classList.add('cv-document-mode');
    reader.className = `cv-theme-${s.theme}`;
    heading.textContent = `${teacher(s)} · Writing Task ${s.task}`;
    document.getElementById('cvFontLabel').textContent = (s.paragraphs.flatMap(p=>p.runs).find(r=>r.style?.fontFamily)?.style.fontFamily || 'Arial') + ' ▾';
    document.getElementById('cvReaderTitle').textContent = `${s.comments.length} nhận xét · bản chấm chữa gốc`;
    paper.replaceChildren(); notes.replaceChildren();
    for (const p of s.paragraphs) {
      const paragraph = el('p',undefined,p.heading && p.heading !== 'NORMAL_TEXT' ? 'cv-heading' : '');
      if(p.align) paragraph.style.textAlign=p.align.toLowerCase().replace('justified','justify').replace('start','left').replace('end','right');
      for (const r of p.runs) {
        if (r.image) {
          const image = el('img'); image.src = r.image; image.alt = `Biểu đồ đề Writing Task ${s.task} — ${teacher(s)}`;
          image.loading = 'lazy'; paragraph.append(image); continue;
        }
        const end = r.start + r.text.length;
        const cuts = new Set([r.start,end]);
        for (const c of s.comments) if(c.start < end && c.end > r.start) { cuts.add(Math.max(c.start,r.start)); cuts.add(Math.min(c.end,end)); }
        const points = [...cuts].sort((a,b)=>a-b);
        for(let j=0;j<points.length-1;j++) {
          const start = points[j], stop = points[j+1];
          const cs = s.comments.filter(c=>c.start < stop && c.end > start);
          const n = el('span',r.text.slice(start-r.start,stop-r.start));
          if(r.style?.bold) n.style.fontWeight = '700';
          if(r.style?.italic) n.style.fontStyle = 'italic';
          if(r.style?.fontFamily) n.style.fontFamily = '"' + r.style.fontFamily.replace(/["\\]/g,'') + '", Arial, sans-serif';
          if(r.style?.fontSize) n.style.fontSize = r.style.fontSize + 'pt';
          if(r.style?.background && !cs.length) {const bg=r.style.background;n.style.backgroundColor=`rgb(${[bg.red||0,bg.green||0,bg.blue||0].map(v=>Math.round(v*255)).join(',')})`;}
          const decorations = [];
          if(r.style?.underline) decorations.push('underline');
          if(r.style?.strikethrough) decorations.push('line-through');
          if(decorations.length) n.style.textDecoration = decorations.join(' ');
          if(r.style?.color && !r.insert.length && !r.delete.length) {
            const rgb=r.style.color; n.style.color=`rgb(${[rgb.red||0,rgb.green||0,rgb.blue||0].map(v=>Math.round(v*255)).join(',')})`;
          }
          if(r.insert.length) { n.classList.add('cv-add'); n.title='Đề xuất thêm từ bản gốc'; }
          if(r.delete.length) { n.classList.add('cv-delete'); n.title='Đề xuất xóa từ bản gốc'; }
          if(cs.length) {
            n.classList.add('cv-anchor'); n.dataset.note = cs.map(c=>c.id).join(' ');
            n.tabIndex=0; n.setAttribute('role','button'); n.setAttribute('aria-label',`Xem nhận xét ${s.comments.indexOf(cs[0])+1}: ${n.textContent}`);
            n.title = 'Bấm để đọc nhận xét';
            n.addEventListener('click',()=>selectNote(cs[0].id));
            n.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNote(cs[0].id);}});
          }
          paragraph.append(n);
        }
      }
      paper.append(paragraph);
    }
    s.comments.forEach((c,i)=>{
      const box=el('details',undefined,'cv-note'); box.id=`cv-note-${c.id}`; box.open=true;
      const summary=el('summary',`${String(i+1).padStart(2,'0')} · ${teacher(s)}${c.resolved?' · Đã giải quyết':''}`);
      summary.dataset.initial=s.teacher.charAt(0);
      const quote=el('details',undefined,'cv-quote');
      quote.append(el('summary','Đoạn được nhận xét'),el('blockquote',c.quote));
      box.append(summary,quote,el('div',c.content,'cv-note-body'));
      for(const r of c.replies||[]) box.append(el('div',r.content,'cv-note-body cv-note-reply'));
      const jump=el('button','↖ Xem đoạn được nhận xét');jump.type='button';jump.addEventListener('click',()=>selectNote(c.id,false));box.append(jump);
      notes.append(box);
    });
    home.hidden=true;reader.hidden=false;dialog.scrollTop=0;
    document.getElementById('cvBack').focus({preventScroll:true});
  }
  async function init() {
    try {
      const data = await load();
      const grid = document.getElementById('cvTeachers');grid.replaceChildren();
      ['bach','nhi','khang'].forEach((theme,i)=>{
        const pair=data.filter(s=>s.theme===theme), card=el('article',undefined,`cv-teacher cv-theme-${theme}`);
        card.append(el('span',`0${i+1} / GIÁO VIÊN`,'cv-kicker'),el('h3',teacher(pair[0])));
        pair.forEach(s=>{
          const button=el('button',undefined,'cv-choice');button.type='button';
          button.append(el('strong',`Writing Task ${s.task} ↗`),el('small',`${s.comments.length} nhận xét · bấm để đọc bài`));
          button.addEventListener('click',()=>{lastChoice=button;render(s);});card.append(button);
        });grid.append(card);
      }); status.textContent='';
    } catch(e) { status.textContent='Chưa tải được bài mẫu. Em vui lòng thử lại.';const retry=el('button','Thử lại');retry.type='button';retry.addEventListener('click',init);status.append(retry); }
  }
  function showChooser() {
    dialog.classList.remove('cv-document-mode');
    reader.hidden=true;home.hidden=false;heading.textContent='Xem cách giáo viên chấm chữa bài';dialog.scrollTop=0;lastChoice?.focus();
  }
  document.getElementById('cvBack').addEventListener('click',showChooser);
  dialog.addEventListener('cancel',event=>{
    if(!reader.hidden){event.preventDefault();showChooser();}
  });
  document.getElementById('cvAllNotes').addEventListener('click',()=>{
    if(current?.comments.length) selectNote(current.comments[0].id);
  });
  let started=false;
  document.querySelector('[data-privilege-open="feedbackDialog"]').addEventListener('click',()=>{if(!started){started=true;init();}});
})();
