import * as THREE from 'three';
import {GLTFLoader} from './vendor/loaders/GLTFLoader.js';
import {loadArtworkRelief} from './bee-artwork-relief.js';

// Closed 3D relief meshes retain the approved illustration as their front texture.
// The website uses a restrained viewing range: unseen sides are inferred volume.
const host=document.getElementById('beeWorld');
const reduced=matchMedia('(prefers-reduced-motion:reduce)');
const coarse=matchMedia('(pointer:coarse)');
const compactProfile=()=>innerWidth<=820||coarse.matches;
const members=[
 {key:'bach',color:0x4A8BFF,x:0,row:0},
 {key:'nhi',color:0xF782B0,x:3.1,row:1},
 {key:'khang',color:0x7FE0C2,x:-3.1,row:1},
 {key:'pu',color:0xFAACA5,x:-3.1,row:0},
 {key:'quynh-kem',color:0x8DBCE1,x:3.1,row:0},
 {key:'cici',color:0xF1D2E3,x:0,row:1}
];
const palette=members.map(member=>member.color);
const faceFragment=`
 uniform sampler2D artwork;uniform sampler2D faceArt;uniform float blankPose;uniform float animatedMouth;uniform float eyeOpen;uniform float speech;varying vec2 vUv;
 vec4 brandColor(vec2 p){
  vec4 c=texture2D(artwork,p);
  if(blankPose>.5&&p.x>.40&&p.x<.70&&p.y>.35&&p.y<.57){
   vec4 f=texture2D(faceArt,p);float dark=1.-smoothstep(.08,.25,max(f.r,max(f.g,f.b)));
   float pupil=0.;
   for(int i=0;i<2;i++){vec2 center=i==0?vec2(.472,.442):vec2(.652,.429);pupil=max(pupil,1.-smoothstep(.8,1.,length((p-center)/vec2(.009,.013))));}
   float zone=0.;
   if((abs(p.x-.462)<.040&&abs(p.y-.472)<.056)||(abs(p.x-.642)<.040&&abs(p.y-.459)<.056))zone=1.;
   if((p.x>.425&&p.x<.520&&p.y>.380&&p.y<.432)||(p.x>.595&&p.x<.685&&p.y>.355&&p.y<.418))zone=1.;
   // Nhi's clean face gets one deforming mouth, so no baked smile survives at its edges.
   if(animatedMouth<.5&&p.x>.505&&p.x<.606&&p.y>.497&&p.y<.557)zone=1.;
   c.rgb=mix(c.rgb,f.rgb,max(dark*zone,pupil));
  }return c;
 }
 void main(){
  vec4 color=brandColor(vUv);if(color.a<.035)discard;
  if(eyeOpen<.98){
   for(int i=0;i<2;i++){
    vec2 center=i==0?vec2(.462,.472):vec2(.642,.459);
    vec2 p=vUv-center;
    if(abs(p.x)<.027&&abs(p.y)<.061){
     float border=(1.-smoothstep(.054,.061,abs(p.y)))*(1.-smoothstep(.024,.027,abs(p.x)));
     vec2 sampleUv=vec2(vUv.x,center.y+p.y/max(.055,eyeOpen));
     vec3 skin=texture2D(artwork,vec2(center.x+(p.x<0.?-.044:.044),vUv.y)).rgb;
     vec3 eye=abs(p.y)>.057*eyeOpen?skin:brandColor(sampleUv).rgb;
     color.rgb=mix(color.rgb,eye,border);
    }
   }
  }
  if(animatedMouth>.5){
   vec2 p=vUv-vec2(.553,.518);
   if(abs(p.x)<.055&&abs(p.y)<.063){
    float opening=smoothstep(.008,.55,speech);
    float halfW=.033+opening*.007;
    float x=clamp(p.x,-halfW,halfW),n=x/halfW,arch=1.-n*n;
    float smile=.014*arch-.0025*n;
    float upper=smile-opening*.031*arch,lower=smile+opening*.023*arch;
    float y=clamp(p.y,upper,lower);
    float rim=.0055-opening*.002;
    float distance=length(vec2(p.x-x,p.y-y));
    float aa=max(fwidth(p.y)*.8,.00035);
    float shape=1.-smoothstep(rim-aa,rim+aa,distance);
    vec3 mouth=mix(vec3(.011,.009,.020),vec3(.022,.009,.025),smoothstep(upper,lower,p.y));
    // Rounded interior details share the same clipping contour; no separate jaw lines.
    float teeth=1.-smoothstep(.88,1.,length(vec2(p.x/(halfW*.69),(p.y-(upper+.0015))/.004)));
    float tongue=1.-smoothstep(.82,1.,length(vec2((p.x-.001)/(halfW*.54),(p.y-(lower-.003))/.007)));
    mouth=mix(mouth,vec3(.94,.90,.82),teeth*smoothstep(.18,.48,opening));
    mouth=mix(mouth,vec3(.80,.095,.20),tongue*smoothstep(.20,.55,opening));
    color.rgb=mix(color.rgb,mouth,shape);
   }
  }
  gl_FragColor=color;
  #include <colorspace_fragment>
 }`;


let renderer;
function fallback(){
 // Clear the same-named DOM global before the guide calls the optional scene API.
 window.beeWorld=null;window.beeWorldReady=true;
 host.classList.remove('is-ready');host.dataset.worldMode='fallback';
 host.querySelectorAll('[data-world-teacher]').forEach(label=>{label.style.removeProperty('left');label.style.removeProperty('top');});
 host.querySelector('.hero-pose-fallback')?.classList.toggle('has-departed',host.dataset.nhiDeparted==='true');
 document.getElementById('greetTeam').hidden=true;document.querySelector('.world-hint').hidden=true;
 window.dispatchEvent(new Event('bee-world-ready'));
}
try{renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});}catch(error){fallback();}
if(renderer){try{
 // Keep high-density artwork sharp without supersampling lower-density screens.
 const renderScale=()=>Math.min(2,devicePixelRatio||1);renderer.setPixelRatio(renderScale());renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
 renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 host.append(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
 const scene=new THREE.Scene(),stage=new THREE.Group();scene.add(stage);
 const camera=new THREE.OrthographicCamera(-5.3,5.3,2,-2,.1,40);camera.position.set(0,3.35,14);camera.lookAt(0,2.3,0);
 scene.add(new THREE.HemisphereLight(0xE6EEFF,0x263D75,2.2));
 const key=new THREE.DirectionalLight(0xFFFFFF,2.5);key.position.set(-4,8,6);key.castShadow=true;const shadowSize=()=>compactProfile()?1024:2048;key.shadow.mapSize.set(shadowSize(),shadowSize());Object.assign(key.shadow.camera,{left:-6,right:6,top:6,bottom:-6,near:.5,far:25});key.shadow.bias=-.001;scene.add(key);
 const fill=new THREE.DirectionalLight(0xA9CBFF,1.5);fill.position.set(4,4,-4);scene.add(fill);
 const pods=[],rings=[],models=[],deco=[];
 const standard=(color,roughness=.6,metalness=.1)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 for(let i=0;i<members.length;i++){
  const pod=new THREE.Group();pod.position.set(members[i].x,members[i].row*2.85,-members[i].row*.65);stage.add(pod);pods.push(pod);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(1.28,1.35,.16,64),standard(0x244487,.48,.25));base.position.y=.01;base.receiveShadow=true;pod.add(base);
  const inset=new THREE.Mesh(new THREE.CylinderGeometry(1.21,1.21,.012,64),standard(0x2B4B90,.7,0));inset.position.y=.095;inset.receiveShadow=true;pod.add(inset);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1.30,.014,8,96),new THREE.MeshStandardMaterial({color:palette[i],emissive:palette[i],emissiveIntensity:.9}));ring.rotation.x=Math.PI/2;ring.position.y=.087;pod.add(ring);rings.push(ring);
 }
 const orbit=new THREE.Mesh(new THREE.TorusGeometry(4.27,.009,6,120),new THREE.MeshBasicMaterial({color:0x7FA7FF,transparent:true,opacity:.22}));orbit.rotation.x=Math.PI/2;orbit.position.y=-.10;stage.add(orbit);
 function plus(color){const g=new THREE.Group(),m=standard(color,.5,.12);for(const dims of [[.38,.12,.12],[.12,.38,.12]])g.add(new THREE.Mesh(new THREE.BoxGeometry(...dims),m));return g;}
 for(const [i,x,y,z] of [[0,-4.6,1.0,.2],[1,4.52,4.70,-.3],[2,-4.35,4.65,-.3],[3,4.45,.25,.5]]){const p=plus(i%2?0xFFD84D:0x7FA7FF);p.position.set(x,y,z);p.rotation.set(.2,.5,.15);stage.add(p);deco.push({p,y,phase:i});}
 const loader=new GLTFLoader();
 await Promise.all(members.map(async(member,i)=>{
  const name=member.key;
  let model,front,faceTexture=null;
  if(i<3){
   const gltf=await loader.loadAsync(new URL('./models-v4/'+name+'.glb',import.meta.url).href);
   model=gltf.scene;
   if(i!==0){const textures=new THREE.TextureLoader();faceTexture=await textures.loadAsync(new URL('./bee-'+name+'.webp',import.meta.url).href).catch(()=>textures.loadAsync(new URL('./bee-'+name+'.png',import.meta.url).href));faceTexture.flipY=false;faceTexture.colorSpace=THREE.SRGBColorSpace;faceTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());}
  }else{
   const artwork=await loadArtworkRelief(renderer,new URL('./family/'+name+'.webp',import.meta.url).href,{color:member.color});
   model=artwork.model;front=artwork.front;
  }
  const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
  const scale=2.65/size.y;model.scale.setScalar(scale);model.position.set(-center.x*scale,.16-box.min.y*scale,-center.z*scale);
  const float=new THREE.Group();float.add(model);pods[i].add(float);
  model.traverse(node=>{node.userData.teacher=i;if(node.isMesh){node.castShadow=true;if(i<3&&node.name==='Brand_Front'){
   const tex=node.material.map;tex.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());front=new THREE.ShaderMaterial({uniforms:{artwork:{value:tex},faceArt:{value:faceTexture||tex},blankPose:{value:i===0?0:1},animatedMouth:{value:i===1?1:0},eyeOpen:{value:1},speech:{value:0}},vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:faceFragment,transparent:true,depthWrite:true,toneMapped:false});node.material=front;
  }}});models[i]={model,float,front,animateFace:i<3};
 }));
 const labels=[...host.querySelectorAll('[data-world-teacher]')];
 function syncLabels(){
  stage.updateMatrixWorld(true);camera.updateMatrixWorld();
  labels.forEach(label=>{const pod=pods[Number(label.dataset.worldTeacher)];if(!pod)return;const point=pod.localToWorld(new THREE.Vector3(0,-.20,.12)).project(camera);label.style.left=((point.x+1)*50)+'%';label.style.top=((1-point.y)*50)+'%';});
 }
 const readyAt=performance.now()/1000;let visible=true,previous=0,yaw=0,targetYaw=0,hover=-1,greetAt=-100,animationFrame=0,dirty=true,renderCount=0,shadowCount=0,lastRenderMs=0;
 const audio=document.getElementById('beeGuideAudio');
 function scheduleFrame(){if(!animationFrame&&visible&&!document.hidden)animationFrame=requestAnimationFrame(frame);}
 function invalidate(shadow=false){dirty=true;if(shadow)renderer.shadowMap.needsUpdate=true;scheduleFrame();}
 function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;renderer.setPixelRatio(renderScale());renderer.setSize(w,h,false);const resolution=shadowSize();if(key.shadow.mapSize.x!==resolution){key.shadow.mapSize.set(resolution,resolution);key.shadow.map?.dispose();key.shadow.map=null;}const aspect=w/h;camera.top=5.3/aspect;camera.bottom=-5.3/aspect;
 const small=w<=600,rowRise=small?4.25:2.85,modelHeight=small?2.65:2.15,targetY=(rowRise+modelHeight)/2-.2;
 camera.position.set(0,targetY+1.05,14);camera.lookAt(0,targetY,0);camera.updateProjectionMatrix();
 pods.forEach((pod,i)=>{pod.position.y=members[i].row*rowRise;models[i].float.scale.setScalar(modelHeight/2.65);});syncLabels();invalidate(true);}
 new ResizeObserver(resize).observe(host);resize();
 new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){previous=0;invalidate(true);}else{cancelAnimationFrame(animationFrame);animationFrame=0;}},{threshold:.01}).observe(host);
 window.beeWorld={
  nhiAnchor(){const box=new THREE.Box3().setFromObject(models[1].model),center=box.getCenter(new THREE.Vector3()).project(camera),r=host.getBoundingClientRect();return {x:r.x+(center.x+1)*r.width/2,y:r.y+(1-center.y)*r.height/2,size:box.getSize(new THREE.Vector3()).y*r.width/10.6};},
  diagnostics(){return {renderScale:renderer.getPixelRatio(),canvas:[renderer.domElement.width,renderer.domElement.height],members:members.map(member=>member.key),mouth:'single-contour',energy:models[1].front.uniforms.speech.value,profile:compactProfile()?'compact':'desktop',targetFps:compactProfile()?30:60,reducedMotion:reduced.matches,shadowSize:key.shadow.mapSize.x,renderCount,shadowCount,lastRenderMs,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles};},
  depart(){models[1].float.visible=false;host.dataset.nhiDeparted='true';invalidate(true);},
  return(){models[1].float.visible=true;host.dataset.nhiDeparted='false';invalidate(true);},
  greet(){greetAt=performance.now()/1000;invalidate();}
 };
 document.getElementById('greetTeam').addEventListener('click',()=>{window.beeWorld?.greet?.();window.dispatchEvent(new Event('bee-greet-team'));});
 let shadowAt=0;let dragging=false,downX=0,downYaw=0;
 host.addEventListener('pointerdown',e=>{if(e.target.closest('.world-labels'))return;dragging=true;downX=e.clientX;downYaw=targetYaw;host.setPointerCapture(e.pointerId);host.classList.add('is-dragging');});
 host.addEventListener('pointermove',e=>{if(dragging){targetYaw=THREE.MathUtils.clamp(downYaw+(e.clientX-downX)/host.clientWidth*.7,-.20,.20);invalidate(true);}});
 const release=()=>{dragging=false;host.classList.remove('is-dragging');};host.addEventListener('pointerup',release);host.addEventListener('pointercancel',release);
 host.addEventListener('pointerleave',()=>{if(!dragging){targetYaw=0;invalidate(true);}});
 document.querySelectorAll('[data-world-teacher]').forEach(a=>{a.addEventListener('pointerenter',()=>{hover=Number(a.dataset.worldTeacher);invalidate();});a.addEventListener('pointerleave',()=>{hover=-1;invalidate();});});
 function frame(now){animationFrame=0;if(!visible||document.hidden)return;const interval=1000/(compactProfile()?30:60);if(previous&&now-previous<interval-.7){scheduleFrame();return;}const dt=previous?Math.min((now-previous)/1000,.1):interval/1000;previous=now;const t=now/1000,age=t-readyAt,motion=reduced.matches?0:1,speaking=!!audio&&!audio.paused&&!audio.ended,rawSpeech=Math.min(1,window.beeSpeechEnergy||0),speech=rawSpeech>.001?rawSpeech:0;
  // Static reduced-motion scenes only redraw after input, resize or speech changes.
  if(!motion&&!dirty&&Math.abs(models[1].front.uniforms.speech.value-speech)<.0005){if(speaking||speech)scheduleFrame();return;}
  yaw=motion?yaw+(targetYaw-yaw)*(1-Math.exp(-dt*2.83)):targetYaw;stage.rotation.y=yaw;
  models.forEach((m,i)=>{const progress=reduced.matches?1:THREE.MathUtils.clamp((age-i*.16)/1.2,0,1),ease=1-Math.pow(1-progress,4),g=t-greetAt-i*.12,active=g>0&&g<2.6;
   m.float.position.y=(1-ease)*-3+(Math.sin(t*1.9+i)*.045+(active?Math.max(0,Math.sin(Math.min(g/.55,1)*Math.PI))*.16:0))*motion;
   m.float.rotation.z=(Math.sin(t*1.4+i)*.012+(active?Math.sin(g*5)*.025:0))*motion;
   const phase=(t+i*1.1)%5.8;const blink=motion&&phase>5.45&&phase<5.68?1-Math.sin((phase-5.45)/.23*Math.PI):1;
   m.front.uniforms.eyeOpen.value=m.animateFace?Math.max(.06,blink):1;m.front.uniforms.speech.value=i===1?speech:0;
   rings[i].material.emissiveIntensity=.9+(hover===i?.6:0)+Math.sin(t+i)*.1*motion;
  });
  if(motion&&now-shadowAt>120){renderer.shadowMap.needsUpdate=true;shadowAt=now;}
  deco.forEach(d=>{d.p.position.y=d.y+Math.sin(t*1.2+d.phase)*.06*motion;d.p.rotation.y+=dt*.12*motion;});syncLabels();const shadowPending=renderer.shadowMap.needsUpdate,started=performance.now();renderer.render(scene,camera);lastRenderMs=performance.now()-started;renderCount++;if(shadowPending)shadowCount++;dirty=false;
  if(motion||speaking||speech)scheduleFrame();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(animationFrame);animationFrame=0;}else{previous=0;invalidate(true);}});
 ['playing','pause','ended'].forEach(event=>audio?.addEventListener(event,()=>invalidate()));
 reduced.addEventListener('change',()=>{previous=0;invalidate(true);});coarse.addEventListener('change',resize);
 scheduleFrame();host.classList.add('is-ready');host.dataset.worldMode='reference-volume';host.dataset.modelCount=String(members.length);window.beeWorldReady=true;window.dispatchEvent(new Event('bee-world-ready'));
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();visible=false;cancelAnimationFrame(animationFrame);animationFrame=0;fallback();});
}catch(error){fallback();renderer.dispose();console.info('Mascot fallback',error.message);}}
