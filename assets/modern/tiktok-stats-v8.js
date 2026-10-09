/* Read the public snapshot; account credentials never enter the page. */
(() => {
 const base=new URL('./tiktok-stats.json',document.currentScript.src);
 const expected={bach:'7583938587838647570',nhi:'7592510586341084437',khang:'7633037434267176213'};
 const exact=new Intl.NumberFormat('vi-VN');
 const compact=n=>n>=1e6?`${+(n/1e6).toFixed(1)}M`:n>=1000?`${+(n/1000).toFixed(1)}K`:String(n);
 const valid=n=>Number.isSafeInteger(n)&&n>=0;
 let lastRead=0;
 async function load(){
  try{
   const response=await fetch(base,{cache:'no-store'});if(!response.ok)return;
   const data=await response.json();if(data.schemaVersion!==1)return;
   for(const [teacher,id] of Object.entries(expected)){
    const item=data.videos?.[teacher];
    if(!item||item.videoId!==id||!valid(item.views)||!valid(item.likes))continue;
    const el=document.querySelector(`[data-tiktok-stats="${teacher}"]`);if(!el)continue;
    for(const key of ['views','likes']){
     const count=el.querySelector(`[data-stat="${key}"]`),label=key==='views'?'lượt xem':'lượt thích';
     count.textContent=compact(item[key]);count.parentElement.setAttribute('aria-label',`${item.precision==='rounded'?'Khoảng ':''}${exact.format(item[key])} ${label}`);
     count.parentElement.title=`${item.precision==='rounded'?'Khoảng ':''}${exact.format(item[key])} ${label}`;
    }

   }
   lastRead=Date.now();
  }catch{ /* Preserve the existing counts if the snapshot is unavailable. */ }
 }
 load();
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-lastRead>3600000)load();});
})();
