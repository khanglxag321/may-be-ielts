// The family portrait stays complete while Pu is guiding elsewhere on the page.
(() => {
 const host=document.getElementById('beeWorld');
 const image=host?.querySelector('.family-portrait');
 if(!host||!image)return;
 host.dataset.worldMode='family-photo';
 const members=host.closest('.family-stage').querySelectorAll('.family-member').length;
 host.dataset.memberCount=String(members);
 window.beeWorld={
  guideAnchor(){
   const r=image.getBoundingClientRect();
   return {x:r.left+r.width*.25,y:r.top+r.height*.67,size:r.height*.43};
  },
  depart(){host.dataset.guideDeparted='true';},
  return(){host.dataset.guideDeparted='false';},
  greet(){},
  diagnostics(){return {mode:'family-photo',members};}
 };
 window.beeWorldReady=true;
 window.dispatchEvent(new Event('bee-world-ready'));
})();
