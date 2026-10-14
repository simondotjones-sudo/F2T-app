import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {tenantFixture,pglitePool} from './tenant-fixture.mjs';
const pg=new PGlite();
for(const n of readdirSync('netlify/database/migrations').sort().filter(n=>!n.includes('sample-learner-induction-completion')))await pg.exec(readFileSync(`netlify/database/migrations/${n}/migration.sql`,'utf8'));
globalThis.__hrTest={pool:pglitePool(pg)};
const dir=mkdtempSync(join(tmpdir(),'hr-check-'));
writeFileSync(join(dir,'entry.ts'),`export * from '${process.cwd()}/lib/hr-integration.ts';export * as endpoint from '${process.cwd()}/app/api/hr/v1/employees/route.ts';export * as admin from '${process.cwd()}/app/api/admin/integrations/route.ts';`);
await build({entryPoints:[join(dir,'entry.ts')],outfile:join(dir,'bundle.mjs'),bundle:true,platform:'node',format:'esm',tsconfig:'tsconfig.json',plugins:[tenantFixture,{name:'test',setup(b){
 b.onResolve({filter:/^@netlify\/database$/},()=>({path:'db',namespace:'test'}));
 b.onResolve({filter:/^@\/lib\/admin-auth$/},()=>({path:'auth',namespace:'test'}));
 b.onResolve({filter:/^next\/headers$/},()=>({path:'cookies',namespace:'test'}));
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='db'?'export const getDatabase=()=>({pool:globalThis.__hrTest.pool});':a.path==='auth'?'export const getAdminUser=async()=>({email:"platform@test.invalid"});export const credentials=()=>null;export const namedPlatformOperator=async()=>null;export const operatorFingerprint=()=>"unused";export const allowLoginAttempt=async()=>true;export const credentialFingerprint=async()=>"unused";export const sessionCredentialFingerprint=async()=>"unused";':a.path==='cookies'?'export const cookies=async()=>({get:()=>undefined});':'export class NextRequest extends Request {}; export const NextResponse=Response;',loader:'js'}));
}}]});
const m=await import(join(dir,'bundle.mjs'));
const q=async(s,...v)=>(await pg.query(s,v)).rows;
const one=async(s,...v)=>(await q(s,...v))[0];
let checks=0;async function check(name,fn){await fn();checks++;console.log('PASS '+name);}
const today=new Date().toISOString().slice(0,10),past='2020-01-01';
const token='hr_'+'a'.repeat(64),key='payroll';
const req=(body,credential=token)=>{const r=new Request('https://local.test/api/hr/v1/employees?client=primark',{method:'POST',headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:JSON.stringify(body)});r.nextUrl=new URL(r.url);return r;};
const admin=async body=>{const r=new Request('https://local.test/api/admin/integrations',{method:'POST',headers:{Origin:'https://local.test','Content-Type':'application/json'},body:JSON.stringify(body)});r.nextUrl=new URL(r.url);const response=await m.admin.POST(r);return {status:response.status,...await response.json()};};
try{
 await q(`UPDATE organisation_settings SET credits_enabled=false,features=jsonb_set(features,'{hr_integration,enabled}','true')`);
 await q("INSERT INTO hr_credentials(id,name,token_hash,created_by,expires_at) VALUES($1,'Payroll',$2,'test',now()+interval '1 year')",key,m.digest(token));
 const store=await one('SELECT id FROM organisation_stores WHERE active AND deleted_at IS NULL LIMIT 1');
 const starter={eventId:'start-1',employeeId:'0000123',action:'starter',effectiveDate:today,reason:'Payroll starter',name:'Test Starter',email:'hr-test@example.com',storeId:store.id};
 await check('dry run validates without creating employee or event',async()=>{assert.equal((await m.processHrEvent(key,starter,true)).status,'valid');assert.equal((await q("SELECT id FROM learners WHERE workday_id='0000123'")).length,0);assert.equal((await q('SELECT id FROM hr_events')).length,0);});
 let learner;
 await check('starter creates existing learner record and idempotent replay',async()=>{const r=await m.processHrEvent(key,starter);assert.equal(r.status,'applied');learner=r.learnerId;assert.ok(learner);assert.equal((await m.processHrEvent(key,starter)).replayed,true);assert.equal((await q("SELECT id FROM learners WHERE workday_id='0000123'")).length,1);assert.equal((await one('SELECT hr_managed,password_hash FROM learners WHERE id=$1',learner)).password_hash,null);});
 await check('changed payload conflicts without duplicate mutation',async()=>{await assert.rejects(()=>m.processHrEvent(key,{...starter,name:'Changed'}),/different payload/);});
 await check('manual payroll-owned field overwrite is blocked',async()=>{await assert.rejects(()=>q('UPDATE learners SET name=$2 WHERE id=$1',learner,'Unwanted'),/Payroll manages/);});
 await check('updates preserve omitted values and audit actor',async()=>{assert.equal((await m.processHrEvent(key,{eventId:'update-1',employeeId:'0000123',action:'update',effectiveDate:today,reason:'Changed details',name:'Updated Starter'})).status,'applied');assert.equal((await one('SELECT email FROM learners WHERE id=$1',learner)).email,starter.email);assert.ok((await q("SELECT id FROM audit_events WHERE learner_id=$1 AND actor='hr-api:payroll'",learner)).length);});
 await check('leave clears access and rehire keeps same learner',async()=>{await q("INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES('test-session',$1,'2099-01-01')",learner);assert.equal((await m.processHrEvent(key,{eventId:'leave-1',employeeId:'0000123',action:'leave',effectiveDate:today,reason:'Employment ended'})).status,'applied');assert.ok((await one('SELECT archived_at FROM learners WHERE id=$1',learner)).archived_at);assert.equal((await q('SELECT * FROM sessions WHERE learner_id=$1',learner)).length,0);const r=await m.processHrEvent(key,{eventId:'rehire-1',employeeId:'0000123',action:'rehire',effectiveDate:today,reason:'Employment resumed'});assert.equal(r.status,'applied');assert.equal(r.learnerId,learner);assert.equal((await one('SELECT archived_at FROM learners WHERE id=$1',learner)).archived_at,null);});
 await check('future event queues and revalidates when due',async()=>{const event={eventId:'future',employeeId:'0000123',action:'update',effectiveDate:'2099-01-01',reason:'Future update',name:'Future Name'};assert.equal((await m.processHrEvent(key,event)).status,'scheduled');assert.equal((await one('SELECT name FROM learners WHERE id=$1',learner)).name,'Updated Starter');await q("UPDATE hr_events SET effective_on=CURRENT_DATE WHERE id='future'");await m.runScheduledHr();assert.equal((await one("SELECT status FROM hr_events WHERE id='future'")).status,'scheduled');});
 await check('due events apply once and stale dates are rejected',async()=>{
  const payload={eventId:'due',employeeId:'0000123',action:'update',effectiveDate:today,reason:'Scheduled update',name:'Due Name'};
  await q("INSERT INTO hr_events(id,credential_id,employee_id,payload,payload_hash,effective_on,status) VALUES($1,$2,$3,$4,$5,$6,'scheduled')",payload.eventId,key,payload.employeeId,JSON.stringify(payload),m.digest(JSON.stringify(payload)),today);
  await m.runScheduledHr();assert.equal((await one("SELECT status FROM hr_events WHERE id='due'")).status,'applied');
  assert.equal((await one('SELECT name FROM learners WHERE id=$1',learner)).name,'Due Name');
  await m.runScheduledHr();assert.equal((await one("SELECT count(*)::int n FROM audit_events WHERE learner_id=$1 AND reason LIKE 'HR due:%'",learner)).n,1);
  const old=await m.processHrEvent(key,{...payload,eventId:'stale',effectiveDate:past});assert.equal(old.status,'failed');assert.match(old.error,/newer effective/);
 });
 await check('admin cancellation and release payroll ownership',async()=>{assert.equal((await admin({action:'release',id:learner})).status,409);assert.equal((await admin({action:'cancel',id:'future'})).status,200);assert.equal((await admin({action:'release',id:learner})).status,200);await q('UPDATE learners SET name=$2 WHERE id=$1',learner,'Manual Name');});
 await check('row errors do not undo valid batch rows',async()=>{const r=await m.endpoint.POST(req({employees:[{...starter,eventId:'invalid',employeeId:'unknown',storeId:'wrong'},{...starter,eventId:'start-2',employeeId:'0000124',email:null}]}));assert.equal(r.status,200);const body=await r.json();assert.deepEqual(body.results.map(r=>r.status),['failed','applied']);});
 await check('administrator employee changes are denied',async()=>{await q("INSERT INTO platform_admins(learner_id,assigned_by,updated_at) VALUES($1,'test',now())",learner);assert.equal((await m.processHrEvent(key,{eventId:'admin-denied',employeeId:'0000123',action:'leave',effectiveDate:today,reason:'No admin access'})).status,'failed');assert.equal((await one('SELECT archived_at FROM learners WHERE id=$1',learner)).archived_at,null);});
 await check('malformed dates and privilege fields rejected',async()=>{assert.equal((await m.processHrEvent(key,{...starter,eventId:'bad-date',effectiveDate:'2026-02-30'})).status,'failed');assert.equal((await m.processHrEvent(key,{...starter,eventId:'bad-role',role:'platform'})).status,'failed');});
 await check('unknown tokens rejected and rate limits enforced',async()=>{await assert.rejects(()=>m.authenticateHr(req({},'hr_'+'b'.repeat(64))),/Invalid/);await q('UPDATE hr_credentials SET requests=60,window_start=now() WHERE id=$1',key);await assert.rejects(()=>m.authenticateHr(req({})),/Rate limit/);await q('UPDATE hr_credentials SET requests=0 WHERE id=$1',key);});
 await check('rotation invalidates old token and revocation blocks new token',async()=>{const r=await admin({action:'rotate',id:key});assert.equal(r.status,200);assert.ok(r.token);await assert.rejects(()=>m.authenticateHr(req({})),/Invalid/);assert.equal(await m.authenticateHr(req({},r.token)),key);assert.equal((await admin({action:'revoke',id:key})).status,200);await assert.rejects(()=>m.authenticateHr(req({},r.token)),/Invalid/);});
 await check('template contains schema but no credentials or employee events',async()=>{assert.equal((await q('SELECT * FROM lms_template.hr_credentials')).length,0);assert.equal((await q('SELECT * FROM lms_template.hr_events')).length,0);assert.equal((await q("SELECT name FROM lms_schema_tables WHERE name IN ('hr_events','hr_credentials')")).length,2);});
 console.log(`${checks} HR integration checks passed`);
}finally{await pg.close();rmSync(dir,{recursive:true,force:true});delete globalThis.__hrTest;}
