import assert from 'node:assert/strict';
export async function platformOperatorChecks({m,check,q,query,run,call,req,cookieFrom,operator,primaryCookie,primary}){
 const email='second-operator@test.invalid',password='Second-operator-password-123';
 let invitation,namedCookie;
 const manage=(body,cookie=operator)=>call(m.operators,'POST','/api/admin/operators',body,'primark',cookie);
 const redeem=(code,overrides={})=>call(m.platformAccess,'POST','/api/platform-access',{email,code,password,...overrides});
 const login=(mail=email,secret=password)=>call(m.prototype,'POST','/api/prototype',{action:'login',identifier:mail,password:secret});
 const good=async r=>{assert(r.ok,await r.clone().text());return r.json();};
 await q('DELETE FROM public.auth_limits');
 await check('Only global operators can list or add operators; client grants and mixed cookies do not elevate access',async()=>{
  for(const cookie of ['',primaryCookie]){
   assert.equal((await call(m.operators,'GET','/api/admin/operators',null,'primark',cookie)).status,403);
   assert.equal((await manage({action:'create',email,name:'Second Admin'},cookie)).status,403);
  }
  await q("INSERT INTO public.platform_admins(learner_id,assigned_by,updated_at) VALUES($1,'test',now()::text) ON CONFLICT DO NOTHING",[primary.id]);
  assert.equal((await manage({action:'create',email,name:'Second Admin'},primaryCookie+'; '+operator)).status,403);
  await q('DELETE FROM public.platform_admins WHERE learner_id=$1',[primary.id]);
  const request=req('/api/admin/operators','POST',{action:'create',email,name:'Second Admin'},operator);request.headers.set('origin','https://attacker.invalid');
  assert.equal((await run('primark',()=>m.operators.POST(request),operator)).status,403);
  for(const client of ['primark','eazysafe-internal','third-client'])for(const table of ['lms_platform_operators','lms_platform_operator_audit'])await assert.rejects(query(client,`SELECT * FROM public.${table}`),/permission denied/);
 });
 await check('Inviting creates a pending global account with hashed code, private responses and no client learner',async()=>{
  const r=await manage({action:'create',email:' Second-Operator@Test.Invalid ',name:'Second Admin'});assert.equal(r.status,201);assert.match(r.headers.get('cache-control'),/no-store/);invitation=await r.json();
  assert.match(invitation.code,/^[A-F0-9]{8}(-[A-F0-9]{8}){3}$/);
  const [row]=await q('SELECT * FROM public.lms_platform_operators WHERE email=$1',[email]);assert.equal(row.password_hash,null);assert.notEqual(row.code_hash,invitation.code.replaceAll('-',''));assert(row.code_expires_at);
  assert.equal((await query('primark','SELECT id FROM learners WHERE email=?',email)).length,0);
  const list=await good(await call(m.operators,'GET','/api/admin/operators',null,'primark',operator));assert.equal(list.operators.find(o=>o.email===email).status,'pending');assert(!JSON.stringify(list).includes('code_hash'));assert(!JSON.stringify(list).includes(invitation.code));
  assert.equal((await manage({action:'create',email,name:'Duplicate'})).status,409);
  assert.equal((await login()).status,401);
 });
 await check('Codes bind to the email, enforce a strong password, expire and are atomically single-use',async()=>{
  assert.equal((await redeem(invitation.code,{email:'someone-else@test.invalid'})).status,401);
  assert.equal((await redeem(invitation.code,{password:'too-short'})).status,400);
  await q("UPDATE public.lms_platform_operators SET code_expires_at=now()-interval '1 second' WHERE email=$1",[email]);assert.equal((await redeem(invitation.code)).status,401);
  const fresh=await good(await manage({action:'code',email}));assert.notEqual(fresh.code,invitation.code);assert.equal((await redeem(invitation.code)).status,401);
  const request=req('/api/platform-access','POST',{email,code:fresh.code,password});request.headers.set('origin','https://attacker.invalid');assert.equal((await run('primark',()=>m.platformAccess.POST(request))).status,403);
  await q('DELETE FROM public.auth_limits');
  const results=await Promise.all([redeem(fresh.code.toLowerCase()),redeem(fresh.code)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
  const [row]=await q('SELECT * FROM public.lms_platform_operators WHERE email=$1',[email]);assert(row.activated_at);assert.equal(row.code_hash,null);assert.equal(row.code_expires_at,null);assert.match(row.password_hash,/^scrypt-v1:/);
  const audits=await q('SELECT * FROM public.lms_platform_operator_audit WHERE email=$1',[email]);assert.equal(audits.filter(r=>r.action==='login_code_redeemed').length,1);assert(!JSON.stringify(audits).includes(fresh.code));
 });
 await check('Named admins use normal login across clients without invalidating other admins',async()=>{
  const r=await login();await good(r);namedCookie=cookieFrom(r,'primark_admin');
  for(const client of ['primark','eazysafe-internal'])assert.equal((await call(m.clients,'GET','/api/admin/clients',null,client,namedCookie)).status,200);
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',operator)).status,200);
  assert.equal((await manage({action:'disable',email},namedCookie)).status,409);
  assert.equal((await manage({action:'disable',email:process.env.PRIMARK_ADMIN_EMAIL},namedCookie)).status,409);
  await good(await call(m.session,'POST','/api/admin/session',{email:process.env.PRIMARK_ADMIN_EMAIL,password:process.env.PRIMARK_ADMIN_PASSWORD}));
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',namedCookie)).status,200);
  const saved=process.env.PRIMARK_ADMIN_PASSWORD;delete process.env.PRIMARK_ADMIN_PASSWORD;
  try{assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',namedCookie)).status,200);assert.equal((await login()).status,200);}finally{process.env.PRIMARK_ADMIN_PASSWORD=saved;}
 });
 await check('Replacement codes reset a named password and invalidate sessions; recovery uses its own fingerprint',async()=>{
  const recoveryCode=await good(await manage({action:'code',email}));
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',namedCookie)).status,200);
  await q('DELETE FROM public.auth_limits');await good(await redeem(recoveryCode.code,{password:password+'-new'}));
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',namedCookie)).status,403);
  assert.equal((await login()).status,401);
  const next=await login(email,password+'-new');await good(next);namedCookie=cookieFrom(next,'primark_admin');
  const resetToken='a'.repeat(64),fingerprint=await m.auth.sessionCredentialFingerprint(email);
  await q("INSERT INTO public.lms_platform_resets(token_hash,account_id,credential_hash,expires_at) VALUES($1,$2,$3,now()+interval '30 minutes')",[await m.hash(resetToken),email,fingerprint]);
  await run('eazysafe-internal',()=>m.recovery.resetPassword(resetToken,password));
  await assert.rejects(run('primark',()=>m.adminSession.createAdminSession(req('/api/admin/session'),null,email,fingerprint)),/credentials changed/);
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',namedCookie)).status,403);
  await assert.rejects(run('primark',()=>m.recovery.resetPassword(resetToken,password)),/expired|used/);
  const r=await login();await good(r);namedCookie=cookieFrom(r,'primark_admin');
 });
 await check('Disabling cancels codes and sessions; re-enabling requires fresh redemption and attempts are limited',async()=>{
  const pending=await good(await manage({action:'code',email}));await good(await manage({action:'disable',email}));
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',namedCookie)).status,403);
  assert.equal((await login()).status,401);
  await q('DELETE FROM public.auth_limits');assert.equal((await redeem(pending.code)).status,401);
  const next=await good(await manage({action:'code',email}));assert.equal((await login()).status,401);
  assert.equal((await redeem(pending.code)).status,401);await good(await redeem(next.code));
  await q('DELETE FROM public.auth_limits');
  for(let i=0;i<5;i++)assert.equal((await redeem('0'.repeat(32))).status,401);
  assert.equal((await redeem('0'.repeat(32))).status,429);
 });
}
