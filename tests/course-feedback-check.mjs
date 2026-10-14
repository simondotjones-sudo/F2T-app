import {tenantFixture,pglitePool} from './tenant-fixture.mjs';
// The named sample-account data migration is covered separately by sample-completion-check.mjs.
import {learningControlsChecks} from './learning-controls-checks.mjs';
import { certificateChecks } from './certificate-checks.mjs';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { build } from 'esbuild';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require=createRequire(import.meta.url);

const dir=mkdtempSync(join(tmpdir(),'primark-course-check-'));
const pg=new PGlite();
for(const name of readdirSync('netlify/database/migrations').sort().filter(n=>n!=='20261009160000_sample-learner-induction-completion'))await pg.exec(readFileSync('netlify/database/migrations/'+name+'/migration.sql','utf8'));
const context=new AsyncLocalStorage();
const pool=pglitePool(pg);
const blobs=new Map();
const store={async set(key,value){blobs.set(key,await new Response(value).arrayBuffer());},async setJSON(key,value){blobs.set(key,structuredClone(value));},async get(key,options){const value=blobs.get(key);if(value===undefined)return null;return options?.type==='json'?structuredClone(value):value.slice(0);}};
globalThis.__courseTest={pool,store,cookie:()=>context.getStore()?.user,user:()=>context.getStore()?.admin?{email:'admin@example.test',platformOperator:!!context.getStore()?.operator}:null};
async function query(sql,...values){let n=0;return pool.query(sql.replace(/\?/g,()=>'$'+(++n)),values);}
async function first(sql,...values){return (await query(sql,...values)).rows[0];}
const entry=join(dir,'entry.ts');
writeFileSync(entry,`export * as feedback from '${process.cwd()}/app/api/feedback/route.ts';
export * as feedbackAdmin from '${process.cwd()}/app/api/admin/feedback/route.ts';
export * as feedbackReports from '${process.cwd()}/app/api/feedback/reports/route.ts';
export * as feedbackHelpers from '${process.cwd()}/lib/feedback.ts';
export * as feedbackStats from '${process.cwd()}/lib/feedback-report.ts';
export * as feedbackTypes from '${process.cwd()}/lib/feedback-types.ts';
export {default as certificatePage} from '${process.cwd()}/app/certificates/[token]/page.tsx';
export * as certificates from '${process.cwd()}/app/api/certificates/route.ts';
export * as certificateServer from '${process.cwd()}/lib/certificate-server.ts';
export * as certificateTypes from '${process.cwd()}/lib/certificates.ts';
export * as banks from '${process.cwd()}/app/api/admin/question-banks/route.ts';
export * as assessments from '${process.cwd()}/app/api/assessments/route.ts';
export * as grading from '${process.cwd()}/lib/course-quiz.ts';
export * as quiz from '${process.cwd()}/app/api/courses/quiz/route.ts';
export * as settings from '${process.cwd()}/app/api/admin/settings/route.ts';
export * as compliance from '${process.cwd()}/lib/compliance.ts';
export * as training from '${process.cwd()}/lib/training-report.ts';
export * as reportTypes from '${process.cwd()}/lib/training-report-types.ts';
export * as admin from '${process.cwd()}/app/api/admin/courses/route.ts';
export * as packages from '${process.cwd()}/app/api/admin/packages/route.ts';
export * as upload from '${process.cwd()}/app/api/admin/packages/[id]/files/route.ts';
export * as courses from '${process.cwd()}/app/api/courses/route.ts';
export * as runtime from '${process.cwd()}/app/api/scorm/route.ts';
export * as content from '${process.cwd()}/app/scorm-content/[token]/[...path]/route.ts';
export * as api from '${process.cwd()}/lib/scorm-runtime.ts';
export * as manifest from '${process.cwd()}/lib/scorm-manifest.ts';
export * as types from '${process.cwd()}/lib/course-types.ts';
export * as rise from '${process.cwd()}/lib/rise-progress.ts';
export {hash} from '${process.cwd()}/lib/server.ts';
export {default as stores} from '${process.cwd()}/lib/stores.json';`);
await build({entryPoints:[entry],outfile:join(dir,'bundle.mjs'),bundle:true,platform:'node',format:'esm',packages:'bundle',tsconfig:'tsconfig.json',loader:{'.css':'empty'},plugins:[tenantFixture,{name:'local-test-bindings',setup(b){
 b.onResolve({filter:/^qrcode$/},()=>({path:require.resolve('qrcode'),external:true}));
 b.onResolve({filter:/^@netlify\/database$/},()=>({path:'db',namespace:'test'}));
 b.onResolve({filter:/^@netlify\/blobs$/},()=>({path:'blobs',namespace:'test'}));
 b.onResolve({filter:/^@\/lib\/admin-auth$/},()=>({path:'auth',namespace:'test'}));
 b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'test'}));
 b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'test'}));
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'test'}));
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='headers'?`export const cookies=async()=>({get:()=>globalThis.__courseTest.cookie()?{value:globalThis.__courseTest.cookie()}:undefined});`:a.path==='navigation'?`export const usePathname=()=>'/';export const redirect=()=>{throw new Error('redirect')};export const notFound=()=>{throw new Error('not-found')};`:a.path==='db'?'export const getDatabase=()=>({pool:globalThis.__courseTest.pool});':a.path==='blobs'?'export const getStore=()=>globalThis.__courseTest.store;':a.path==='auth'?'export const getAdminUser=async()=>globalThis.__courseTest.user();export const getPlatformOperator=async()=>globalThis.__courseTest.user()?.platformOperator?globalThis.__courseTest.user():null;':`export class NextRequest extends Request{};export const NextResponse=Response;`,loader:'js'}));
}}]});
const m=await import(join(dir,'bundle.mjs'));
let tests=0;
async function check(name,fn){await fn();console.log('PASS '+name);tests++;}
async function call(mod,method,body,{admin=false,operator=false,user='',url='https://local.test/api',params,origin='https://local.test'}={}){return context.run({admin,user,operator},async()=>{const req=new Request(url,{method,headers:{...(body instanceof Uint8Array?{'Content-Length':String(body.length)}:{'Content-Type':'application/json'}),...(user?{cookie:'primark_session='+user}:{}),origin},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});req.nextUrl=new URL(req.url);req.cookies={get:name=>name==='primark_session'&&user?{value:user}:undefined};const res=await mod[method](req,{params:Promise.resolve(params||{})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text(),headers:res.headers};});}
const ireland=m.stores.find(s=>s.country==='Ireland');
async function learner(id){await query('INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES(?,?,?,?,?,?,?)',id,id,id+'@example.test','unused',ireland.id,ireland.country,new Date().toISOString());await query('INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES(?,?,?)',await m.hash(id),id,'2099-01-01T00:00:00Z');}
for(const id of ['org','site','country',...Array.from({length:7},(_,i)=>'user'+i)])await learner(id);
await query("INSERT INTO reporting_access VALUES('org','organisation',NULL,NULL,'test','2026-01-01'),('site','site','Ireland',?,'test','2026-01-01'),('country','country','Ireland',NULL,'test','2026-01-01')",ireland.id);
const admin={admin:true,operator:true},org={user:'org'};
const post=(body,opts=admin)=>call(m.feedbackAdmin,'POST',body,opts);
const mine=user=>call(m.feedback,'GET',undefined,{user});
const report=(url='https://local.test/api',opts=org)=>call(m.feedbackReports,'GET',undefined,{...opts,url});
let template=m.feedbackTypes.starterFeedback(),surveyId,courseId,liveId,originalInvitation;
const responses=[5,4,3,2,1].map(n=>[n,n,n,n,null]);
const submit=(inv,user,answers=responses[0])=>call(m.feedback,'POST',{id:inv.id,version:inv.version,mode:inv.mode,answers},{user});
async function complete(user,course=courseId){await query("SELECT assign_credit_course(?,?,'test',now(),false,false,'test')",user,course);const a=await first('SELECT history_id FROM course_assignments WHERE learner_id=? AND course_id=?',user,course);await query("UPDATE assignment_history SET completed_at='2026-10-12T12:00:00Z' WHERE id=?",a.history_id);return a.history_id;}
try{
 await check('Feature migration covers both clients and clean template; no private defaults',async()=>{
  for(const schema of ['public','lms_tenant_2','lms_template']){
   assert.equal((await first(`SELECT features->'course_feedback' AS f FROM ${schema}.organisation_settings`)).f.enabled,true);
   assert.equal((await first(`SELECT count(*)::int AS n FROM ${schema}.feedback_responses`)).n,0);
  }
  assert.equal((await first("SELECT count(*)::int AS n FROM lms_schema_tables WHERE name LIKE 'feedback_%'")).n,5);
  // Explicit restricted-role cross-schema attempt on one connection.
  const tx=await pool.connect();try{await tx.query('BEGIN');await tx.query('SET LOCAL ROLE lms_client_2');await assert.rejects(()=>tx.query('SELECT * FROM public.feedback_responses'),/permission/i);await tx.query('ROLLBACK');}finally{tx.release();}
 });
 await check('Author/report permissions, shared protection, feature and origin checks',async()=>{
  for(const user of ['user0','site','country'])assert.equal((await post(template,{user})).status,403);
  assert.equal((await post(template,org)).status,403);
  await query(`UPDATE organisation_settings SET features=jsonb_set(features,'{client_course_management}',?::jsonb)`,JSON.stringify({policy:'optional',enabled:true}));
  assert.equal((await post({...template,shared:true},org)).status,403);
  assert.equal((await post({...template,shared:true},{admin:true})).status,403);
  assert.equal((await post(template,{...admin,origin:'https://evil.test'})).status,403);
  let r=await post(template,org);assert.equal(r.status,200,JSON.stringify(r.data));surveyId=r.data.id;template={...template,id:surveyId,revision:r.data.revision};
  for(const user of ['user0','site','country'])assert.equal((await report('https://local.test/api',{user})).status,403);
  assert.equal((await report('https://local.test/api?learner=user0')).status,400);
  assert.equal((await report('https://local.test/api?role=global')).status,400);
  assert.equal((await report('https://local.test/api?from=2026-10-12')).status,400);
  const shared=await post({...m.feedbackTypes.starterFeedback(),shared:true});assert.equal(shared.status,200);
  const read=(await call(m.feedbackAdmin,'GET',undefined,org)).data.templates.find(t=>t.id===shared.data.id);assert.equal(read.readOnly,true);
  assert.equal((await post({...read,shared:false},org)).status,403);
 });
 await check('Starter, question types, required/optional and malformed answers',async()=>{
  assert.equal(template.questions.length,5);
  assert.throws(()=>m.feedbackHelpers.validateFeedback([]));
  assert.throws(()=>m.feedbackHelpers.validateFeedback([{...template.questions[0],options:['1','2']}]));
  assert.throws(()=>m.feedbackHelpers.validateFeedbackAnswers(template.questions,[null,1,1,1,null]));
  assert.throws(()=>m.feedbackHelpers.validateFeedbackAnswers(template.questions,[6,1,1,1,null]));
  const q=[{id:'choice',type:'single',prompt:'Choice',options:['A','B'],required:true},{id:'many',type:'multiple',prompt:'Many',options:['A','B'],required:false},{id:'text',type:'text',prompt:'Comment',options:[],required:false}];
  assert.deepEqual(m.feedbackHelpers.validateFeedbackAnswers(q,[0,[1,0],'  Great  ']),[0,[0,1],'Great']);
  assert.throws(()=>m.feedbackHelpers.validateFeedbackAnswers(q,[0,[0,0],null]));
  assert.throws(()=>m.feedbackHelpers.validateFeedbackAnswers(q,[0,[2],null]));
  assert.throws(()=>m.feedbackHelpers.validateFeedbackAnswers(q,[0,[],Array(2002).join('x')]));
 });
 await check('Course completion eligibility, backfill and no learning/certificate mutation',async()=>{
  const c=await call(m.admin,'POST',{title:'Feedback course',description:'',status:'draft',audience:{countries:[],sites:[],users:[]},catalogueScope:'global'},admin);assert.equal(c.status,200,JSON.stringify(c.data));courseId=c.data.course.id;
  await query("INSERT INTO course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES('pack',?,'test.zip','ready','[{\"id\":\"sco\",\"title\":\"Lesson\",\"href\":\"index.html\"}]',1,1,now()::text)",courseId);
  await query("UPDATE courses SET status='published',package_id='pack' WHERE id=?",courseId);
  await complete('user0');
  assert.equal((await mine('user0')).data.invitations.length,0);
  assert.equal((await post({action:'attach',kind:'course',targetId:courseId,surveyId},org)).status,200);
  originalInvitation=(await mine('user0')).data.invitations[0];assert.equal(originalInvitation.mode,'anonymous');
  await query("SELECT assign_credit_course('user1',?,'test')",courseId);assert.equal((await mine('user1')).data.invitations.length,0);
  for(let i=1;i<6;i++)await complete('user'+i);
  const before=(await query('SELECT * FROM assignment_history ORDER BY id')).rows,certs=(await query('SELECT * FROM certificates')).rows;
  assert.equal((await submit(originalInvitation,'user1')).status,404);
  assert.equal((await submit(originalInvitation,'user0',[null,1,1,1,null])).status,400);
  assert.equal((await submit(originalInvitation,'user0')).status,200);
  assert.deepEqual((await query('SELECT * FROM assignment_history ORDER BY id')).rows,before);assert.deepEqual((await query('SELECT * FROM certificates')).rows,certs);
 });
 await check('Anonymous storage has no direct identity/timestamps; duplicate/race prevention',async()=>{
  assert.equal((await submit(originalInvitation,'user0')).status,409);
  const inv=(await mine('user1')).data.invitations[0];
  assert.equal((await submit({...inv,mode:'named'},'user1')).status,409);
  await assert.rejects(()=>query('UPDATE feedback_eligibility SET submitted=false WHERE id=?',originalInvitation.id),/immutable/i);
  const r=await Promise.all([submit(inv,'user1',responses[1]),submit(inv,'user1',responses[1])]);assert.deepEqual(r.map(v=>v.status).sort(),[200,409]);
  const stored=(await query('SELECT * FROM feedback_responses')).rows;assert.equal(stored.length,2);assert(stored.every(r=>r.respondent_id===null));
  const columns=(await query("SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='feedback_responses'")).rows.map(r=>r.column_name);
  for(const forbidden of ['learner_id','occurrence_id','eligibility_id','assignment_id','session_id','submitted_at','created_at'])assert(!columns.includes(forbidden));
  await assert.rejects(()=>query("INSERT INTO feedback_responses(survey_id,version,kind,target_id,completion_month,mode,respondent_id,answers) VALUES(?,1,'course',?,'2026-10','anonymous','user0','[]')",surveyId,courseId),/check constraint/i);
  assert.equal((await first("SELECT count(*)::int AS n FROM audit_events WHERE entity IN ('feedback_responses','feedback_eligibility')")).n,0);
 });
 await check('Suppression in APIs and CSV; exact rating averages, distributions and optional suppression',async()=>{
  let r=await report();assert.equal(r.status,200,JSON.stringify(r.data));let g=r.data.groups.find(g=>g.target_id===courseId);assert.equal(g.eligible,6);assert.equal(g.responses,null);assert.deepEqual(g.questions,[]);assert.equal(g.responseRate,null);
  let csv=await report('https://local.test/api?format=csv');assert.match(csv.data,/Suppressed/);assert(!csv.data.includes('user0'));assert(!csv.data.includes('Overall satisfaction'));
  for(let i=2;i<5;i++)assert.equal((await submit((await mine('user'+i)).data.invitations[0],'user'+i,responses[i])).status,200);
  r=await report();g=r.data.groups.find(g=>g.target_id===courseId);assert.equal(g.responses,5);assert.equal(g.responseRate,100*5/6);assert.equal(g.questions[0].average,3);assert.deepEqual(g.questions[0].counts.map(c=>c.count),[1,1,1,1,1]);assert.equal(g.questions[4].suppressed,true);assert(!('namedResponses' in g));
  csv=await report('https://local.test/api?format=csv');assert(!/user[0-9]|example.test|respondent_id/.test(csv.data));
  assert.equal((await report('https://local.test/api?from=2026-11&to=2026-11')).data.groups.length,0);
  assert.equal((await report('https://local.test/api?target=course:foreign')).data.groups.length,0);
  const qs=[{id:'m',type:'multiple',options:['A','B'],prompt:'Choice',required:false}];const stats=m.feedbackStats.feedbackStats(qs,[{answers:[[0,1]]},{answers:[[1]]}],false);assert.deepEqual(stats[0].counts.map(c=>c.count),[1,2]);
  assert.equal(m.feedbackStats.feedbackStats(qs,[{answers:[[0]]},{answers:[[0]]},{answers:[[0]]},{answers:[[0]]},{answers:[null]}],true)[0].suppressed,true);
 });
 await check('Mode locks; immutable versions and pending invitations preserve exact questions',async()=>{
  assert.equal((await post({...template,mode:'named'},org)).status,409);
  await assert.rejects(()=>query("UPDATE feedback_surveys SET mode='named' WHERE id=?",surveyId),/locked/i);
  const r=await post({...template,questions:template.questions.map(q=>({...q,prompt:'Updated '+q.prompt}))},org);assert.equal(r.status,200,JSON.stringify(r.data));template.revision=r.data.revision;
  assert.equal((await mine('user5')).data.invitations[0].questions[0].prompt,'Overall satisfaction');
  await complete('user6');assert.equal((await mine('user6')).data.invitations[0].version,2);
  assert.equal((await report()).data.groups.length,2);
  await assert.rejects(()=>query("UPDATE feedback_versions SET name='bad' WHERE survey_id=?",surveyId),/immutable|cannot be changed/i);
  await assert.rejects(()=>query("DELETE FROM feedback_responses WHERE survey_id=?",surveyId),/immutable|cannot be changed/i);
  assert.equal((await post({...template,revision:1},org)).status,409);
 });
 await check('Refresher creates new invitation; reattachment cannot create duplicates',async()=>{
  const old=await first("SELECT * FROM assignment_history WHERE learner_id='user0' AND course_id=?",courseId);
  await query(`INSERT INTO assignment_history(id,learner_id,course_id,package_id,course_title,learner_name,store_id,country,assigned_at,assigned_by,source,billed,unit_cents,completed_at)
   SELECT 'refresher',learner_id,course_id,package_id,course_title,learner_name,store_id,country,now(),'test','renewal',false,0,'2026-11-01T12:00:00Z' FROM assignment_history WHERE learner_id='user0' AND course_id=?`,courseId);
  const invitations=(await mine('user0')).data.invitations;assert.equal(invitations.length,1);assert.equal(invitations[0].completion_month,'2026-11');
  assert.equal((await submit(invitations[0],'user0')).status,200);
  const before=(await first('SELECT count(*)::int AS n FROM feedback_eligibility')).n;
  await post({action:'attach',kind:'course',targetId:courseId,surveyId:''},org);await post({action:'attach',kind:'course',targetId:courseId,surveyId},org);
  assert.equal((await first('SELECT count(*)::int AS n FROM feedback_eligibility')).n,before);
 });
 await check('Live attendance eligibility and corrections; separate occurrences; named disclosure',async()=>{
  const named=await post({...m.feedbackTypes.starterFeedback(),mode:'named'},org);assert.equal(named.status,200);liveId=named.data.id;
  await query("INSERT INTO live_trainings(id,title,trainer,created_by) VALUES('live','Workshop','Trainer','test')");
  assert.equal((await post({action:'attach',kind:'live',targetId:'live',surveyId:liveId},org)).status,200);
  for(const id of ['session1','session2']){
   await query("INSERT INTO live_sessions(id,training_id,starts_at,ends_at,time_zone,format,location,created_by) VALUES(?,'live','2026-10-01T10:00:00Z','2026-10-01T11:00:00Z','UTC','classroom','Office','test')",id);
   await query("INSERT INTO live_enrolments(id,session_id,learner_id,snapshot,assigned_by) VALUES(?,?,'user0','{\"title\":\"Workshop\"}','test')",'e'+id,id);
  }
  assert.equal((await mine('user0')).data.invitations.length,0);
  await query("UPDATE live_enrolments SET attendance='attended',recorded_at=now() WHERE id='esession1'");
  let inv=(await mine('user0')).data.invitations[0];assert.equal(inv.mode,'named');
  await query("UPDATE live_enrolments SET attendance='absent',reason='Correction' WHERE id='esession1'");assert.equal((await mine('user0')).data.invitations.length,0);assert.equal((await submit(inv,'user0')).status,404);
  await query("UPDATE live_enrolments SET attendance='attended',reason='Confirmed' WHERE id='esession1'");assert.equal((await submit(inv,'user0',[4,4,4,4,'=FORMULA'])).status,200);
  await query("UPDATE live_enrolments SET attendance='attended' WHERE id='esession2'");assert.equal((await mine('user0')).data.invitations.length,1);
  const g=(await report('https://local.test/api?target=live:live')).data.groups[0];assert.equal(g.eligible,2);assert.equal(g.responses,1);assert.equal(g.namedResponses[0].name,'user0');
  assert.match((await report('https://local.test/api?target=live:live&format=csv')).data,/'=FORMULA/);
 });
 await check('Feature off blocks invitations, authoring and reporting, while preserving learning and evidence',async()=>{
  const inv=(await mine('user6')).data.invitations[0],before=(await first('SELECT count(*)::int AS n FROM feedback_responses')).n;
  await query(`UPDATE organisation_settings SET features=jsonb_set(features,'{course_feedback}',?::jsonb)`,JSON.stringify({policy:'disabled',enabled:false}));
  assert.equal((await mine('user6')).status,403);assert.equal((await submit(inv,'user6')).status,403);assert.equal((await post(template,org)).status,403);assert.equal((await report()).status,403);
  assert.equal((await first('SELECT count(*)::int AS n FROM feedback_responses')).n,before);
  assert((await first("SELECT completed_at FROM assignment_history WHERE learner_id='user6'")).completed_at);
 });
 console.log(`${tests} course feedback workflow groups passed`);
}finally{await pg.close();rmSync(dir,{recursive:true,force:true});}
