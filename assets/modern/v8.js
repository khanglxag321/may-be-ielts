(() => {
 const reduced=matchMedia('(prefers-reduced-motion:reduce)');
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}}),{threshold:.04,rootMargin:'0px 0px -12px 0px'});
 if(!reduced.matches)document.querySelectorAll('.section-heading,.feature-card,.teacher-recording-card,.lecturer-row,.hof-cat-card,.faq-item,.register-box').forEach((el,i)=>{el.classList.add('reveal');el.style.setProperty('--delay',(i%3)*55+'ms');observer.observe(el);});
 const progress=document.createElement('div');progress.className='scroll-progress';progress.setAttribute('aria-hidden','true');document.body.append(progress);
 const nav=document.querySelectorAll('.nav-links a[href^="#"]');let scrollFrame=false;
 function updateProgress(){scrollFrame=false;progress.style.setProperty('--progress',scrollY/Math.max(1,document.documentElement.scrollHeight-innerHeight));let id='hero';for(const s of document.querySelectorAll('section[id]'))if(s.getBoundingClientRect().top<innerHeight*.35)id=s.id;nav.forEach(a=>a.toggleAttribute('aria-current',a.hash==='#'+id));}
 addEventListener('scroll',()=>{if(!scrollFrame){scrollFrame=true;requestAnimationFrame(updateProgress);}}, {passive:true});updateProgress();
 const guide=document.getElementById('beeGuide'),audio=document.getElementById('beeGuideAudio'),world=document.getElementById('beeWorld');
 let launched=false,intro=false,ready=false,flightFrame=0,promptTimer=0,position={x:innerWidth/2,y:innerHeight/2,scale:1},lastState='',pending=['hello',null],tourToken=0,touring=false,mount=null,portalTransition=false,portalSequence=0,returning=false,scrollTick=0;
 let orbitEpoch=performance.now(),orbitBase={x:0,y:0},orbitLast=0,hoverPaused=false,touchTimer=0,touchedRecording=false;
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const ease=t=>t*t*t*(t*(t*6-15)+10);
 function avatarSize(){return guide.clientWidth||112;}
 function heroAnchor(){const live=window.beeWorld?.nhiAnchor?.();if(live)return live;const r=world.querySelector('.hero-pose-fallback')?.getBoundingClientRect();return r?{x:r.x+r.width/2,y:r.y+r.height/2,size:r.height*.82}:null;}
 function inView(el){if(!el?.isConnected)return false;const r=el.getBoundingClientRect();return r.bottom>110&&r.top<innerHeight-40&&r.width>0;}
 function closest(selector,root=document){return [...root.querySelectorAll(selector)].filter(inView).sort((a,b)=>Math.abs(a.getBoundingClientRect().top-innerHeight*.34)-Math.abs(b.getBoundingClientRect().top-innerHeight*.34))[0];}
 function isRecording(){return document.getElementById('recordingModal').style.display==='block';}
 function resolveFrame(state,target){
  if(isRecording())return innerWidth<=600?document.querySelector('.recording-guide-ledge'):document.querySelector('#recordingModal .recording-player');
  if(inView(target)&&!target.closest('#recordingModal'))return target.closest('.lecturer-row,.teacher-recording-card,.feature-card,.hof-cat-card,.faq-item,.register-box')||target;
  const s=getBeeReadingSection();if(!s)return null;
  const selectors={features:'.feature-card',recordings:'.teacher-recording-card',lecturers:'.lecturer-row',schedule:'.table-responsive,.schedule-filter-shell',halloffame:'.hof-cat-card',faq:'.faq-item',register:'.register-box'};
  return selectors[s.id]?closest(selectors[s.id],s):null;
 }
 function obstacles(root){
  const rects=[];
  const selector='.section-title,.section-subtitle,.feature-card h3,.feature-card p,.teacher-recording-card h3,.teacher-recording-card .aim,.lecturer-info h3,.lecturer-info p,.lecturer-score,.faq-question,.faq-answer-inner,.hof-cat-card h3,.hof-cat-card p,label,button,a.btn,input,select,video,iframe,.teacher-media img,.recording-mascot-v4 img,figcaption,th,td,.recording-conversion';
  for(const el of root.querySelectorAll(selector)){
   if(el.closest('#beeGuide')||!inView(el)||getComputedStyle(el).visibility==='hidden')continue;
   if(el.matches('button,a.btn,input,select,video,iframe,img,.recording-conversion'))rects.push(el.getBoundingClientRect());
   else{const range=document.createRange();range.selectNodeContents(el);rects.push(...range.getClientRects());}
  }
  return rects.filter(r=>r.width>0&&r.height>0);
 }
 function overlap(a,b){return Math.max(0,Math.min(a.right,b.right+4)-Math.max(a.left,b.left-4))*Math.max(0,Math.min(a.bottom,b.bottom+4)-Math.max(a.top,b.top-4));}
 function destination(state,target){
  const frame=resolveFrame(state,target),small=innerWidth<=600,size=small?94:112;
  if(isRecording()&&small){const r=frame.getBoundingClientRect();return {x:clamp(r.right-48,size/2+24,innerWidth-size/2-24),y:r.top+r.height*.52,size,scale:1,frame,kind:'hover',facing:1,orbitX:10,orbitY:6,slot:'video-below'};}
  const section=frame?.closest('section')||getBeeReadingSection(),root=isRecording()?document.getElementById('recordingModal'):(section||document),r=frame?.getBoundingClientRect();
  const sides={hero:'right',features:'right',recordings:'left',lecturers:'right',schedule:'left',halloffame:'right',faq:'left',register:'right'};
  const preferred=isRecording()?'right':(frame?.dataset.beeGuideSide||sides[section?.id]||'right');
  const aim=r?{x:r.left+r.width*.5,y:clamp(r.top+r.height*.28,150,innerHeight-140)}:{x:innerWidth*.5,y:innerHeight*.5};
  const candidates=[];
  const add=(x,y,side,slot,orbitX=small?10:28,orbitY=small?7:12)=>candidates.push({x,y,side,slot,orbitX,orbitY});
  if(r){
   const y=clamp(r.top+Math.min(130,r.height*.30),160,innerHeight-130);
   const gap=small?10:28;
   add(r.right+size*.5+gap+14,y,'right','right');add(r.left-size*.5-gap-14,y,'left','left');
   add(r.right-size*.48,r.top+size*.29,'right','corner-right');add(r.left+size*.48,r.top+size*.29,'left','corner-left');
   add(r.right-size*.50,r.top-size*.54-16,'right','above-right');add(r.left+size*.50,r.top-size*.54-16,'left','above-left');
   add(r.right-size*.50,r.bottom+size*.54+14,'right','below-right');add(r.left+size*.50,r.bottom+size*.54+14,'left','below-left');
  }
  const container=section?.querySelector('.container')?.getBoundingClientRect(),heading=section?.querySelector('.section-heading')?.getBoundingClientRect();
  if(container&&heading){add(container.right-size*.65,heading.top+size*.65,'right','heading-right',small?10:36);add(container.left+size*.65,heading.top+size*.65,'left','heading-left',small?10:36);}
  const gutter=small?size/2+20:size/2+26;
  add(innerWidth-gutter,clamp(aim.y,190,innerHeight-150),'right','page-right',small?8:14,small?9:18);
  add(gutter,clamp(aim.y,190,innerHeight-150),'left','page-left',small?8:14,small?9:18);
  const blocks=obstacles(root),topLimit=small?126:138;
  for(const c of candidates){
   const padX=size*.5+c.orbitX+12,padY=size*.5+c.orbitY;
   const rawX=c.x,rawY=c.y;c.x=clamp(c.x,padX,innerWidth-padX);c.y=clamp(c.y,topLimit+padY,innerHeight-padY-48);
   const box={left:c.x-size*.43-c.orbitX,right:c.x+size*.43+c.orbitX,top:c.y-size*.43-c.orbitY,bottom:c.y+size*.43+c.orbitY};
   const ink=blocks.reduce((sum,b)=>sum+overlap(box,b),0)/(size*size);
   c.score=ink*2000+Math.hypot(c.x-aim.x,c.y-aim.y)*.045+(c.side===preferred?0:24)+Math.hypot(c.x-rawX,c.y-rawY)*.12;
  }
  const chosen=candidates.sort((a,b)=>a.score-b.score)[0];
  return {...chosen,size,scale:1,frame,kind:'hover',facing:aim.x<chosen.x?1:-1};
 }
 function captionLayout(){
  if(guide.classList.contains('is-flying'))return;const r=guide.getBoundingClientRect();
  const prompt=document.getElementById('beeGuidePrompt'),pw=Math.min(innerWidth<=600?252:264,innerWidth-26),left=clamp(r.right-pw,13,innerWidth-pw-13)-r.left;
  prompt.style.left=left+'px';prompt.style.right='auto';const dismiss=guide.querySelector('.bee-prompt-dismiss');dismiss.style.left=(left+pw-30)+'px';dismiss.style.right='auto';guide.dataset.caption=r.top<180?'below':'above';
  const panel=document.getElementById('beeGuidePanel'),panelWidth=Math.min(328,innerWidth-26);panel.style.left=(clamp(r.right-panelWidth,13,innerWidth-panelWidth-13)-r.left)+'px';panel.style.right='auto';
 }
 function draw(p,tilt=0){
  position={x:p.x,y:p.y,scale:p.scale};const size=avatarSize();guide.style.transform=`translate3d(${p.x-size/2}px,${p.y-size/2}px,0) scale(${p.scale})`;guide.style.setProperty('--flight-tilt',tilt+'deg');
  if(mount){
   const facing=mount.facing||1,shoulder={x:p.x+(facing===1?.355-.5:.645-.5)*size,y:p.y+(.625-.5)*size},r=mount.frame?.getBoundingClientRect();
   const target={x:r?r.left+r.width*.47:p.x-70,y:r?r.top+Math.min(90,r.height*.35):p.y+70};
   window.beeGuidePose={...window.beeGuidePose,facing,mount:mount.kind,pointAngle:(Math.atan2(target.y-shoulder.y,(target.x-shoulder.x)*facing)-Math.atan2(.36-.625,.14-.355))*180/Math.PI};
  }
 }
 function hidePrompt(){guide.classList.remove('has-prompt');document.getElementById('beeGuidePrompt').setAttribute('aria-hidden','true');}
 function showPrompt(){
  if(guide.classList.contains('is-open')||isRecording())return;captionLayout();
  const g=guide.getBoundingClientRect(),w=Math.min(innerWidth<=600?252:264,innerWidth-26),x=clamp(g.right-w,13,innerWidth-w-13),y=guide.dataset.caption==='below'?g.bottom+6:g.top-87;
  const root=mount?.frame?.closest('section')||getBeeReadingSection()||document;
  if(obstacles(root).some(r=>overlap({left:x,top:y,right:x+w,bottom:y+84},r)>0))return;
  guide.classList.add('has-prompt');document.getElementById('beeGuidePrompt').setAttribute('aria-hidden','false');clearTimeout(promptTimer);promptTimer=setTimeout(hidePrompt,5500);
 }
 function gesture(name){if(guide.dataset.gesture===name)return;guide.dataset.gesture=name;window.beeGuidePose={...window.beeGuidePose,gesture:name};}
 function adopt(to){guide.style.width=to.size+'px';guide.style.height=to.size+'px';mount=to;guide.dataset.mount=to.kind;guide.dataset.slot=to.slot||'home';guide.dataset.anchorTarget=to.frame?.className||'none';window.beeGuidePose={...window.beeGuidePose,mount:to.kind,facing:to.facing};}
 function startOrbit(to){orbitBase={x:to.x,y:to.y};orbitEpoch=performance.now();gesture(to.frame?'point':'glide');}
 function fly(to,{duration=1500,jump=false,complete}={}){
  cancelAnimationFrame(flightFrame);clearTimeout(touchTimer);hidePrompt();guide.classList.add('is-flying');guide.dataset.flight=jump?'launch':'section';gesture('fly');adopt(to);
  const finish=()=>{guide.classList.remove('is-flying');guide.dataset.flight='landed';startOrbit(to);captionLayout();showPrompt();complete?.();requestAnimationFrame(updateAttachment);};
  if(reduced.matches){draw(to);finish();return;}
  const from={...position},start=performance.now(),dx=to.x-from.x,dy=to.y-from.y,curve=Math.min(jump?170:95,40+Math.hypot(dx,dy)*.12),side=dx<0?-1:1;
  const c1={x:from.x+dx*.25-side*curve*.35,y:from.y+dy*.12-curve},c2={x:to.x-dx*.18+side*curve*.24,y:to.y-dy*.20-curve*.65};
  function frame(now){
   const progress=clamp((now-start)/duration,0,1),t=ease(progress),u=1-t,arc=Math.sin(Math.PI*t);
   const point={x:u*u*u*from.x+3*u*u*t*c1.x+3*u*t*t*c2.x+t*t*t*to.x,y:u*u*u*from.y+3*u*u*t*c1.y+3*u*t*t*c2.y+t*t*t*to.y,scale:from.scale+(to.scale-from.scale)*t+arc*.045};
   point.x=clamp(point.x,avatarSize()*point.scale*.35,innerWidth-avatarSize()*point.scale*.35);point.y=Math.max(100,point.y);
   draw(point,side*Math.sin(progress*Math.PI*2)*7);
   if(progress<1)flightFrame=requestAnimationFrame(frame);else finish();
  }flightFrame=requestAnimationFrame(frame);
 }
 function orbit(now){
  requestAnimationFrame(orbit);const dt=now-orbitLast;if(dt<32)return;orbitLast=now;
  if(!launched||intro||returning||portalTransition||document.hidden||guide.classList.contains('is-open')||guide.classList.contains('is-flying')||mount?.kind!=='hover')return;
  if(reduced.matches){draw({...mount,scale:1});captionLayout();return;}
  if(hoverPaused){captionLayout();return;}
  const follow=1-Math.exp(-Math.min(dt,80)/145);orbitBase.x+=(mount.x-orbitBase.x)*follow;orbitBase.y+=(mount.y-orbitBase.y)*follow;
  const age=(now-orbitEpoch)/1000,phase=age*Math.PI*2/10.5,quiet=guide.classList.contains('has-prompt')?.55:1;
  draw({x:orbitBase.x+Math.sin(phase)*(mount.orbitX||18)*quiet,y:orbitBase.y+Math.sin(phase*2)*(mount.orbitY||10)*quiet,scale:1+Math.sin(phase)*.012},Math.sin(phase)*2.8);
  const beat=age%14;gesture(mount.frame&&beat<2.8?'point':beat>10.5&&beat<12.4?'wave':'glide');
  if(guide.classList.contains('has-prompt'))captionLayout();
 }
 requestAnimationFrame(orbit);
 function pauseHover(){hoverPaused=true;}
 function resumeHover(){hoverPaused=false;orbitBase={x:position.x,y:position.y};orbitEpoch=performance.now();}
 guide.addEventListener('pointerenter',pauseHover);guide.addEventListener('pointerleave',resumeHover);guide.addEventListener('focusin',pauseHover);guide.addEventListener('focusout',resumeHover);
 typeBeeGuidePrompt=function(text){clearTimeout(beeGuideTypeTimer);document.getElementById('beeGuidePrompt').textContent=String(text||'');guide.classList.remove('is-typing');};
 moveBeeGuideForState=function(state,target){
  pending=[state,target];if(!launched||intro||portalTransition||returning||guide.classList.contains('is-flying'))return;
  const changed=state!==lastState;lastState=state;guide.dataset.context=state;if(guide.classList.contains('is-open'))return;
  const to=destination(state,target);if(changed||to.frame!==mount?.frame||to.slot!==mount?.slot)fly(to);else adopt(to);
 };
 const originalToggle=toggleBeeGuide;
 toggleBeeGuide=function(force,manual=false){
  if((force===true||force===undefined)&&!launched)launch();originalToggle(force,manual);
  if(guide.classList.contains('is-open')){cancelAnimationFrame(flightFrame);clearTimeout(touchTimer);intro=false;returning=false;guide.classList.remove('is-flying');hidePrompt();gesture('wave');mount=null;guide.dataset.panel='above';const size=avatarSize();draw({x:innerWidth-size/2-12,y:innerHeight-size/2-50,scale:1});captionLayout();}
  else if(launched)moveBeeGuideForState(...pending);
 };
 function launch(){
  if(launched||returning)return;launched=true;intro=true;guide.classList.add('is-launched');const to=destination(...pending);adopt(to);
  const anchor=heroAnchor(),inHero=anchor&&anchor.y>100&&anchor.y<innerHeight;
  if(inHero)draw({x:anchor.x,y:anchor.y,scale:anchor.size/avatarSize()*1.17});else draw({x:innerWidth/2,y:145,scale:1.18});
  window.beeWorld?.depart?.();world.dataset.nhiDeparted='true';if(typeof window.beeWorld?.depart!=='function')world.querySelector('.hero-pose-fallback')?.classList.add('has-departed');
  fly(to,{duration:inHero?2300:1500,jump:!!inHero,complete:()=>{intro=false;lastState=pending[0];guide.dataset.context=lastState;updateAttachment();}});
 }
 function returnHome(){
  const anchor=heroAnchor();if(!launched||returning||!anchor||isRecording()||touring)return;returning=true;intro=true;hidePrompt();
  fly({x:anchor.x,y:anchor.y,scale:anchor.size/avatarSize()*1.17,size:avatarSize(),frame:null,kind:'home',facing:1},{duration:1100,complete:()=>{window.beeWorld?.return?.();world.dataset.nhiDeparted='false';world.querySelector('.hero-pose-fallback')?.classList.remove('has-departed');guide.classList.remove('is-launched','is-flying','has-prompt');launched=false;intro=false;returning=false;lastState='';mount=null;guide.dataset.flight='home';gesture('wave');if(scrollY>50)requestAnimationFrame(updateAttachment);}});
 }
 function updateAttachment(){
  if(scrollY>50&&!launched&&ready)launch();else if(scrollY<24&&launched&&!intro&&!guide.classList.contains('is-open'))returnHome();
  if(!launched||intro||returning||portalTransition||guide.classList.contains('is-open')||guide.classList.contains('is-flying')||mount?.kind==='side')return;
  lastState=pending[0];guide.dataset.context=lastState;const to=destination(...pending);
  if(to.frame!==mount?.frame||to.slot!==mount?.slot||Math.hypot(to.x-position.x,to.y-position.y)>210)fly(to,{duration:1450});else adopt(to);
 }
 function scrollFollow(){hidePrompt();if(scrollTick)cancelAnimationFrame(scrollTick);scrollTick=requestAnimationFrame(()=>{scrollTick=0;updateAttachment();});}
 addEventListener('bee-world-ready',()=>{ready=true;if(launched){window.beeWorld?.depart?.();return;}guide.dataset.flight='home';if(scrollY>50)launch();},{once:true});
 addEventListener('scroll',scrollFollow,{passive:true});document.getElementById('recordingModal').addEventListener('scroll',scrollFollow,{passive:true});
 addEventListener('resize',()=>{if(launched&&!intro)updateAttachment();},{passive:true});
 addEventListener('bee-greet-team',()=>{if(launched&&!intro)fly(destination(...pending),{duration:1500,jump:true});});
 guide.querySelector('.bee-prompt-dismiss').addEventListener('click',hidePrompt);
 const originalOpenRecording=openRecording,originalCloseRecording=closeRecording;
 openRecording=function(teacher){
  if(touring)stopTour();const sequence=++portalSequence;portalTransition=true;originalOpenRecording(teacher);intro=false;returning=false;
  if(!launched){launched=true;guide.classList.add('is-launched');const start=heroAnchor();if(start)draw({x:clamp(start.x,100,innerWidth-100),y:clamp(start.y,150,innerHeight-100),scale:1});window.beeWorld?.depart?.();world.dataset.nhiDeparted='true';if(typeof window.beeWorld?.depart!=='function')world.querySelector('.hero-pose-fallback')?.classList.add('has-departed');}
  cancelAnimationFrame(flightFrame);clearTimeout(touchTimer);guide.classList.remove('is-flying','is-front','is-portal-arriving');hidePrompt();
  setTimeout(()=>{
   if(sequence!==portalSequence)return;if(!isRecording()){portalTransition=false;return;}
   guide.classList.add('is-front','is-portal-arriving');guide.dataset.layer='foreground';portalTransition=false;
   const hover=destination(...pending),player=document.querySelector('#recordingModal .recording-player'),r=player.getBoundingClientRect();
   const canTouch=!touchedRecording&&!reduced.matches&&innerWidth>600&&innerWidth-r.right>hover.size*.94;
   if(canTouch){
    touchedRecording=true;const touch={...hover,x:r.right+hover.size*.404,y:clamp(r.top+115,180,innerHeight-160)-hover.size*.07,kind:'side',facing:1,slot:'brief-touch'};
    fly(touch,{duration:1450,complete:()=>{gesture('lean');touchTimer=setTimeout(()=>{if(sequence===portalSequence&&isRecording())fly(destination(...pending),{duration:1000,complete:()=>guide.classList.remove('is-portal-arriving')});},850);}});
   }else fly(hover,{duration:1500,complete:()=>{guide.classList.remove('is-portal-arriving');guide.dataset.context=pending[0];}});
  },reduced.matches?0:180);
 };
 closeRecording=function(){
  portalSequence++;portalTransition=true;clearTimeout(touchTimer);guide.classList.remove('is-front','is-portal-arriving');guide.dataset.layer='page';originalCloseRecording();portalTransition=false;
  if(launched)fly(destination(...pending),{duration:1450,complete:()=>updateAttachment()});
 };
 window.beeGuideStage={metrics(){const r=guide.getBoundingClientRect();return {launched,frame:mount?.frame?.className,gesture:guide.dataset.gesture,mount:mount?.kind,slot:mount?.slot,orbit:mount?{x:mount.orbitX,y:mount.orbitY}:null,carrier:{x:r.x,y:r.y,width:r.width,height:r.height},foreground:guide.classList.contains('is-front')};}};

 async function playHello(){
  if(audio&&!audio.paused){beeVoiceEnabled=false;stopBeeVoice();saveBeeVoicePreference();updateBeeVoiceUi();return;}
  await window.connectNhiAudio?.();beeVoiceEnabled=true;beeVoiceUnlocked=true;saveBeeVoicePreference();activateBeeGuide('hello',false,null,{voice:false});beePlayedVoiceTracks.delete(BEE_VOICE_TRACKS.hello);clearTimeout(beeVoicePendingTimer);playBeeVoiceForState('hello',BEE_GUIDE_STATES.hello.prompt);window.beeWorld?.greet?.();
 }
 document.getElementById('heroNhiIntro').addEventListener('click',playHello);
 document.getElementById('beeGuideVoiceToggle').addEventListener('click',()=>window.connectNhiAudio?.());
 document.getElementById('beeGuideToggle').addEventListener('click',()=>window.connectNhiAudio?.());
 document.addEventListener('pointerdown',()=>{if(beeVoiceEnabled)window.connectNhiAudio?.();},{once:true,passive:true});
 ['playing','ended','pause'].forEach(event=>audio.addEventListener(event,()=>{const playing=!audio.paused&&!audio.ended;const button=document.getElementById('heroNhiIntro');button.classList.toggle('is-playing',playing);button.setAttribute('aria-pressed',String(playing));}));
 const tourStart=document.getElementById('beeTourStart'),tourStop=document.getElementById('beeTourStop');
 function stopTour(){tourToken++;touring=false;tourStop.hidden=true;tourStart.innerHTML='Dẫn mình đi <span>↗</span>';guide.dataset.tour='stopped';}
 tourStop.addEventListener('click',()=>{stopTour();stopBeeVoice();});
 const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 tourStart.addEventListener('click',async()=>{
  if(touring){stopTour();return;}await window.connectNhiAudio?.();beeVoiceEnabled=true;beeVoiceUnlocked=true;updateBeeVoiceUi();
  touring=true;const token=++tourToken;tourStop.hidden=false;tourStart.textContent='Đang dẫn đường…';guide.dataset.tour='playing';toggleBeeGuide(false);
  for(const [id,state] of [['features','features'],['recordings','recordings'],['lecturers','lecturers'],['schedule','schedule'],['halloffame','halloffame'],['faq','faq'],['register','register']]){
   if(token!==tourToken)break;
   document.getElementById(id).scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});await delay(reduced.matches?100:950);
   if(token!==tourToken)break;
   beePlayedVoiceTracks.delete(BEE_VOICE_TRACKS[state]);activateBeeGuide(state,false);guide.dataset.tourSection=id;
   await delay(6500);const deadline=performance.now()+38000;while(token===tourToken&&!audio.paused&&performance.now()<deadline)await delay(300);
  }
  if(token===tourToken)stopTour();
 });
 addEventListener('wheel',()=>{if(touring)stopTour();},{passive:true});addEventListener('touchstart',e=>{if(touring&&!e.target.closest('#beeGuide'))stopTour();},{passive:true});
 addEventListener('keydown',e=>{if(touring&&['Escape','ArrowDown','ArrowUp','PageDown','PageUp','Home','End'].includes(e.key))stopTour();});
 // Muted, looping previews behave like the original TikTok cards. Start on view;
 // resume when revisiting a teacher, without interrupting Bee Nhi's narration.
 const teacherStreams=[...document.querySelectorAll('video.teacher-preview-stream')];
 const visibleStreams=new Set();
 function playTeacherPreview(video){if(document.hidden||!visibleStreams.has(video))return;video.muted=true;video.play().catch(()=>{});}
 const videos=new IntersectionObserver(entries=>entries.forEach(entry=>{
  if(entry.isIntersecting){visibleStreams.add(entry.target);playTeacherPreview(entry.target);}
  else{visibleStreams.delete(entry.target);entry.target.pause();}
 }),{threshold:.02});
 teacherStreams.forEach(video=>{video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;videos.observe(video);video.addEventListener('loadeddata',()=>playTeacherPreview(video));});
 document.addEventListener('visibilitychange',()=>{
  if(document.hidden){document.querySelectorAll('video').forEach(v=>v.pause());if(touring)stopTour();}
  else visibleStreams.forEach(playTeacherPreview);
 });

 document.querySelectorAll('.hof-cat-card').forEach(card=>{card.setAttribute('role','button');card.tabIndex=0;card.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();card.click();}});});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(document.getElementById('mediaModal').style.display==='block')closeModal();if(document.getElementById('recordingModal').style.display==='block')closeRecording();toggleBeeGuide(false,true);hidePrompt();}});
})();
