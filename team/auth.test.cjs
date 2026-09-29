const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/auth.js', 'utf8');
const KEY = 'maybe_team_google_session_v1';
const HINT = 'maybe_team_remembered_account_v1';
const client = 'test.apps.googleusercontent.com';
function storage() {
  const values = new Map();
  return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
}
function credential(extra={}) {
  const claims = {aud:client,sub:'test-subject',email:'test@example.com',email_verified:true,exp:Math.floor(Date.now()/1000)+3600,...extra};
  return 'test.' + Buffer.from(JSON.stringify(claims)).toString('base64url') + '.signature';
}
function app(local=storage(),tab=storage(),host='maybeielts.com',allowed=true) {
  let disabled=false;
  const ctx={localStorage:local,sessionStorage:tab,TextDecoder,Uint8Array,atob,URLSearchParams,
    location:{hostname:host,protocol:'https:',pathname:'/team/admin.html',search:'',replace(url){this.redirect=url;}},
    MAYBE_TEAM_CONFIG:{googleClientId:client,scheduleApiUrl:'https://script.google.com/macros/s/test/exec'},
    google:{accounts:{id:{disableAutoSelect(){disabled=true;}}}},
    fetch:async()=>({ok:true,json:async()=>allowed?{status:'success',user:{email:'test@example.com',name:'Test',role:'teacher',teacherId:'test'}}:{status:'error'}})};
  ctx.window=ctx;vm.runInNewContext(source,ctx);
  return {auth:ctx.MaybeTeamAuth,ctx,disabled:()=>disabled};
}
(async()=>{
  const local=storage(),a=app(local);
  await a.auth.createSession(credential());
  assert(local.getItem(KEY));
  assert.equal(app(local).auth.getSession().email,'test@example.com','survives a new browser tab/session');
  assert.equal(app(local).auth.getLoginHint(),'test-subject');

  const legacy=storage(),session=JSON.parse(local.getItem(KEY));legacy.setItem(KEY,JSON.stringify(session));
  const migrated=storage();assert(app(migrated,legacy).auth.getSession());
  assert(migrated.getItem(KEY));assert.equal(legacy.getItem(KEY),null);

  local.setItem(KEY,JSON.stringify({...session,credential:credential({exp:1}),expiresAt:Date.now()+86400000}));
  assert.equal(app(local).auth.getSession(),null,'stored expiry cannot extend a Google token');
  assert.equal(local.getItem(KEY),null);assert.equal(app(local).auth.getLoginHint(),'test-subject');
  const signedOut=app(local);signedOut.auth.logout();assert.equal(local.getItem(HINT),null);assert(signedOut.disabled());
  assert.equal(signedOut.auth.getSession(),null);

  const denied=storage();await assert.rejects(app(denied,storage(),'maybeielts.com',false).auth.createSession(credential()));
  assert.equal(denied.getItem(KEY),null);assert.equal(denied.getItem(HINT),null);
  await assert.rejects(app().auth.createSession(credential({exp:'not-a-number'})));
  await assert.rejects(app().auth.createSession(credential({aud:'other-client'})));

  const demoLocal=storage(),demoTab=storage();app(demoLocal,demoTab,'localhost').auth.createDemoSession('khang','manager');
  assert.equal(demoLocal.getItem(KEY),null);assert(app(demoLocal,demoTab,'localhost').auth.getSession());
  assert.equal(app(demoLocal,demoTab,'maybeielts.com').auth.getSession(),null);

  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');},removeItem(){throw Error('blocked');}};
  const fallback=app(blocked);await fallback.auth.createSession(credential());assert(fallback.auth.getSession());fallback.auth.logout();
  const corrupt=storage();corrupt.setItem(KEY,'broken json');assert.equal(app(corrupt).auth.getSession(),null);
  const expired=app();assert.throws(()=>expired.auth.requireSession(),/AUTH_REQUIRED/);
  assert.equal(expired.ctx.location.redirect,'index.html?returnTo=admin.html');
  console.log('PASS: persistence, migration, token expiry, remember hint, logout, backend denial, invalid tokens, demo isolation, blocked/corrupt storage, return-to redirect');
})();
