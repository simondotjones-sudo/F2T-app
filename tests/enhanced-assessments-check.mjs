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
for(const name of readdirSync('netlify/database/migrations').sort().filter(name=>name!=='20261009160000_sample-learner-induction-completion')){
 if(name==='20261012173000_enhanced-assessments')await pg.exec(`
 SET search_path TO lms_tenant_2,pg_catalog;
 INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('legacy','Legacy','legacy@test.invalid','unused','eazysafe-internal','Ireland',now()::text);
 INSERT INTO courses(id,title,description,status,audience_json,created_at,updated_at,catalogue_scope,quiz_json) VALUES('legacy-course','Legacy quiz','','published','{"countries":[],"sites":[],"users":[]}',now()::text,now()::text,'global','{"passPercent":80,"questions":[{"prompt":"Legacy question","options":["Yes","No"],"correctIndex":0}]}');
 INSERT INTO course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES('legacy-pack','legacy-course','test.zip','ready','[{"id":"sco","title":"Lesson","href":"index.html"}]',1,1,now()::text);
 UPDATE courses SET package_id='legacy-pack' WHERE id='legacy-course';
 SELECT assign_credit_course('legacy','legacy-course','test');
 INSERT INTO course_quiz_attempts(id,assignment_id,answers,correct_count,question_count,pass_percent,passed,submitted_at) SELECT 'legacy-attempt',history_id,'[0]',1,1,80,true,'2026-10-01T00:00:00Z' FROM course_assignments WHERE learner_id='legacy';
 RESET search_path;
 `);
 await pg.exec(readFileSync('netlify/database/migrations/'+name+'/migration.sql','utf8'));
}
const context=new AsyncLocalStorage();
const pool=pglitePool(pg);
const blobs=new Map();
const store={async set(key,value){blobs.set(key,await new Response(value).arrayBuffer());},async setJSON(key,value){blobs.set(key,structuredClone(value));},async get(key,options){const value=blobs.get(key);if(value===undefined)return null;return options?.type==='json'?structuredClone(value):value.slice(0);}};
globalThis.__courseTest={pool,store,cookie:()=>context.getStore()?.user,user:()=>context.getStore()?.admin?{email:'admin@example.test'}:null};
async function query(sql,...values){let n=0;return pool.query(sql.replace(/\?/g,()=>'$'+(++n)),values);}
async function first(sql,...values){return (await query(sql,...values)).rows[0];}
const entry=join(dir,'entry.ts');
writeFileSync(entry,`export {default as certificatePage} from '${process.cwd()}/app/certificates/[token]/page.tsx';
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
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='headers'?`export const cookies=async()=>({get:()=>globalThis.__courseTest.cookie()?{value:globalThis.__courseTest.cookie()}:undefined});`:a.path==='navigation'?`export const usePathname=()=>'/';export const redirect=()=>{throw new Error('redirect')};export const notFound=()=>{throw new Error('not-found')};`:a.path==='db'?'export const getDatabase=()=>({pool:globalThis.__courseTest.pool});':a.path==='blobs'?'export const getStore=()=>globalThis.__courseTest.store;':a.path==='auth'?'export const getAdminUser=async()=>globalThis.__courseTest.user();':`export class NextRequest extends Request{};export const NextResponse=Response;`,loader:'js'}));
}}]});
const m=await import(join(dir,'bundle.mjs'));
let tests=0;
async function check(name,fn){await fn();console.log('PASS '+name);tests++;}
async function call(mod,method,body,{admin=false,user='',url='https://local.test/api',params,origin='https://local.test'}={}){return context.run({admin,user},async()=>{const req=new Request(url,{method,headers:{...(body instanceof Uint8Array?{'Content-Length':String(body.length)}:{'Content-Type':'application/json'}),...(user?{cookie:'primark_session='+user}:{}),origin},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});req.nextUrl=new URL(req.url);req.cookies={get:name=>name==='primark_session'&&user?{value:user}:undefined};const res=await mod[method](req,{params:Promise.resolve(params||{})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text(),headers:res.headers};});}
const ireland=m.stores.find(s=>s.country==='Ireland'),uk=m.stores.find(s=>s.country==='United Kingdom'),france=m.stores.find(s=>s.country==='France');
async function learner(id,site){await query('INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES(?,?,?,?,?,?,?)',id,id,id+'@example.test','test-code',site.id,site.country,new Date().toISOString());await query('INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES(?,?,?)',await m.hash(id),id,'2099-01-01T00:00:00.000Z');}
await learner('irish-user',ireland);await learner('uk-user',uk);await learner('fr-user',france);
let course,pack;
const manifest=`<?xml version="1.0"?><manifest xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"><metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata><organizations default="org"><organization identifier="org"><title>Fixture</title><item identifier="sco-one" identifierref="res"><title>Safety lesson</title><adlcp:masteryscore>80</adlcp:masteryscore></item></organization></organizations><resources><resource identifier="res" adlcp:scormtype="sco" href="index.html"><file href="index.html"/></resource></resources></manifest>`;
const files={'imsmanifest.xml':manifest,'index.html':'<!doctype html><html><head><title>Fixture</title></head><body>SCORM fixture</body></html>','assets/data.json':'{"ready":true}'};
const options={mode:'random',count:3,bankIds:[],categories:['Safety'],shuffleQuestions:true,shuffleAnswers:true,maxAttempts:1,retryMinutes:0,review:'pass'};
const questions=[
 {id:'s',type:'single',prompt:'Single',options:['Right','Wrong'],correctIndex:0,category:'Safety',explanation:'Explanation'},
 {id:'m',type:'multiple',prompt:'Multiple',options:['Right one','Wrong','Right two'],correctIndex:0,correctIndices:[0,2],category:'Safety'},
 {id:'b',type:'boolean',prompt:'Boolean',options:['True','False'],correctIndex:1,category:'Safety'},
 {id:'other',prompt:'Other category',options:['Yes','No'],correctIndex:0,category:'Other'},
];
const opts={user:'org-admin'};let bank,assignment,session;
const draft={title:'Enhanced assessment',description:'Test',status:'draft',audience:{countries:[],sites:[],users:[]},catalogueScope:'global'};
const quizUrl=()=>`https://local.test/api?courseId=${course.id}`;
const quizCall=(body,user='irish-user')=>call(m.quiz,'POST',{courseId:course.id,assignmentId:assignment,...body},{user});
try{
 await learner('org-admin',ireland);await learner('country-admin',ireland);await learner('site-admin',ireland);
 await query("INSERT INTO reporting_access VALUES('org-admin','organisation',NULL,NULL,'test','2026-01-01'),('country-admin','country','Ireland',NULL,'test','2026-01-01'),('site-admin','site','Ireland',?,'test','2026-01-01')",ireland.id);
 await check('Migration updates public/template and keeps banks empty in the template',async()=>{
  const legacy=await first('SELECT * FROM lms_tenant_2.course_quiz_attempts WHERE id=\'legacy-attempt\'');assert.equal(legacy.passed,true);assert.deepEqual(legacy.answers,[0]);assert.equal(legacy.snapshot.questions[0].prompt,'Legacy question');assert.equal(legacy.started_at,null);assert.equal(new Date(legacy.submitted_at).toISOString(),'2026-10-01T00:00:00.000Z');
  assert.equal((await first("SELECT feature_enabled('advanced_assessments') AS enabled")).enabled,true);
  assert.equal((await first("SELECT features->'advanced_assessments' AS f FROM lms_template.organisation_settings")).f.enabled,true);
  assert.equal((await first('SELECT count(*) AS n FROM lms_template.question_banks')).n,0);
  assert.equal((await first("SELECT count(*) AS n FROM lms_schema_tables WHERE name IN ('question_banks','course_quiz_sessions','course_quiz_grants')")).n,3);
 });
 await check('Question grading rejects partial, extra, duplicate and invalid selections',async()=>{
  const q=m.grading.validateQuiz({passPercent:100,advanced:{...options,mode:'fixed'},questions:questions.slice(0,3)});
  assert.equal(m.grading.markAssessment(q,[[0],[0,2],[1]]).passed,true);
  assert.equal(m.grading.markAssessment(q,[[0],[0],[1]]).correct,2);
  assert.equal(m.grading.markAssessment(q,[[0],[0,1,2],[1]]).correct,2);
  assert.throws(()=>m.grading.markAssessment(q,[[0],[0,0],[1]]));
  assert.throws(()=>m.grading.markAssessment(q,[[0],[0,9],[1]]));
  assert.throws(()=>m.grading.validateQuiz({...q,advanced:{...options,maxAttempts:0}}));
  assert.throws(()=>m.grading.validateQuiz({...q,advanced:{...options,retryMinutes:-1}}));
  assert.throws(()=>m.grading.selectAssessment({...q,advanced:{...options,count:4}},()=>0));
  for(let i=0;i<25;i++){
   const selected=m.grading.selectAssessment({...q,advanced:{...options,count:2}},max=>Math.floor(Math.random()*max));
   assert.equal(selected.questions.length,2);assert.equal(new Set(selected.questions.map(q=>q.id)).size,2);
   const answers=selected.questions.map(q=>q.type==='multiple'?q.correctIndices:[q.correctIndex]);assert.equal(m.grading.markAssessment(selected,answers).passed,true);
  }
  const ordered=m.grading.selectAssessment({...q,advanced:{...options,count:2,shuffleQuestions:false,shuffleAnswers:false}},()=>0);assert.deepEqual(ordered.questions.map(q=>q.id),['m','b']);
  assert.deepEqual(m.grading.assessmentReview(q,false),[]);
  assert.equal(m.grading.assessmentReview(q,true).length,3);
  assert.deepEqual(m.grading.assessmentReview({...q,advanced:{...options,review:'never'}},true),[]);
  assert.equal(m.grading.assessmentReview({...q,advanced:{...options,review:'each'}},false).length,3);
 });
 await check('Bank permissions, origin, revisions and shared protection',async()=>{
  assert.equal((await call(m.banks,'GET',undefined,opts)).status,403);
  await query(`UPDATE organisation_settings SET features=jsonb_set(features,'{client_course_management}',?::jsonb)`,JSON.stringify({policy:'required',enabled:true}));
  for(const user of ['irish-user','site-admin','country-admin'])assert.equal((await call(m.banks,'GET',undefined,{user})).status,403);
  assert.equal((await call(m.banks,'POST',{name:'Bank',shared:false,questions},{...opts,origin:'https://evil.test'})).status,403);
  assert.equal((await call(m.banks,'POST',{name:'Shared',shared:true,questions},opts)).status,403);
  const made=await call(m.banks,'POST',{name:'Shared',shared:true,questions},{admin:true});assert.equal(made.status,200,JSON.stringify(made.data));bank=made.data.id;
  const fetched=(await call(m.banks,'GET',undefined,opts)).data.banks[0];assert.equal(fetched.readOnly,true);
  assert.equal((await call(m.banks,'POST',{...fetched,name:'Overwrite',shared:false},opts)).status,403);
  assert.equal((await call(m.banks,'POST',{...fetched,revision:99},{admin:true})).status,409);
 });
 await check('Insufficient pools and foreign bank IDs rejected; publish snapshots selected category',async()=>{
  options.bankIds=[bank];
  assert.equal((await call(m.admin,'POST',{...draft,quiz:{passPercent:100,questions:[],advanced:{...options,count:4}}},opts)).status,400);
  assert.equal((await call(m.admin,'POST',{...draft,quiz:{passPercent:100,questions:[],advanced:{...options,bankIds:['foreign']}}},opts)).status,404);
  let r=await call(m.admin,'POST',{...draft,quiz:{passPercent:100,questions:[],advanced:options}},opts);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;
  assert.equal(course.quiz_json.questions.length,3);
  r=await call(m.packages,'POST',{courseId:course.id,filename:'fixture.zip',files:Object.entries(files).map(([path,v])=>({path,size:new TextEncoder().encode(v).length}))},opts);assert.equal(r.status,200,JSON.stringify(r.data));pack=r.data.id;
  for(const [path,v] of Object.entries(files))assert.equal((await call(m.upload,'PUT',new TextEncoder().encode(v),{...opts,params:{id:pack},url:'https://local.test/api?path='+encodeURIComponent(path)})).status,200);
  r=await call(m.packages,'POST',{action:'finish',id:pack},opts);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;
  r=await call(m.admin,'POST',{...draft,id:course.id,revision:course.revision,status:'published'},opts);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;
  await query("SELECT assign_credit_course('irish-user',?,'test',now(),false,false,'test')",course.id);
  await query("SELECT assign_credit_course('uk-user',?,'test',now(),false,false,'test')",course.id);
  assignment=(await first("SELECT history_id FROM course_assignments WHERE learner_id='irish-user' AND course_id=?",course.id)).history_id;
 });
 await check('SCORM gate and no answer keys before attempt start',async()=>{
  let r=await call(m.quiz,'GET',undefined,{user:'irish-user',url:quizUrl()});assert.equal(r.status,200);assert.equal(r.data.lessonsComplete,false);assert.deepEqual(r.data.questions,[]);
  assert.equal((await quizCall({action:'start'})).status,409);
  await query("INSERT INTO scorm_progress(learner_id,package_id,sco_id,status,data_json,updated_at,completed_at) VALUES('irish-user',?,'sco-one','completed','{}',?,?)",pack,new Date().toISOString(),new Date().toISOString());
  r=await quizCall({action:'start'});assert.equal(r.status,200,JSON.stringify(r.data));session=r.data;
  assert.equal(session.questions.length,3);assert(!JSON.stringify(session).includes('correctIndex'));assert(!JSON.stringify(session).includes('Explanation'));
  assert.equal((await first('SELECT count(*) AS n FROM certificates WHERE assignment_id=?',assignment)).n,0);
 });
 await check('Resume retains selection/order/answers; bank edits and course versions cannot alter it',async()=>{
  const answers=session.questions.map(()=>[0]);assert.equal((await quizCall({action:'save',attemptId:session.attemptId,answers})).status,200);
  const original=await first('SELECT snapshot FROM course_quiz_sessions WHERE id=?',session.attemptId);
  const shared=(await call(m.banks,'GET',undefined,{admin:true})).data.banks[0];
  assert.equal((await call(m.banks,'POST',{...shared,questions:questions.map(q=>({...q,prompt:'Changed '+q.prompt}))},{admin:true})).status,200);
  let r=await quizCall({action:'start'});assert.equal(r.data.attemptId,session.attemptId);assert.deepEqual(r.data.questions,session.questions);assert.deepEqual(r.data.answers,answers);
  r=await call(m.admin,'POST',{...draft,id:course.id,revision:course.revision,status:'published',title:'New version',quiz:{passPercent:50,advanced:{...options,review:'each'},questions:[]}},opts);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;
  assert.deepEqual((await first('SELECT snapshot FROM course_quiz_sessions WHERE id=?',session.attemptId)).snapshot,original.snapshot);
  assert.equal((await first('SELECT quiz_json FROM assignment_history WHERE id=?',assignment)).quiz_json.passPercent,100);
  assert.equal((await quizCall({action:'submit',attemptId:session.attemptId,answers},'uk-user')).status,409);
 });
 await check('Server grading, failed-attempt secrecy, immutable result and attempt exhaustion',async()=>{
  const snapshot=(await first('SELECT snapshot FROM course_quiz_sessions WHERE id=?',session.attemptId)).snapshot;
  const wrong=snapshot.questions.map(q=>[(q.correctIndex+1)%q.options.length]);
  const r=await quizCall({action:'submit',attemptId:session.attemptId,answers:wrong,passed:true,correct:3});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.passed,false);assert.deepEqual(r.data.review,[]);
  assert.deepEqual((await quizCall({action:'submit',attemptId:session.attemptId,answers:wrong})).data,r.data);
  assert.equal((await quizCall({action:'start'})).status,409);
  await assert.rejects(()=>query('UPDATE course_quiz_attempts SET passed=true WHERE id=?',session.attemptId),/immutable|cannot/i);
  assert.equal((await first('SELECT count(*) AS n FROM certificates WHERE assignment_id=?',assignment)).n,0);
 });
 await check('Scoped reports/CSV, extra-attempt permission and audited idempotent grant',async()=>{
  for(const user of ['site-admin','country-admin'])assert.equal((await call(m.assessments,'POST',{assignmentId:assignment,reason:'Support request',requestId:crypto.randomUUID()},{user})).status,403);
  assert.equal((await call(m.assessments,'GET',undefined,{user:'irish-user'})).status,403);
  const report=await call(m.assessments,'GET',undefined,{user:'site-admin'});assert.equal(report.status,200,JSON.stringify(report.data));assert(report.data.rows.every(r=>r.store_id===ireland.id));assert.equal(report.data.rows[0].remaining,0);
  assert.equal((await call(m.assessments,'GET',undefined,{user:'country-admin',url:'https://local.test/api?role=global'})).status,403);
  const csv=await call(m.assessments,'GET',undefined,{...opts,url:'https://local.test/api?format=csv'});assert.equal(csv.status,200);assert(csv.data.includes('Assessment version'));assert(csv.data.includes('failed'));
  const grant={assignmentId:assignment,reason:'Approved retry',requestId:crypto.randomUUID()};
  assert.equal((await call(m.assessments,'POST',grant,opts)).status,200);assert.equal((await call(m.assessments,'POST',grant,opts)).status,200);
  assert.equal((await first('SELECT count(*) AS n FROM course_quiz_grants WHERE assignment_id=?',assignment)).n,1);
  assert.equal((await first("SELECT reason FROM audit_events WHERE entity='course_quiz_grant'")).reason,'Approved retry');
 });
 await check('Pass releases review and uses existing certificate gates; feature-off preserves attempts',async()=>{
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{advanced_assessments}',?::jsonb)",JSON.stringify({policy:'disabled',enabled:false}));
  assert.equal((await call(m.banks,'POST',{name:'Disabled',shared:false,questions},opts)).status,403);
  let r=await quizCall({action:'start'});assert.equal(r.status,200,JSON.stringify(r.data));session=r.data;
  const snapshot=(await first('SELECT snapshot FROM course_quiz_sessions WHERE id=?',session.attemptId)).snapshot;
  const answers=snapshot.questions.map(q=>q.type==='multiple'?q.correctIndices:[q.correctIndex]);
  r=await quizCall({action:'submit',attemptId:session.attemptId,answers});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.passed,true);assert.equal(r.data.review.length,3);
  assert.equal((await first('SELECT count(*) AS n FROM certificates WHERE assignment_id=?',assignment)).n,1);
  assert.equal((await quizCall({action:'start'})).status,409);
 });
 await check('Retry delay enforced; unlimited retries retain SCORM and practical sign-off gates',async()=>{
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{advanced_assessments}',?::jsonb)",JSON.stringify({policy:'optional',enabled:true}));
  for(const [who,delay] of [['delay-user',60],['practical-user',0]]){
   await learner(who,ireland);
   let r=await call(m.admin,'POST',{...draft,id:course.id,revision:course.revision,status:'published',assessorRequired:true,quiz:{passPercent:100,questions:questions.slice(0,3),advanced:{...options,mode:'fixed',maxAttempts:null,retryMinutes:delay,review:'each'}}},opts);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;
   await query("SELECT assign_credit_course(?,?,'test',now(),false,false,'test')",who,course.id);
   const id=(await first('SELECT history_id FROM course_assignments WHERE learner_id=? AND course_id=?',who,course.id)).history_id;
   await query("INSERT INTO scorm_progress(learner_id,package_id,sco_id,status,data_json,updated_at,completed_at) VALUES(?,?,'sco-one','completed','{}',?,?)",who,pack,new Date().toISOString(),new Date().toISOString());
   const post=body=>call(m.quiz,'POST',{courseId:course.id,assignmentId:id,...body},{user:who});
   r=await post({action:'start'});assert.equal(r.status,200,JSON.stringify(r.data));let attempt=r.data;
   let snap=(await first('SELECT snapshot FROM course_quiz_sessions WHERE id=?',attempt.attemptId)).snapshot;
   r=await post({action:'submit',attemptId:attempt.attemptId,answers:snap.questions.map(q=>[(q.correctIndex+1)%q.options.length])});assert.equal(r.status,200);assert.equal(r.data.passed,false);assert.equal(r.data.review.length,3);
   r=await post({action:'start'});
   if(delay){assert.equal(r.status,409);assert.match(r.data.error,/delay/);continue;}
   assert.equal(r.status,200);assert.equal(r.data.allowance.remaining,null);attempt=r.data;
   snap=(await first('SELECT snapshot FROM course_quiz_sessions WHERE id=?',attempt.attemptId)).snapshot;
   const answers=snap.questions.map(q=>q.type==='multiple'?q.correctIndices:[q.correctIndex]);
   await query("UPDATE scorm_progress SET status='incomplete' WHERE learner_id=?",who);
   assert.equal((await post({action:'submit',attemptId:attempt.attemptId,answers})).status,409);
   await query("UPDATE scorm_progress SET status='completed' WHERE learner_id=?",who);
   r=await post({action:'submit',attemptId:attempt.attemptId,answers});assert.equal(r.status,200);assert.equal(r.data.passed,true);
   assert.equal((await first('SELECT count(*) AS n FROM certificates WHERE assignment_id=?',id)).n,0);
   assert((await first('SELECT theory_completed_at FROM assignment_history WHERE id=?',id)).theory_completed_at);
  }
 });
 console.log(`${tests} enhanced assessment checks passed`);
} finally {await pg.close();rmSync(dir,{recursive:true,force:true});}
