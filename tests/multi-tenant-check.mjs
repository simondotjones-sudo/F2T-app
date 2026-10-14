import {hierarchyChecks} from './hierarchy-checks.mjs';
import {platformOperatorChecks} from './platform-operator-checks.mjs';
import {helpChecks} from './help-checks.mjs';
import {externalTrainingChecks} from './external-training-checks.mjs';
import {liveTrainingChecks} from './live-training-checks.mjs';
import {sharedCatalogueChecks} from './shared-catalogue-checks.mjs';
import {clientEditChecks} from './client-edit-checks.mjs';
import {clientSetupChecks} from './client-setup-checks.mjs';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AsyncLocalStorage} from 'node:async_hooks';
import {createRequire} from 'node:module';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {pglitePool} from './tenant-fixture.mjs';
const require=createRequire(import.meta.url),pg=new PGlite(),context=new AsyncLocalStorage();
const env={...process.env};process.env.F2T_PLATFORM_ADMIN_EMAIL='operator@test.invalid';process.env.F2T_PLATFORM_ADMIN_PASSWORD='fixture-platform-password-long';
const migrations=readdirSync('netlify/database/migrations').sort();
const brandingMigration='20261014141500_fit2trade-branding';
for(const n of migrations.filter(n=>n<'20261011170000'))await pg.exec(readFileSync(`netlify/database/migrations/${n}/migration.sql`,'utf8'));
await pg.exec("INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('preserved','Original Primark learner','original@test.invalid','unused','original','Ireland','2026-10-11')");
for(const n of migrations.filter(n=>n>='20261011170000'&&n!==brandingMigration))await pg.exec(readFileSync(`netlify/database/migrations/${n}/migration.sql`,'utf8'));
const pool=pglitePool(pg),objects=new Map();
const store=options=>{const name=typeof options==='string'?options:options.name;if(!objects.has(name))objects.set(name,new Map());const map=objects.get(name);return {getMetadata:async k=>map.has(k)?{etag:'test',metadata:{}}:null,get:async(k,o)=>map.get(k)??null,set:async(k,v,o={})=>{if(o.onlyIfNew&&map.has(k))return {modified:false};map.set(k,v);return {modified:true}},setJSON:async(k,v)=>{map.set(k,v)},delete:async k=>map.delete(k)};};
globalThis.__tenantTest={pool,store,cookie:()=>context.getStore()?.cookie||'',client:()=>context.getStore()?.client||null};
const dir=mkdtempSync(join(tmpdir(),'eazysafe-tenant-test-')),entry=join(dir,'entry.ts');
writeFileSync(entry,`export * as siteCsv from '${process.cwd()}/lib/site-import-csv.ts';
export * as hierarchyTypes from '${process.cwd()}/lib/hierarchy-types.ts';
export * as hierarchy from '${process.cwd()}/app/api/organisation-hierarchy/route.ts';
export * as siteImport from '${process.cwd()}/app/api/admin/organisation/import/route.ts';
export * as users from '${process.cwd()}/app/api/users/route.ts';
export * as organisation from '${process.cwd()}/app/api/admin/organisation/route.ts';
export * as adminSession from '${process.cwd()}/lib/admin-session.ts';
export * as operators from '${process.cwd()}/app/api/admin/operators/route.ts';
export * as platformAccess from '${process.cwd()}/app/api/platform-access/route.ts';
export * as help from '${process.cwd()}/app/api/help/route.ts';
export * as helpFile from '${process.cwd()}/app/api/help/screenshot/[id]/route.ts';
export * as helpContent from '${process.cwd()}/lib/help-content.ts';
export * as native from '${process.cwd()}/app/api/native-content/route.ts';
export * as nativeAuthor from '${process.cwd()}/app/api/admin/native-content/route.ts';
export * as nativeFile from '${process.cwd()}/app/api/native-media/[id]/route.ts';
export * as hrAdmin from '${process.cwd()}/app/api/admin/integrations/route.ts';
export * as hr from '${process.cwd()}/lib/hr-integration.ts';
export * as hrEndpoint from '${process.cwd()}/app/api/hr/v1/employees/route.ts';
export * as external from '${process.cwd()}/app/api/external-training/route.ts';
export * as externalUpload from '${process.cwd()}/app/api/external-training/evidence/route.ts';
export * as externalFile from '${process.cwd()}/app/api/external-training/evidence/[id]/route.ts';
export * as externalAssessor from '${process.cwd()}/app/api/assessor/route.ts';
export * as externalReport from '${process.cwd()}/lib/training-report.ts';
export * as feedbackAdmin from '${process.cwd()}/app/api/admin/feedback/route.ts';
export * as feedbackReports from '${process.cwd()}/app/api/feedback/reports/route.ts';
export * as feedback from '${process.cwd()}/app/api/feedback/route.ts';
export * as banks from '${process.cwd()}/app/api/admin/question-banks/route.ts';
export * as assessments from '${process.cwd()}/app/api/assessments/route.ts';
export * as quiz from '${process.cwd()}/app/api/courses/quiz/route.ts';
export * as live from '${process.cwd()}/app/api/live-training/route.ts';
export * as liveTypes from '${process.cwd()}/lib/live-training-types.ts';
export * as liveCalendar from '${process.cwd()}/app/api/live-training/calendar/route.ts';
export * as liveJoin from '${process.cwd()}/app/api/live-training/join/route.ts';
export * as liveEvidence from '${process.cwd()}/app/api/live-training/evidence/route.ts';
export * as liveEvidenceFile from '${process.cwd()}/app/api/live-training/evidence/[id]/route.ts';
export * as catalogue from '${process.cwd()}/app/api/admin/catalogue/route.ts';
export * as clientEdit from '${process.cwd()}/app/api/admin/clients/settings/route.ts';
export * as setup from '${process.cwd()}/app/api/admin/clients/setup/route.ts';
export * as activation from '${process.cwd()}/app/api/admin/clients/activation/route.ts';
export * as setupTypes from '${process.cwd()}/lib/client-setup-types.ts';
export * as registration from '${process.cwd()}/app/api/registration/route.ts';
export * as registrationAdmin from '${process.cwd()}/app/api/admin/registration/route.ts';
export * as tenant from '${process.cwd()}/lib/tenant-context.ts';
export * as database from '${process.cwd()}/lib/database.ts';
export * as auth from '${process.cwd()}/lib/admin-auth.ts';
export * as clients from '${process.cwd()}/app/api/admin/clients/route.ts';
export * as prototype from '${process.cwd()}/app/api/prototype/route.ts';
export * as session from '${process.cwd()}/app/api/admin/session/route.ts';
export * as courses from '${process.cwd()}/app/api/courses/route.ts';
export * as adminCourses from '${process.cwd()}/app/api/admin/courses/route.ts';
export * as runtime from '${process.cwd()}/app/api/scorm/route.ts';
export * as content from '${process.cwd()}/app/scorm-content/[token]/[...path]/route.ts';
export * as evidence from '${process.cwd()}/lib/assessment-evidence.ts';
export * as certificates from '${process.cwd()}/lib/certificate-server.ts';
export * as files from '${process.cwd()}/lib/tenant-files.ts';
export * as branding from '${process.cwd()}/lib/tenant-types.ts';
export * as email from '${process.cwd()}/lib/email-templates.ts';
export * as directory from '${process.cwd()}/lib/store-directory.ts';
export * as reports from '${process.cwd()}/app/api/reporting/route.ts';
export * as recovery from '${process.cwd()}/lib/password-recovery.ts';
export * as proxy from '${process.cwd()}/proxy.ts';
export {photoBucket} from '${process.cwd()}/lib/storage.ts';
export {hash} from '${process.cwd()}/lib/server.ts';`);
const next=`export class NextRequest extends Request{};export class NextResponse extends Response{static json(data,o={}){return new this(JSON.stringify(data),{...o,headers:{'content-type':'application/json',...o.headers}})}static next(o={}){const r=new this(null);r.requestHeaders=o.request?.headers;return r;}get cookies(){const h=this.headers;return {set:(name,value,o={})=>{if(typeof name==='object'){o=name;value=name.value;name=name.name;}h.append('set-cookie',name+'='+value+'; Path=/')},delete:name=>h.append('set-cookie',name+'=; Max-Age=0'),getAll:()=>[]}}}`;
await build({entryPoints:[entry],outfile:join(dir,'bundle.mjs'),bundle:true,platform:'node',format:'esm',tsconfig:'tsconfig.json',plugins:[{name:'runtime-fixtures',setup(b){b.onResolve({filter:/^sharp$/},()=>({path:require.resolve('sharp'),external:true}));
 b.onResolve({filter:/^react$/},()=>({path:require.resolve('react'),external:true}));
 b.onResolve({filter:/^(@netlify\/database|@netlify\/blobs|next\/headers|next\/server|next\/navigation)$/},a=>({path:a.path,namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},a=>({loader:'js',contents:a.path==='@netlify/database'?'export const getDatabase=()=>({pool:globalThis.__tenantTest.pool})':a.path==='@netlify/blobs'?'export const getStore=globalThis.__tenantTest.store':a.path==='next/server'?next:a.path==='next/navigation'?'export const redirect=url=>{throw new Error(url)};export const notFound=()=>{throw new Error("not-found")}':`export const headers=async()=>({get:n=>n==='x-lms-client'?globalThis.__tenantTest.client():null});export const cookies=async()=>({get:n=>{const value=globalThis.__tenantTest.cookie().split(';').map(s=>s.trim()).find(s=>s.startsWith(n+'='))?.slice(n.length+1);return value?{value}:undefined;}});`}));
}}]});
const m=await import(join(dir,'bundle.mjs'));let count=0;
const check=async(name,fn)=>{await fn();count++;console.log('PASS '+name)};
const q=async(sql,args=[])=>(await pool.query(sql,args)).rows;
const run=(client,fn,cookie='')=>context.run({client,cookie},fn);
const query=(client,sql,...values)=>run(client,()=>m.database.db().prepare(sql).bind(...values).all()).then(r=>r.results);
function req(path,method='GET',body,cookie=''){const r=new Request('https://test.invalid'+path,{method,headers:{origin:'https://test.invalid','content-type':'application/json',cookie},...(body?{body:JSON.stringify(body)}:{})});r.nextUrl=new URL(r.url);r.cookies={get:n=>{const v=cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith(n+'='))?.slice(n.length+1);return v?{value:v}:undefined}};return r;}
const call=(mod,method,path,body,client='primark',cookie='')=>run(client,()=>mod[method](req(path,method,body,cookie)),cookie);
const cookieFrom=(r,n)=>n+'='+r.headers.get('set-cookie').match(new RegExp(n+'=([^;,]+)'))[1];
let operator,primary,internal,primaryCookie,internalCookie;
try{
 await check('Fit2Trade branding preserves client identity, site references and existing sessions across deployment',async()=>{
  const before=await m.tenant.tenantBySlug('fit2trade');assert.equal(before.id,2);assert.equal(before.slug,'fit2trade');assert.equal(before.name,'EazySafe Internal');
  const sql=readFileSync(`netlify/database/migrations/${brandingMigration}/migration.sql`,'utf8');
  await pg.exec('BEGIN');
  try{
   await pg.exec("INSERT INTO lms_tenant_2.learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('branding-fixture','Preserved learner','branding@test.invalid','unused','eazysafe-internal','Ireland',now()::text); INSERT INTO lms_tenant_2.sessions(token_hash,learner_id,expires_at) VALUES('branding-token','branding-fixture','2099-01-01')");
   await pg.exec(sql);
   assert.equal((await q("SELECT store_id FROM lms_tenant_2.learners WHERE id='branding-fixture'"))[0].store_id,'eazysafe-internal');
   assert.equal((await q("SELECT learner_id FROM lms_tenant_2.sessions WHERE token_hash='branding-token'"))[0].learner_id,'branding-fixture');
   const after=await m.tenant.tenantBySlug('fit2trade');assert.equal(after.name,'Fit2Trade');assert.equal(after.theme_color,'#2E6052');assert.equal(after.logo_url,'/branding/fit2trade-logo.svg');assert.equal(after.schema_name,before.schema_name);assert.equal(after.role_name,before.role_name);assert.equal(after.revision,before.revision+1);
   assert.equal((await m.tenant.tenantBySlug('eazysafe-internal')).id,2);
   assert.equal((await m.tenant.tenantBySlug('primark')).theme_color,'#008bc9');
  }finally{await pg.exec('ROLLBACK');}
  await pg.exec(sql);
 });
 await check('An existing Fit2Trade client is retained and EazySafe is removed only from the active list',async()=>{
  await pg.exec('BEGIN');
  try{
   const [{id}]=await q("SELECT public.lms_create_client('Fit2Trade','fit2trade','/branding/primark-logo.svg','#123456','fixture') AS id");
   await pg.exec("INSERT INTO lms_tenant_2.learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('retained-legacy','Retained learner','retained@test.invalid','unused','eazysafe-internal','Ireland',now()::text)");
   const sql=readFileSync(`netlify/database/migrations/${brandingMigration}/migration.sql`,'utf8');await pg.exec(sql);
   const fit=await m.tenant.tenantBySlug('fit2trade');assert.equal(fit.id,Number(id));assert.equal(fit.theme_color,'#2E6052');assert.equal(fit.logo_url,'/branding/primark-logo.svg');
   assert.equal((await q('SELECT active FROM public.lms_clients WHERE id=2'))[0].active,false);
   assert.equal((await q("SELECT name FROM lms_tenant_2.learners WHERE id='retained-legacy'"))[0].name,'Retained learner');
   assert.equal((await q(`SELECT count(*)::int AS n FROM ${fit.schema_name}.learners`))[0].n,0);
   assert.equal((await m.tenant.tenantBySlug('eazysafe-internal')).id,Number(id));
   await pg.exec(sql);assert.equal((await m.tenant.tenantBySlug('fit2trade')).revision,fit.revision);
  }finally{await pg.exec('ROLLBACK');await q("SELECT setval(pg_get_serial_sequence('public.lms_clients','id'),(SELECT max(id) FROM public.lms_clients),true)");}
 });
 await check('HR credentials and employee writes are tenant scoped',async()=>{
  assert.equal((await call(m.hrAdmin,'GET','/api/admin/integrations',undefined,'primark')).status,403);
  const token='hr_'+'d'.repeat(64);
  await query('primark',"UPDATE organisation_settings SET features=jsonb_set(features,'{hr_integration,enabled}','true')");
  await query('primark',"INSERT INTO hr_credentials(id,name,token_hash,created_by,expires_at) VALUES('tenant-test','Tenant test',?,'test',now()+interval '1 day')",m.hr.digest(token));
  const request=req('/api/hr/v1/employees?client=primark','POST',{employees:[]});request.headers.set('authorization','Bearer '+token);
  assert.equal(await run('primark',()=>m.hr.authenticateHr(request)),'tenant-test');
  await assert.rejects(()=>run('eazysafe-internal',()=>m.hr.authenticateHr(request)),/Invalid/);
  await assert.rejects(()=>query('primark','SELECT * FROM lms_tenant_2.hr_credentials'),/permission denied/);
  assert.equal((await query('eazysafe-internal','SELECT * FROM hr_credentials')).length,0);
  assert.equal((await query('eazysafe-internal','SELECT * FROM hr_events')).length,0);
 });
 await check('Migration preserves Primark data and seeds an independent clean Fit2Trade client',async()=>{
  const clients=await q('SELECT id,name,slug FROM lms_clients ORDER BY id');assert.deepEqual(clients.map(x=>x.name),['Primark','Fit2Trade']);assert.equal(clients[1].slug,'eazysafe-internal');assert.equal((await q("SELECT name FROM public.learners WHERE id='preserved'"))[0].name,'Original Primark learner');
  for(const table of ['learners','courses','course_packages','certificates','assignment_history','email_outbox','learning_invitations'])assert.equal(Number((await q(`SELECT count(*) AS n FROM lms_tenant_2.${table}`))[0].n),0,table);
  assert.equal((await query('eazysafe-internal','SELECT credits_enabled FROM organisation_settings'))[0].credits_enabled,false);
  const stores=await run('eazysafe-internal',()=>m.directory.storeDirectory());assert.equal(stores.length,1);assert.equal(stores[0].name,'Fit2Trade');
 });
 await check('All 88 tables, foreign keys and functions are cloned into each client boundary',async()=>{
  assert.equal((await q('SELECT count(*)::int AS n FROM public.lms_schema_tables'))[0].n,88);
  const foreign=await q(`SELECT n.nspname AS source,other.nspname AS target FROM pg_constraint c JOIN pg_class a ON a.oid=c.conrelid JOIN pg_namespace n ON n.oid=a.relnamespace JOIN pg_class b ON b.oid=c.confrelid JOIN pg_namespace other ON other.oid=b.relnamespace WHERE c.contype='f' AND n.nspname='lms_tenant_2'`);assert(foreign.length>40);assert(foreign.every(f=>f.source===f.target));
  assert.equal((await q("SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='lms_tenant_2' AND p.prosecdef"))[0].n,0);
 });
 await check('Restricted roles reject explicit cross-client queries and control-plane access',async()=>{
  for(const [tenant,other] of [['primark','lms_tenant_2'],['eazysafe-internal','public']]){
   for(const sql of [`SELECT * FROM ${other}.learners`,`UPDATE ${other}.organisation_settings SET credits_enabled=false`,`SELECT * FROM public.lms_clients`,`SELECT * FROM public.admin_passwords`,`SELECT public.lms_create_client('Bad','bad','/branding/eazysafe-logo.png','#e8002a','bad')`])await assert.rejects(query(tenant,sql),/permission denied/);
  }
  for(let i=0;i<4;i++){assert.equal((await query('primark','SELECT current_user AS role'))[0].role,'lms_client_1');assert.equal((await query('eazysafe-internal','SELECT current_user AS role'))[0].role,'lms_client_2');}
  assert.notEqual((await q('SELECT current_user AS role'))[0].role,'lms_client_2');
 });
 await check('Transactions roll back and return connections without leaked role or tenant state',async()=>{
  await assert.rejects(run('eazysafe-internal',()=>m.database.inTransaction(async tx=>{await tx.query("UPDATE organisation_settings SET auto_archive_enabled=true");await tx.query('SELECT * FROM missing_table')})),/does not exist/);
  assert.equal((await query('eazysafe-internal','SELECT auto_archive_enabled FROM organisation_settings'))[0].auto_archive_enabled,false);
  assert.equal((await query('primark','SELECT current_schema() AS schema'))[0].schema,'pg_catalog');
 });
 await check('A reused email and employee ID create separate accounts and sessions',async()=>{
  const primaryStore=(await run('primark',()=>m.directory.storeDirectory(false)))[0];
  for(const [slug,store,password] of [['primark',primaryStore,'Primark-password-123'],['eazysafe-internal',{id:'eazysafe-internal',country:'Ireland'},'Internal-password-123']]){
   const r=await call(m.prototype,'POST','/api/prototype',{action:'register',firstName:'Test',surname:slug,workdayId:'SAME-ID',email:'shared@test.invalid',storeId:store.id,country:store.country,registrationCode:'safety',password},slug);assert.equal(r.status,200,await r.clone().text());
   const cookie=cookieFrom(r,'primark_session'),person=(await query(slug,"SELECT id FROM learners WHERE email='shared@test.invalid'"))[0];if(slug==='primark'){primary=person;primaryCookie=cookie}else{internal=person;internalCookie=cookie;}
  }
  assert.notEqual(primary.id,internal.id);assert.notEqual(primaryCookie,internalCookie);
  const wrong=await call(m.prototype,'POST','/api/prototype',{action:'login',identifier:'shared@test.invalid',password:'Primark-password-123'},'eazysafe-internal');assert.equal(wrong.status,401);
  const state=await (await call(m.prototype,'GET','/api/prototype?view=me',null,'eazysafe-internal',primaryCookie)).json();assert.equal(state.learner,null);assert.equal(state.account,null);
  assert.equal((await call(m.prototype,'POST','/api/prototype',{action:'view',key:'welcome'},'eazysafe-internal',internalCookie)).status,403);
 });
 await check('Platform operators manage clients; client administrators and learners cannot',async()=>{
  const login=await call(m.session,'POST','/api/admin/session',{email:process.env.F2T_PLATFORM_ADMIN_EMAIL,password:process.env.F2T_PLATFORM_ADMIN_PASSWORD},'eazysafe-internal');assert.equal(login.status,200,await login.clone().text());operator=cookieFrom(login,'primark_admin');
  const listed=await call(m.clients,'GET','/api/admin/clients',null,'primark',operator);assert.equal(listed.status,200);const brand=(await listed.json()).clients.find(c=>c.id===2);assert.equal(brand.name,'Fit2Trade');assert.equal(brand.slug,'fit2trade');assert.equal(brand.theme_color,'#2E6052');
  for(const slug of ['fit2trade','eazysafe-internal']){
   assert.equal((await call(m.clients,'POST','/api/admin/clients',{name:'Duplicate portal',slug},'fit2trade',operator)).status,409);
   assert.equal((await call(m.setup,'POST','/api/admin/clients/setup',{requestId:'11111111-1111-4111-8111-111111111111',name:'Duplicate portal',slug},'fit2trade',operator)).status,409);
  }
  const settings=await (await call(m.clientEdit,'GET','/api/admin/clients/settings?id=2',null,'fit2trade',operator)).json();assert.equal(settings.client.slug,'fit2trade');
  const saved=await call(m.clientEdit,'PATCH','/api/admin/clients/settings?id=2',settings,'fit2trade',operator);assert.equal(saved.status,200,await saved.clone().text());assert.equal((await query('fit2trade','SELECT features FROM organisation_settings'))[0].features.job_roles.enabled,true);
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',primaryCookie)).status,403);
  await q("INSERT INTO public.platform_admins(learner_id,assigned_by,updated_at) VALUES($1,'test',now()::text)",[primary.id]);
  assert.equal((await call(m.clients,'GET','/api/admin/clients',null,'primark',primaryCookie)).status,403);
  await q('DELETE FROM public.platform_admins WHERE learner_id=$1',[primary.id]);
 });
 await check('Client creation provisions clean data and custom branding with optimistic edit protection',async()=>{
  const r=await call(m.clients,'POST','/api/admin/clients',{name:'Third Client',slug:'third-client',theme_color:'#703ac1'},'eazysafe-internal',operator);assert.equal(r.status,201,await r.clone().text());
  const list=await (await call(m.clients,'GET','/api/admin/clients',null,'primark',operator)).json();const third=list.clients.find(c=>c.slug==='third-client');assert.equal(third.id,3);assert.equal(third.theme_color,'#703ac1');
  assert.equal((await query('third-client','SELECT * FROM learners')).length,0);assert.equal((await query('third-client','SELECT * FROM courses')).length,0);assert.equal((await query('third-client','SELECT * FROM organisation_stores')).length,0);
  const change={...third,name:'Renamed Client',theme_color:'#f1d200'};assert.equal((await call(m.clients,'PATCH','/api/admin/clients',change,'primark',operator)).status,200);assert.equal((await call(m.clients,'PATCH','/api/admin/clients',change,'primark',operator)).status,409);
  assert.equal((await call(m.clients,'POST','/api/admin/clients',{name:'Invalid',slug:'public;drop-table'},'primark',operator)).status,400);
  assert.equal((await call(m.clients,'PATCH','/api/admin/clients',{...third,logo_url:'javascript:alert(1)'},'primark',operator)).status,400);
 });
 await check('Client 2 assignment, SCORM completion and certificate functions use only client 2 records',async()=>{
  const at=new Date().toISOString();await query('eazysafe-internal',"INSERT INTO courses(id,title,status,audience_json,created_at,updated_at,catalogue_scope,validity_months) VALUES('internal-course','Internal training','published','{}',?,?,'global',12)",at,at);
  await query('eazysafe-internal',`INSERT INTO course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES('internal-pack','internal-course','training.zip','ready','[{"id":"sco","title":"Lesson","href":"index.html","mastery":"","launchData":""}]',1,10,?)`,at);
  await query('eazysafe-internal',"UPDATE courses SET package_id='internal-pack' WHERE id='internal-course'");
  await query('eazysafe-internal',"SELECT assign_credit_course(?,'internal-course','test')",internal.id);
  await query('eazysafe-internal',"INSERT INTO scorm_progress(learner_id,package_id,sco_id,status,completed_at,updated_at) VALUES(?,'internal-pack','sco','passed',?,?)",internal.id,at,at);
  await query('eazysafe-internal',"SELECT issue_course_certificate(?,'internal-pack')",internal.id);
  const cert=(await query('eazysafe-internal','SELECT * FROM certificates WHERE learner_id=?',internal.id))[0];assert(cert);assert.equal(cert.course_title,'Internal training');
  assert.equal(await run('primark',()=>m.certificates.certificateForToken(cert.token)),null);
  const mine=await (await call(m.courses,'GET','/api/courses',null,'eazysafe-internal',internalCookie)).json();assert(mine.courses.some(c=>c.id==='internal-course'));
  assert.equal((await query('primark',"SELECT * FROM assignment_history WHERE course_id='internal-course'")).length,0);
  assert.equal((await query('primark',"SELECT * FROM audit_events WHERE entity_id='internal-course'")).length,0);
  const launch=await call(m.runtime,'POST','/api/scorm',{action:'launch',courseId:'internal-course'},'eazysafe-internal',internalCookie);assert.equal(launch.status,200,await launch.clone().text());const data=await launch.json();
  const foreign=await run('primark',()=>m.content.GET(req('/scorm-content/'+data.token+'/index.html'),{params:Promise.resolve({token:data.token,path:['index.html']})}),primaryCookie);assert.equal(foreign.status,401);
 });
 await check('Storage namespaces differ even when package and evidence IDs are identical',async()=>{
  const a=await run('primark',()=>m.files.tenantFileKey('scorm/same-id/index.html')),b=await run('eazysafe-internal',()=>m.files.tenantFileKey('scorm/same-id/index.html'));assert.equal(a,'scorm/same-id/index.html');assert.equal(b,'clients/2/scorm/same-id/index.html');
  await assert.rejects(run('eazysafe-internal',()=>m.files.assertTenantFileKey(a)));await assert.rejects(run('primark',()=>m.files.assertTenantFileKey(b)));
  const one=await run('primark',()=>m.evidence.evidenceStore()),two=await run('eazysafe-internal',()=>m.evidence.evidenceStore());await one.set('same-id',new Uint8Array([1]));assert.equal(await two.get('same-id'),null);
 });
 await check('Email links, certificates and theme contrast retain the selected client',async()=>{
  const brand=await run('eazysafe-internal',()=>m.tenant.currentTenant());const email=m.email.renderLearningEmail('invitation',{name:'Test'},'https://lms.test', 'test-token',brand);
  assert(email.TextBody.includes('client=fit2trade'));assert(email.HtmlBody.toLowerCase().includes('#2e6052'));assert(!email.HtmlBody.includes('PRIMARK'));assert(email.HtmlBody.includes('/api/client-logo?client=fit2trade'));
  assert.equal(m.branding.themeVariables('#ffffff')['--brand-contrast'],'#17212b');assert.equal(m.branding.themeVariables('#111111')['--brand-contrast'],'#ffffff');assert.equal(m.branding.portalUrl('primark','/verify/token?lang=en#section'),'/verify/token?lang=en&client=primark#section');
 });
 await check('Spoofed routing headers are replaced and stale tabs cannot write to a newly selected client',async()=>{
  const r=req('/api/users','POST',{},'lms_client=eazysafe-internal');r.headers.set('x-lms-client','primark');
  const resolved=m.proxy.proxy(r);assert.equal(resolved.requestHeaders.get('x-lms-client'),'fit2trade');
  r.headers.set('x-lms-expected-client','primark');const denied=m.proxy.proxy(r);assert.equal(denied.status,409);
 });
 await check('Background processing iterates clients with a separately authorised context',async()=>{
  const seen=[];await m.tenant.forEachTenant(async()=>{const t=await m.tenant.currentTenant();seen.push([t.id,(await m.database.db().prepare('SELECT current_user AS role').first()).role]);});assert.deepEqual(seen,[[1,'lms_client_1'],[2,'lms_client_2'],[3,'lms_client_3']]);
 });
 await check('Password reset tokens and new passwords remain inside the issuing client',async()=>{
  const beforeFetch=globalThis.fetch,keys=['LMS_EMAIL_DELIVERY','CONTEXT','POSTMARK_SERVER_TOKEN','POSTMARK_FROM_EMAIL','PRIMARK_APP_URL'],before=keys.map(k=>process.env[k]);let mail;
  try{
   Object.assign(process.env,{LMS_EMAIL_DELIVERY:'enabled',CONTEXT:'production',POSTMARK_SERVER_TOKEN:'fixture-only',POSTMARK_FROM_EMAIL:'fixture@test.invalid',PRIMARK_APP_URL:'https://test.invalid'});
   globalThis.fetch=async(_url,options)=>{mail=JSON.parse(options.body);return Response.json({ErrorCode:0})};
   await run('eazysafe-internal',()=>m.recovery.requestPasswordReset('shared@test.invalid','en',true));
   assert(mail.TextBody.includes('client=fit2trade'));const token=mail.TextBody.match(/#token=([a-f0-9]{64})/)[1];
   await assert.rejects(run('primark',()=>m.recovery.resetPassword(token,'Changed-internal-password')),/expired/);
   await run('eazysafe-internal',()=>m.recovery.resetPassword(token,'Changed-internal-password'));
   await assert.rejects(run('eazysafe-internal',()=>m.recovery.resetPassword(token,'Another-password')),/expired/);
   assert.equal((await call(m.prototype,'POST','/api/prototype',{action:'login',identifier:'shared@test.invalid',password:'Primark-password-123'},'primark')).status,200);
   assert.equal((await call(m.prototype,'POST','/api/prototype',{action:'login',identifier:'shared@test.invalid',password:'Changed-internal-password'},'eazysafe-internal')).status,200);
  }finally{globalThis.fetch=beforeFetch;keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i]});}
 });
 await check('Assessment endpoints and bank content remain isolated across existing and new clients',async()=>{
  const login=await call(m.prototype,'POST','/api/prototype',{action:'login',identifier:'shared@test.invalid',password:'Changed-internal-password'},'eazysafe-internal');assert.equal(login.status,200);const currentInternalCookie=cookieFrom(login,'primark_session');
  const question={prompt:'Tenant private question',options:['Yes','No'],correctIndex:0};
  const created=await call(m.banks,'POST','/api/admin/question-banks',{name:'Private bank',shared:false,questions:[question]},'primark',operator);
  assert.equal(created.status,200,await created.clone().text());const bankId=(await created.json()).id;
  for(const slug of ['eazysafe-internal','third-client']){
   const banks=await (await call(m.banks,'GET','/api/admin/question-banks',null,slug,operator)).json();assert.equal(banks.banks.length,0);
   assert.equal((await call(m.banks,'POST','/api/admin/question-banks',{id:bankId,revision:1,name:'Overwrite',shared:false,questions:[question]},slug,operator)).status,404);
   assert.equal((await call(m.assessments,'POST','/api/assessments',{assignmentId:'foreign-assignment',reason:'Attempt grant',requestId:crypto.randomUUID()},slug,operator)).status,404);
   assert.equal((await query(slug,'SELECT count(*) AS n FROM course_quiz_sessions'))[0].n,0);
   await assert.rejects(query(slug,'SELECT * FROM public.question_banks'),/permission denied/);
   await assert.rejects(query(slug,'SELECT * FROM public.feedback_responses'),/permission denied/);
   await assert.rejects(query(slug,'SELECT * FROM public.feedback_eligibility'),/permission denied/);
  }
  assert.equal((await call(m.quiz,'GET','/api/courses/quiz?courseId=foreign-course',null,'eazysafe-internal',currentInternalCookie)).status,404);
  assert.equal((await call(m.quiz,'POST','/api/courses/quiz',{courseId:'foreign-course',assignmentId:'foreign-assignment',action:'start'},'eazysafe-internal',currentInternalCookie)).status,409);
  assert.equal((await call(m.assessments,'GET','/api/assessments',null,'eazysafe-internal',primaryCookie)).status,403);
 });
 await sharedCatalogueChecks({m,check,q,query,run,call,req,operator,primaryCookie});
 await check('Native catalogue distribution copies protected media and denies cross-client authoring',async()=>{
  const base={title:'FICTIONAL shared native course',description:'Fixture',status:'draft',deliveryType:'native',audience:{countries:[],sites:[],users:[]},catalogueScope:'global'};
  let r=await call(m.adminCourses,'POST','/api/admin/courses',base,'primark',operator);assert.equal(r.status,200,await r.clone().text());let c=(await r.json()).course;
  const mediaId=crypto.randomUUID(),lessonId=crypto.randomUUID();
  const content={schemaVersion:1,sequential:false,lessons:[{id:lessonId,title:'Fictional lesson',required:true,blocks:[{id:crypto.randomUUID(),type:'image',mediaId,caption:'Test',alt:'Test image',decorative:false}]}]};
  const storageContext=m.evidence.evidenceContext();
  await query('primark','INSERT INTO native_media(id,course_id,filename,mime_type,size,sha256,storage_context,created_by) VALUES(?,?,?, ?,4,?,?,?)',mediaId,c.id,'test.webp','image/webp','hash',storageContext,'test');
  await run('primark',async()=>(await m.evidence.evidenceStore()).set('native/'+mediaId,new TextEncoder().encode('TEST').buffer));
  r=await call(m.nativeAuthor,'POST','/api/admin/native-content',{courseId:c.id,revision:1,content},'primark',operator);assert.equal(r.status,200,await r.clone().text());const revision=(await r.json()).draft.revision;
  assert.equal((await call(m.nativeAuthor,'GET','/api/admin/native-content?courseId='+c.id,null,'eazysafe-internal',operator)).status,404);
  await assert.rejects(()=>query('eazysafe-internal','SELECT * FROM public.native_drafts'),/permission denied/);
  r=await call(m.adminCourses,'POST','/api/admin/courses',{...base,id:c.id,revision:c.revision,status:'published',publishNative:true,contentRevision:revision},'primark',operator);assert.equal(r.status,200,await r.clone().text());c=(await r.json()).course;
  r=await call(m.catalogue,'POST','/api/admin/catalogue',{action:'publish',sourceClientId:1,courseId:c.id,revision:c.revision},'primark',operator);assert.equal(r.status,200,await r.clone().text());const release=await r.json();
  r=await call(m.catalogue,'POST','/api/admin/catalogue',{action:'distribute',sourceClientId:1,clientId:3,releaseId:release.id,version:0},'primark',operator);assert.equal(r.status,200,await r.clone().text());const target=(await r.json()).courseId;
  assert.equal((await query('third-client','SELECT delivery_type FROM courses WHERE id=?',target))[0].delivery_type,'native');
  const published=(await query('third-client','SELECT native_json FROM course_packages WHERE course_id=?',target))[0].native_json;assert.deepEqual(published,content);
  assert.equal((await query('third-client','SELECT course_id FROM native_media WHERE id=?',mediaId))[0].course_id,target);
  const copied=await run('third-client',async()=>(await m.evidence.evidenceStore()).get('native/'+mediaId,{type:'arrayBuffer'}));assert.equal(new TextDecoder().decode(copied),'TEST');
  assert.equal((await call(m.nativeAuthor,'GET','/api/admin/native-content?courseId='+target,null,'third-client',operator)).status,403);
  const denied=await run('eazysafe-internal',()=>m.nativeFile.GET(req('/api/native-media/'+mediaId+'?courseId='+target),{params:Promise.resolve({id:mediaId})}),operator);assert.equal(denied.status,404);
 });

 await helpChecks({m,check,q,query,run,call,req,operator,primaryCookie,internalCookie});
 await liveTrainingChecks({m,check,q,query,run,call,req,operator,primaryCookie});

 await check('Course tile images validate, stay tenant-scoped, survive metadata edits and can be removed',async()=>{
  const sharp=(await import('sharp')).default;
  const image='data:image/png;base64,'+(await sharp({create:{width:40,height:30,channels:3,background:'#aa6600'}}).png().toBuffer()).toString('base64');
  const body={title:'Image fixture',description:'',status:'draft',audience:{countries:[],sites:[],users:[]},coverImage:image};
  const create=await call(m.adminCourses,'POST','/api/admin/courses',body,'eazysafe-internal',operator);assert.equal(create.status,200,await create.clone().text());
  let c=(await create.json()).course;assert.match(c.cover_image,/^data:image\/jpeg;base64,/);
  assert.equal((await query('primark','SELECT id FROM courses WHERE id=?',c.id)).length,0);
  assert.equal((await call(m.adminCourses,'POST','/api/admin/courses',{...body,id:c.id,revision:c.revision,coverImage:'data:image/png;base64,YmFk'},'eazysafe-internal',operator)).status,400);
  const preserved=await call(m.adminCourses,'POST','/api/admin/courses',{...body,id:c.id,revision:c.revision,coverImage:undefined},'eazysafe-internal',operator);assert.equal(preserved.status,200);const next=(await preserved.json()).course;assert.equal(next.cover_image,c.cover_image);c=next;
  const removed=await call(m.adminCourses,'POST','/api/admin/courses',{...body,id:c.id,revision:c.revision,coverImage:null},'eazysafe-internal',operator);assert.equal(removed.status,200);assert.equal((await removed.json()).course.cover_image,null);
 });
 await hierarchyChecks({m,check,q,query,run,call,operator});
 await clientSetupChecks({m,check,q,query,run,call,req,cookieFrom,operator,primaryCookie});
 await clientEditChecks({m,check,q,query,run,call,req,operator,primaryCookie});
 await externalTrainingChecks({m,check,q,query,run,call,req,operator});
 await platformOperatorChecks({m,check,q,query,run,call,req,cookieFrom,operator,primaryCookie,primary});
 console.log(`${count} multi-tenant integration checks passed. All records stayed in local PGlite.`);
}finally{await pg.close();rmSync(dir,{recursive:true,force:true});Object.assign(process.env,env);delete globalThis.__tenantTest;}
