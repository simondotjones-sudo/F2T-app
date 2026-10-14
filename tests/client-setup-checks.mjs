import sharp from 'sharp';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function clientSetupChecks({m,check,q,query,run,call,req,cookieFrom,operator,primaryCookie}){
 const config=()=>({requestId:randomUUID(),name:'Setup Client',default_language:'fr',location_term:'store',slug:'setup-client',logo_url:'/branding/eazysafe-logo.png',theme_color:'#7944c8',administrator:{name:'Client Admin',email:'admin@setup.invalid'},sites:[{name:'Dublin',country:'Ireland',code:'DUB'},{name:'London',country:'United Kingdom',code:'LON'}],departments:['Operations','Finance'],registration:{self_registration_enabled:false,registration_code:'join-us',employee_id_label:'Staff number',employee_id_required:false},features:{...m.setupTypes.initialSetupFeatures(),credits:true},creditsPerSite:75});
 const photo='data:image/png;base64,'+(await sharp({create:{width:30,height:20,channels:3,background:'#336699'}}).png().toBuffer()).toString('base64');
 let body={...config(),login_background:photo},created,adminCookie,site,department,registration;
 await check('Setup migration preserves existing registration and protects new tables in all schemas',async()=>{
  const publicSettings=(await query('primark','SELECT * FROM registration_settings'))[0];assert.equal(publicSettings.self_registration_enabled,true);assert.equal(publicSettings.employee_id_label,'Workday ID');assert.equal(publicSettings.employee_id_required,true);assert.equal(publicSettings.registration_code,'safety');
  assert.equal((await q('SELECT * FROM lms_template.registration_settings'))[0].self_registration_enabled,false);
  for(const table of ['registration_settings','organisation_departments'])await assert.rejects(query('primark',`SELECT * FROM lms_tenant_2.${table}`),/permission denied/);
  await assert.rejects(query('primark',"SELECT public.lms_setup_client('{}','bad',NULL,'x','x','x','x','x')"),/permission denied/);
 });
 await check('Setup is operator-only and refuses cross-origin requests before provisioning',async()=>{
  for(const cookie of ['',primaryCookie])assert.equal((await call(m.setup,'POST','/api/admin/clients/setup',body,'primark',cookie)).status,403);
  const request=req('/api/admin/clients/setup','POST',body,operator);request.headers.set('origin','https://foreign.invalid');assert.equal((await run('primark',()=>m.setup.POST(request),operator)).status,403);
  assert.equal((await q("SELECT * FROM lms_clients WHERE slug='setup-client'")).length,0);
 });
 await check('Invalid setup data cannot create partial clients or uncontrolled feature settings',async()=>{
  const invalid=[{...body,default_language:'xx'},{...body,location_term:'branch'},{...body,default_language:null},{...body,location_term:null},{...body,location_term:['site']},{...body,sites:[]},{...body,sites:[body.sites[0],body.sites[0]]},{...body,administrator:{name:'Bad',email:'invalid'}},{...body,departments:['Sales','sales']},{...body,registration:{...body.registration,self_registration_enabled:true,registration_code:''}},{...body,features:{...body.features,unknown:true}},{...body,features:{...body.features,pathway_certificates:true,pathways:false}},{...body,creditsPerSite:0},{...body,theme_color:'red'},{...body,registration:null},{...body,requestId:'invalid'}];
  for(const input of invalid){const r=await call(m.setup,'POST','/api/admin/clients/setup',input,'primark',operator);assert.equal(r.status,400,await r.clone().text());}
  assert.equal((await q("SELECT * FROM lms_clients WHERE slug='setup-client'")).length,0);
 });
 await check('Wizard provisions isolated sites, departments, explicit features and a least-privilege administrator',async()=>{
  const r=await call(m.setup,'POST','/api/admin/clients/setup',body,'primark',operator);assert.equal(r.status,201,await r.clone().text());created=await r.json();assert(created.created);assert.match(created.activationPath,/client=setup-client#token=[a-f0-9]{64}$/);
  const clients=await q('SELECT * FROM public.lms_clients WHERE id=$1',[created.id]);assert.equal(clients.length,1);assert.equal(clients[0].default_language,'fr');assert.equal(clients[0].location_term,'store');assert.match(clients[0].login_background,/^data:image\/jpeg;base64,/);assert(clients[0].setup_completed_at);assert.equal(clients[0].setup_request_id,body.requestId);
  const stores=await query('setup-client','SELECT * FROM organisation_stores ORDER BY name');assert.equal(stores.length,2);site=stores[0];assert.equal(site.name,'Dublin');
  const depts=await query('setup-client','SELECT * FROM organisation_departments ORDER BY name');assert.equal(depts.length,2);department=depts[0];
  const people=await query('setup-client','SELECT * FROM learners');assert.equal(people.length,1);assert.equal(people[0].email,'admin@setup.invalid');assert.equal(people[0].password_hash,null);assert.equal(people[0].induction_enrolled,false);
  assert.equal((await query('setup-client','SELECT * FROM platform_admins')).length,0);assert.equal((await query('setup-client','SELECT scope FROM reporting_access'))[0].scope,'organisation');
  assert.equal((await query('setup-client','SELECT * FROM courses')).length,0);assert.equal((await query('setup-client','SELECT * FROM assignment_history')).length,0);
  const accounts=await query('setup-client','SELECT balance,target FROM store_credit_accounts');assert.equal(accounts.length,2);assert(accounts.every(a=>a.balance===75&&a.target===75));assert.equal((await query('setup-client','SELECT sum(credits)::int AS n FROM credit_ledger'))[0].n,150);
  const features=(await query('setup-client','SELECT features,credits_enabled FROM organisation_settings'))[0];assert(features.credits_enabled);assert.equal(features.features.email_notifications.policy,'disabled');
  const publicResponse=await (await call(m.registration,'GET','/api/registration',null,'setup-client')).json();assert(!('registration_code' in publicResponse));assert.equal(publicResponse.employee_id_label,'Staff number');
  const token=created.activationPath.split('#token=')[1];assert(!(JSON.stringify(await query('setup-client','SELECT * FROM audit_events'))+JSON.stringify(await q('SELECT * FROM lms_client_audit WHERE client_id=$1',[created.id]))).includes(token));
 });
 await check('A retried setup is idempotent and changed requests or duplicate slugs are rejected',async()=>{
  const retry=await call(m.setup,'POST','/api/admin/clients/setup',body,'primark',operator);assert.equal(retry.status,200,await retry.clone().text());const repeated=await retry.json();assert.equal(repeated.id,created.id);assert.equal(repeated.created,false);assert.equal(repeated.activationPath,null);
  assert.equal((await call(m.setup,'POST','/api/admin/clients/setup',{...body,name:'Changed name'},'primark',operator)).status,409);
  assert.equal((await call(m.setup,'POST','/api/admin/clients/setup',{...body,requestId:randomUUID()},'primark',operator)).status,409);
  assert.equal((await query('setup-client','SELECT * FROM learners')).length,1);
 });
 await check('A database error rolls back new schema, role, registry and account together',async()=>{
  const before=await q("SELECT rolname FROM pg_roles WHERE rolname LIKE 'lms_client_%' ORDER BY rolname"),schemas=await q("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'lms_tenant_%' ORDER BY nspname");
  const broken={...body,slug:'rollback-fixture',sites:[{id:'same',name:'A site',country:'Ireland',code:'ONE'},{id:'same',name:'B site',country:'Ireland',code:'TWO'}],features:{},administrator:body.administrator};
  await assert.rejects(q('SELECT public.lms_setup_client($1::jsonb,$2,$3::uuid,$4,$5,$6,$7,$8)',[JSON.stringify(broken),'fixture',randomUUID(),'hash',randomUUID(),'code','token','fingerprint']));
  assert.equal((await q("SELECT * FROM lms_clients WHERE slug='rollback-fixture'")).length,0);assert.deepEqual(await q("SELECT rolname FROM pg_roles WHERE rolname LIKE 'lms_client_%' ORDER BY rolname"),before);assert.deepEqual(await q("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'lms_tenant_%' ORDER BY nspname"),schemas);
 });
 await check('Activation links can be replaced, are client-bound and enforce a strong administrator password',async()=>{
  const old=created.activationPath.split('#token=')[1];assert.equal((await call(m.activation,'POST','/api/admin/clients/activation',{id:created.id},'primark',primaryCookie)).status,403);
  const replacement=await call(m.activation,'POST','/api/admin/clients/activation',{id:created.id},'primark',operator);assert.equal(replacement.status,200,await replacement.clone().text());const token=(await replacement.json()).activationPath.split('#token=')[1];assert.notEqual(old,token);
  await assert.rejects(run('setup-client',()=>m.recovery.resetPassword(old,'Admin-password-long-123')),/expired/);await assert.rejects(run('primark',()=>m.recovery.resetPassword(token,'Admin-password-long-123')),/expired/);await assert.rejects(run('setup-client',()=>m.recovery.resetPassword(token,'shortpass')),/16/);
  await run('setup-client',()=>m.recovery.resetPassword(token,'Admin-password-long-123'));await assert.rejects(run('setup-client',()=>m.recovery.resetPassword(token,'Another-admin-password-long')),/expired/);
  const login=await call(m.prototype,'POST','/api/prototype',{action:'login',identifier:'admin@setup.invalid',password:'Admin-password-long-123'},'setup-client');assert.equal(login.status,200,await login.clone().text());adminCookie=cookieFrom(login,'primark_session');
  const status=await (await call(m.activation,'GET','/api/admin/clients/activation?id='+created.id,null,'primark',operator)).json();assert.equal(status.activated,true);assert.equal((await call(m.activation,'POST','/api/admin/clients/activation',{id:created.id},'primark',operator)).status,409);
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'setup-client',adminCookie)).status,403);assert.equal((await call(m.setup,'POST','/api/admin/clients/setup',config(),'setup-client',adminCookie)).status,403);
  assert.equal((await call(m.registrationAdmin,'GET','/api/admin/registration',null,'setup-client',adminCookie)).status,200);assert.equal((await call(m.registrationAdmin,'GET','/api/admin/registration',null,'primark',adminCookie)).status,403);
 });
 await check('Client registration rules enforce closed signup, optional IDs and local departments on the server',async()=>{
  const learner={action:'register',firstName:'New',surname:'Learner',email:'new@setup.invalid',password:'Learner-password-123',storeId:site.id,country:site.country,registrationCode:'join-us',workdayId:'',departmentId:department.id};
  assert.equal((await call(m.prototype,'POST','/api/prototype',learner,'setup-client')).status,403);
  registration=await (await call(m.registrationAdmin,'GET','/api/admin/registration',null,'setup-client',adminCookie)).json();
  const patch={...registration.settings,self_registration_enabled:true,departments:registration.departments};
  assert.equal((await call(m.registrationAdmin,'POST','/api/admin/registration',patch,'setup-client',primaryCookie)).status,403);
  const saved=await call(m.registrationAdmin,'POST','/api/admin/registration',patch,'setup-client',adminCookie);assert.equal(saved.status,200,await saved.clone().text());registration=await saved.json();assert.equal((await call(m.registrationAdmin,'POST','/api/admin/registration',patch,'setup-client',adminCookie)).status,409);
  assert.equal((await call(m.prototype,'POST','/api/prototype',{...learner,departmentId:'foreign-id'},'setup-client')).status,400);
  assert.equal((await call(m.prototype,'POST','/api/prototype',{...learner,registrationCode:'wrong'},'setup-client')).status,400);
  const r=await call(m.prototype,'POST','/api/prototype',learner,'setup-client');assert.equal(r.status,200,await r.clone().text());const p=(await query('setup-client',"SELECT * FROM learners WHERE email='new@setup.invalid'"))[0];assert.equal(p.workday_id,null);assert.equal(p.department_id,department.id);assert.equal((await query('primark',"SELECT * FROM learners WHERE email='new@setup.invalid'")).length,0);
 });
 await check('Required IDs and archived departments cannot be bypassed with stale registration forms',async()=>{
  const payload={...registration.settings,employee_id_required:true,departments:registration.departments.map(d=>({...d,archived:true}))};const r=await call(m.registrationAdmin,'POST','/api/admin/registration',payload,'setup-client',adminCookie);assert.equal(r.status,200,await r.clone().text());
  const learner={action:'register',firstName:'Another',surname:'Learner',email:'another@setup.invalid',password:'Learner-password-123',storeId:site.id,country:site.country,registrationCode:'join-us'};
  assert.equal((await call(m.prototype,'POST','/api/prototype',learner,'setup-client')).status,400);assert.equal((await call(m.prototype,'POST','/api/prototype',{...learner,workdayId:'EMP-2',departmentId:department.id},'setup-client')).status,400);
  assert.equal((await call(m.prototype,'POST','/api/prototype',{...learner,workdayId:'EMP-2'},'setup-client')).status,200);
  assert.equal((await query('primark','SELECT employee_id_label FROM registration_settings'))[0].employee_id_label,'Workday ID');
  assert.equal((await query('setup-client','SELECT department_id FROM learners WHERE email=?','new@setup.invalid'))[0].department_id,department.id);
 });
}
