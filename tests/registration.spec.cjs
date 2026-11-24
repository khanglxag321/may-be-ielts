/* Offline browser regression: all external requests, including every registration POST,
 * are intercepted. No student records or emails are created. Run: node tests/registration.spec.cjs */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require('C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
const root = path.resolve(__dirname, '..');
const scheduleId = 'AKfycbyBZAXmm893kl4QA4rFwiDcVCMRTz4hXbMVCr-tkIVV6tm1NNWTQOGndH8jrbPgSylh';
const registerId = 'AKfycbylC6irJ6wkKI_V3G9qvl6pAVoCZ54dIymykeJ9-njcboc82ZGU6dx1hfBiEqh2Ml8S';
const rows = [
 ['Hồ Bách','MBWrite01+ dec26',20,5], ['Hồ Bách','MBWrite02+ dec26',20,20],
 ['Tuệ Nhi','MBWrite02 dec26',20,4], ['Bình An','MBWrite09 dec26',20,4],
 ['Lan Trinh','MBSpeak02 dec26',20,4], ['Quỳnh Kem','MBSpeak05 dec26',20,4]
].map(([GiangVien,MaLop,TongSlot,HocVien])=>({GiangVien,MaLop,TongSlot,HocVien,LichHoc:'Thứ 2 + 5 (8:00 PM - 10:00 PM)',KhaiGiang:'10.12.2026',KetThuc:'30.01.2027',HocPhi:'6.000.000',HocPhiGoc:'7.000.000'}));
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 const target=file===root?path.join(root,'index.html'):file;
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(target,(error,data)=>{if(error){res.writeHead(404).end();return;}res.setHeader('Content-Type',mime[path.extname(target)]||'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;
 try {
  browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:process.platform==='win32'?{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}:{})});
  const base=`http://127.0.0.1:${server.address().port}`;
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport,hasTouch:viewport.width<500,reducedMotion:'reduce'});
   await context.addInitScript(()=>{
    sessionStorage.setItem('maybeBeeVoiceMuted','1');
    const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-11-24T03:00:00Z']));}static now(){return new RealDate('2026-11-24T03:00:00Z').valueOf();}};
    const realTimeout=window.setTimeout;window.setTimeout=(fn,delay,...args)=>realTimeout(fn,window.__shortFormTimeout&&delay===25000?120:delay,...args);
   });
   const page=await context.newPage();const pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
   let scheduleCalls=0,posts=[],responseMode='success',release;
   await page.route('**/*',async route=>{
    const req=route.request(),url=req.url();
    if(url.includes(scheduleId)){
     scheduleCalls++;
     if(scheduleCalls===1)return route.fulfill({status:503,body:'Temporarily unavailable',headers:{'access-control-allow-origin':'*'}});
     return route.fulfill({json:{status:'success',data:rows},headers:{'access-control-allow-origin':'*'}});
    }
    if(url.includes(registerId)){
     assert.equal(req.method(),'POST');posts.push(JSON.parse(req.postData()));
     if(responseMode==='hold')await new Promise(resolve=>release=resolve);
     if(responseMode==='timeout')return;
     if(responseMode==='network')return route.abort('failed');
     if(responseMode==='http')return route.fulfill({status:503,body:'Unavailable',headers:{'access-control-allow-origin':'*'}});
     if(responseMode==='html')return route.fulfill({contentType:'text/html',body:'<h1>Service unavailable</h1>',headers:{'access-control-allow-origin':'*'}});
     return route.fulfill({json:responseMode==='rejected'?{status:'error',message:'Simulated server rejection'}:{status:'success'},headers:{'access-control-allow-origin':'*'}});
    }
    if(!url.startsWith(base)){
     assert.notEqual(req.method(),'POST',`Unexpected external POST blocked: ${url}`);
     return route.fulfill({status:204,body:''});
    }
    if(/\.(?:png|jpe?g|webp|mp3|mp4|woff2?)(?:\?|$)/i.test(url))return route.fulfill({status:204,body:''});
    return route.continue();
   });
   await page.goto(base,{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>!document.querySelector('#registerScheduleNotice').hidden);
   assert.equal(await page.locator('#registerTeacher').isDisabled(),true);
   await page.locator('#registerScheduleRetry').click();
   await page.waitForFunction(()=>!document.querySelector('#registerTeacher').disabled);
   assert.equal(scheduleCalls,2);assert.equal(await page.locator('#registerScheduleNotice').isVisible(),false);
   await page.locator('#registerTeacher').selectOption('Hồ Bách');
   assert.equal(await page.locator('#course option').count(),2,'full class must not be offered');
   await page.locator('#registerTeacher').selectOption('Bình An');
   assert.deepEqual(await page.locator('#course option').allTextContents(),['Chọn lớp','MBWrite09 dec26 · Thứ 2 + 5 (8:00 PM - 10:00 PM)']);
   const fill=async(facebook='facebook.com/test.student')=>{
    await page.locator('#name').fill('  Form regression test  ');
    await page.locator('#fb-link').fill(facebook);
    await page.locator('#email').fill('registration-test@example.com');
    await page.locator('#phone').fill(' 0900000000 ');
    await page.locator('#registerTeacher').selectOption('Bình An');
    await page.locator('#course').selectOption('MBWrite09 dec26 | Bình An');
   };
   await fill('https://example.com/not-facebook');
   await page.locator('#registerSubmitButton').click();
   assert.equal(posts.length,0,'invalid Facebook must not reach backend');
   assert.match(await page.locator('#fb-link').evaluate(e=>e.validationMessage),/Facebook/);
   await fill();responseMode='hold';
   await page.locator('#registerSubmitButton').click();
   await page.waitForFunction(()=>document.querySelector('#registerSubmitButton').disabled);
   await page.evaluate(()=>submitRegister({preventDefault(){},currentTarget:document.querySelector('#registrationForm')}));
   assert.equal(posts.length,1,'a second submit while pending must not duplicate the POST');
   assert.equal(posts[0].facebook,'https://facebook.com/test.student');
   assert.equal(posts[0].name,'Form regression test');
   assert.equal(posts[0].phone,'0900000000');
   responseMode='success';release();
   await page.waitForFunction(()=>document.querySelector('#registerSuccessDialog').open);
   assert.equal(await page.locator('#name').inputValue(),'');
   assert.equal(await page.locator('#course').isDisabled(),true);
   assert.equal(await page.locator('#registerSubmitButton').isEnabled(),true);
   await page.locator('#registerSuccessClose').click();
   for(const mode of ['rejected','http','html','network','timeout']){
    responseMode=mode;await fill();
    if(mode==='timeout')await page.evaluate(()=>window.__shortFormTimeout=true);
    const before=posts.length;
    await page.locator('#registerSubmitButton').click();
    await page.waitForFunction(()=>document.querySelector('#registerStatus').classList.contains('is-error'));
    assert.equal(posts.length,before+1);
    assert.equal(await page.locator('#name').inputValue(),'  Form regression test  ',`${mode}: keep inputs`);
    assert.equal(await page.locator('#registerTeacher').inputValue(),'Bình An');
    assert.equal(await page.locator('#course').inputValue(),'MBWrite09 dec26 | Bình An');
    assert.equal(await page.locator('#registerSubmitButton').isEnabled(),true);
    assert.equal(await page.locator('#registerSuccessDialog').evaluate(e=>e.open),false);
    if(mode==='timeout')await page.evaluate(()=>window.__shortFormTimeout=false);
   }
   assert.deepEqual(pageErrors,[],`${viewport.width}px page errors`);
   const overflow=await page.locator('#registrationForm').evaluate(e=>e.scrollWidth>e.clientWidth+1);
   assert.equal(overflow,false,'registration form must fit viewport');
   console.log(`PASS ${viewport.width}px: retry, teacher filtering, Facebook validation/normalization, duplicate guard, success, five failure modes, layout, no page errors`);
   await context.close();
  }
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
