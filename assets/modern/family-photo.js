// The family is one approved photograph; the existing Nhi guide keeps its anchor API.
(() => {
 const host=document.getElementById('beeWorld');
 const image=host?.querySelector('.family-portrait');
 if(!host||!image)return;
 host.dataset.worldMode='family-photo';
 const members=host.closest('.family-stage').querySelectorAll('.family-member').length;
 host.dataset.memberCount=String(members);
 window.beeWorld={
  nhiAnchor(){
   const r=image.getBoundingClientRect();
   return {x:r.left+r.width*.60,y:r.top+r.height*.25,size:r.height*.32};
  },
  // A photograph stays complete when its Nhi guide appears elsewhere on the page.
  depart(){host.dataset.nhiDeparted='true';},
  return(){host.dataset.nhiDeparted='false';},
  greet(){},
  diagnostics(){return {mode:'family-photo',members};}
 };
 window.beeWorldReady=true;
 window.dispatchEvent(new Event('bee-world-ready'));
})();
