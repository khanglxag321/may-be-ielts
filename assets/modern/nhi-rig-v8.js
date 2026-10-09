/* Web adaptation of the team's Bee Nhi layered acting rig.
   Uses the original head, torso and arm artwork with the original SVG face coordinates.
   Speech follows the actual audio envelope. No microphone or remote AI is used. */
(() => {
  const base = new URL('./nhi-rig/', document.currentScript.src);
  const clamp = (v, a=0, b=1) => Math.max(a, Math.min(b,v));
  const reduced = matchMedia('(prefers-reduced-motion:reduce)');
  const point = 'polygon(0% 27.34%,13.67% 27.34%,13.67% 34.77%,17.11% 37.97%,20.7% 40.47%,23.52% 43.52%,24.84% 46.02%,26.8% 47.5%,28.05% 49.22%,31.41% 52.58%,35% 55.94%,39.06% 58.05%,41.41% 61.33%,41.41% 65.23%,34.77% 69.53%,19.53% 67.97%,8.44% 57.27%,0% 49.92%)';
  const wave = 'polygon(8.2% 47.66%,10.16% 44.53%,12.11% 41.8%,14.84% 38.91%,18.36% 38.83%,21.09% 42.19%,23.98% 44.38%,25.47% 42.66%,27.58% 42.73%,27.81% 45.94%,26.48% 50.16%,28.59% 54.3%,32.66% 57.58%,38.67% 59.77%,40.47% 64.84%,36.56% 68.91%,28.91% 69.38%,22.27% 67.11%,18.36% 63.36%,16.17% 59.06%,15% 56.56%,12.11% 54.22%,8.59% 50.63%)';
  let controls = null, rigs = [], lookX = 0, lookY = 0, energy = 0, analyser = null, samples, context;
  const audio = document.getElementById('beeGuideAudio');
  const intro = document.getElementById('heroNhiIntro');
  function makeRig(el, index) {
    const uid = 'nhi-'+index;
    const img = (file, klass='rig-layer', extra='') => `<img src="${new URL(file+'.webp',base)}" class="${klass}" alt="" ${extra} draggable="false">`;
    el.innerHTML = `<div class="rig-body">
      <div class="rig-arm rig-point">${img('bee-point-base','rig-layer',`style="clip-path:${point}"`)}</div>
      <div class="rig-head">${img('bee-head')}
       <svg class="rig-face" viewBox="0 0 1280 1280" aria-hidden="true">
        <defs><linearGradient id="${uid}-eye" x2="1" y2="1"><stop stop-color="#34302D"/><stop offset="1" stop-color="#171D29"/></linearGradient><clipPath id="${uid}-mouth"><path class="mouth-clip"/></clipPath></defs>
        <g class="face-features">
         <ellipse cx="548" cy="697" rx="48" ry="20" fill="#FF6491" opacity=".12"/><ellipse cx="870" cy="684" rx="48" ry="20" fill="#FF6491" opacity=".12"/>
         ${[{x:591,y:604},{x:821,y:588}].map((p,i) => `<g class="eye-group eye-${i}"><g class="eye-open" transform="translate(${p.x} ${p.y})"><path d="${i?'M27 -27 Q43 -20 49 -32 M29 -12 Q48 -7 51 -18':'M-27 -27 Q-43 -20 -49 -32 M-29 -12 Q-48 -7 -51 -18'}" stroke="#252131" stroke-width="8" fill="none" stroke-linecap="round"/><rect x="-32" y="-62" width="64" height="124" rx="32" fill="url(#${uid}-eye)"/><ellipse cx="11" cy="-39" rx="9" ry="11" fill="#FFFAF0"/><ellipse cx="-10" cy="42" rx="8.5" ry="3.5" fill="#9BAAD0" opacity=".14"/></g><path class="eye-happy" d="M${p.x-30} ${p.y+6} C${p.x-20} ${p.y-6} ${p.x-16} ${p.y-13} ${p.x} ${p.y-13} C${p.x+16} ${p.y-13} ${p.x+20} ${p.y-6} ${p.x+30} ${p.y+6}" fill="none" stroke="#1B1E27" stroke-width="17" stroke-linecap="round" opacity="0"/></g><path class="brow brow-${i}" fill="none" stroke="#1B1E27" stroke-width="25" stroke-linecap="round"/>`).join('')}
         <g class="mouth-open"><path class="mouth-shape" fill="#19162A" stroke="#142238" stroke-width="5"/><g clip-path="url(#${uid}-mouth)"><ellipse cx="707" cy="700" rx="48" ry="25" fill="#472039" opacity=".55"/><path class="mouth-teeth" fill="#FFF9ED"/><ellipse class="mouth-tongue" cx="707" cy="682" rx="28" ry="12" fill="#F16483"/></g></g>
         <path class="mouth-closed" fill="none" stroke="#1B1E27" stroke-width="17" stroke-linecap="round"/>
         <g class="face-sparkle" fill="#FFD044"><path d="M446 535 L452 546 L463 552 L452 558 L446 569 L440 558 L429 552 L440 546Z"/><path d="M965 415 L971 433 L989 439 L971 445 L965 463 L959 445 L941 439 L959 433Z"/></g>
        </g>
       </svg>
      </div>
      ${img('bee-torso')}
      <div class="rig-arm rig-wave">${img('bee-wave-base','rig-layer',`style="clip-path:${wave}"`)}</div>
      <div class="rig-contact-sleeve rig-arm">${img('bee-wave-base','rig-layer','style="clip-path:polygon(19% 55%,28% 55%,31% 60%,35% 62%,42% 65%,38% 69%,30% 70%,25% 65%,21% 60%)"')}</div>
      <svg class="rig-grip-hand" viewBox="400 628 217 190" aria-hidden="true"><defs><clipPath id="${uid}-grip"><path d="M438 754C429 735 450 697 483 674C536 638 580 638 607 655C625 675 608 693 576 700C602 714 605 738 583 764C564 786 535 812 506 809C480 795 450 775 438 754Z"/></clipPath></defs><image href="${new URL('bee-thinking-base.webp',base)}" width="1280" height="1280" clip-path="url(#${uid}-grip)"/></svg>
     </div>`;
    const q = s => el.querySelector(s);
    return {el,body:q('.rig-body'),head:q('.rig-head'),point:q('.rig-point'),wave:q('.rig-wave'),sleeve:q('.rig-contact-sleeve'),grip:q('.rig-grip-hand'),eyes:[q('.eye-0'),q('.eye-1')],brows:[q('.brow-0'),q('.brow-1')],mouth:q('.mouth-open'),shape:q('.mouth-shape'),clip:q('.mouth-clip'),closed:q('.mouth-closed'),teeth:q('.mouth-teeth'),tongue:q('.mouth-tongue'),sparkle:q('.face-sparkle'),visible:true};
  }
  window.connectNhiAudio = async () => {
    try {
      if(!context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        context = new AudioContext();
        analyser = context.createAnalyser(); analyser.fftSize = 256;
        context.createMediaElementSource(audio).connect(analyser);
        analyser.connect(context.destination); samples = new Uint8Array(analyser.fftSize);
      }
      if(context.state === 'suspended') await context.resume();
    } catch(error) { console.info('Using fallback speech motion',error.message); }
  };
  const faceMap = {hello:'Friendly',curious:'Curious',excited:'Big_Smile',celebrate:'Tiny_Celebration',focused:'Focus'};
  let start = performance.now(), last = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    if(document.hidden || now-last<33 || !controls) return;
    last = now;
    const t = (now-start)/1000;
    const speaking = audio && !audio.paused && !audio.ended;
    if(speaking && analyser && samples) {
      analyser.getByteTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum,n)=>sum+((n-128)/128)**2,0)/samples.length);
      energy += (clamp(rms*5.5)-energy)*.6;
    } else energy += ((speaking ? (.2+.55*Math.abs(Math.sin(t*13)*Math.sin(t*7))) : 0)-energy)*.55;
    window.beeSpeechEnergy = energy;
    const expression = document.getElementById('beeGuide')?.dataset.expression || 'hello';
    const face = {...controls.defaults,...controls.faces[faceMap[expression] || 'Friendly']};
    const movement = reduced.matches ? 0 : 1;
    const phase = t%4.7, blink = phase>4.43 && phase<4.63 ? Math.sin((phase-4.43)/.2*Math.PI) : 0;
    const happy = clamp(((face['Happy Eyes'] || 0)-60)/25);
    const pose=window.beeGuidePose||{gesture:'wave',facing:1};
    const contact=pose.gesture==='grip'||pose.gesture==='lean';
    const lx = lookX*movement*(pose.facing||1), ly = lookY*movement;
    for(const rig of rigs) {
      if(!rig.visible) continue;
      rig.el.style.setProperty('--bee-facing',pose.facing||1);
      rig.body.style.transform = contact?'none':`translateY(${Math.sin(t*1.9)*.6*movement}%) rotate(${Math.sin(t*1.3)*.5*movement}deg)`;
      rig.head.style.transform = `perspective(1000px) rotateY(${lx*.12}deg) rotateX(${-ly*.05}deg) rotateZ(${(Math.sin(t*1.3)*.8+(pose.gesture==='lean'?3.5:0))*movement}deg)`;
      const waveWeight = !contact&&(pose.gesture==='wave'||pose.gesture==='fly'||pose.gesture==='glide') ? 1 : 0;
      rig.wave.style.opacity = waveWeight; rig.point.style.opacity = 1-waveWeight;
      if(contact)rig.point.style.opacity=0;
      rig.wave.style.transform = `rotate(${(pose.gesture==='glide'?-25+Math.sin(t*1.6)*1.5:Math.sin(t*6.5)*4)*movement}deg)`;
      rig.point.style.transform = `rotate(${(pose.pointAngle||0)+Math.sin(t*1.6)*.7*movement}deg)`;
      rig.sleeve.style.opacity=contact?1:0;rig.grip.style.opacity=contact?1:0;
      rig.sleeve.style.transform=`rotate(${pose.mount==='side'?-20:pose.mount==='hang'?45:-120}deg)`;
      const hand=pose.mount==='side'?{u:.16,v:.56}:pose.mount==='hang'?{u:.32,v:.445}:{u:.334,v:.81};
      rig.grip.style.left=(hand.u-.0875)*100+'%';rig.grip.style.top=(hand.v-.075)*100+'%';
      for(let i=0;i<2;i++) {
        const p = i ? {x:821,y:588,bx:800,by:478,angle:-28,side:'R'} : {x:591,y:604,bx:594,by:512,angle:13,side:'L'};
        const open = Math.max(.045,(face['Eye Open '+p.side] || 100)/100*(1-blink*movement)*(1-(face['Happy Eyes']||0)*.0097));
        const eye = rig.eyes[i].querySelector('.eye-open');
        eye.setAttribute('transform',`translate(${p.x+lx*.33} ${p.y+ly*.21}) scale(1 ${open})`);
        eye.setAttribute('opacity',1-happy);
        rig.eyes[i].querySelector('.eye-happy').setAttribute('opacity',happy);
        const a=(p.angle+(face['Brow Tilt '+p.side]||0))*Math.PI/180,dx=Math.cos(a)*27,dy=Math.sin(a)*27,by=p.by-(face['Brow Lift '+p.side]||0);
        rig.brows[i].setAttribute('d',`M${p.bx-dx} ${by-dy} Q${p.bx} ${by-(face['Brow Arch '+p.side]||0)*.28} ${p.bx+dx} ${by+dy}`);
      }
      // One continuous contour morphs from the native smile into speech.
      // No closed-mouth outline is composited over an open mouth.
      const opening=clamp((energy-.008)*1.85),smile=(face.Smile||60)*.34;
      const leftY=665,rightY=659,centerY=665+smile;
      const topY=centerY-opening*42,bottomY=centerY+opening*32;
      const topSideL=665+smile*.4-opening*19,topSideR=659+smile*.4-opening*19;
      const bottomSideL=665+smile*.4+opening*15,bottomSideR=659+smile*.4+opening*15;
      const d=`M665 ${leftY} C680 ${topSideL} 686 ${topY} 707 ${topY} C728 ${topY} 734 ${topSideR} 749 ${rightY} C734 ${bottomSideR} 728 ${bottomY} 707 ${bottomY} C686 ${bottomY} 680 ${bottomSideL} 665 ${leftY}Z`;
      rig.shape.setAttribute('d',d);rig.clip.setAttribute('d',d);
      rig.shape.setAttribute('stroke-width',17-opening*11);
      rig.teeth.setAttribute('d',`M681 ${topY-2} Q707 ${topY-10} 733 ${topY-3} L731 ${topY+5} Q707 ${topY+10} 684 ${topY+5}Z`);
      rig.teeth.setAttribute('opacity',clamp((opening-.10)*2));
      rig.tongue.setAttribute('cx',707);rig.tongue.setAttribute('cy',bottomY-7);
      rig.tongue.setAttribute('rx',24+opening*4);rig.tongue.setAttribute('opacity',clamp((opening-.15)*2));
      rig.mouth.setAttribute('opacity',1);rig.closed.setAttribute('opacity',0);

      rig.sparkle.setAttribute('opacity',(face.Sparkle||0)/100*(.72+Math.sin(t*4)*.28));
    }
  }
  document.addEventListener('pointermove',event => {lookX=clamp((event.clientX/innerWidth-.5)*100,-40,40);lookY=clamp((event.clientY/innerHeight-.5)*100,-30,30);},{passive:true});
  rigs = Array.from(document.querySelectorAll('.nhi-rig')).map(makeRig);
  const visibility = new IntersectionObserver(entries=>entries.forEach(entry=>{const rig=rigs.find(r=>r.el===entry.target);if(rig)rig.visible=entry.isIntersecting;}));
  rigs.forEach(r=>visibility.observe(r.el));
  fetch(new URL('controls.json',base)).then(r=>r.json()).then(library=>{controls=library;requestAnimationFrame(tick);}).catch(()=>{
    rigs.forEach(r=>r.el.innerHTML=`<img src="assets/modern/bee-nhi.webp" alt="Bee Nhi" style="width:100%;height:100%;object-fit:contain">`);
  });
  ['playing','pause','ended'].forEach(event=>audio?.addEventListener(event,()=>{
    intro?.classList.toggle('is-playing',!audio.paused && !audio.ended);
    intro?.setAttribute('aria-pressed',String(!audio.paused && !audio.ended));
  }));
})();
