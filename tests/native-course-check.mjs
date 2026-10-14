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
const store={async getMetadata(key){return blobs.has(key)?{etag:'test',metadata:{}}:null;},async set(key,value){blobs.set(key,await new Response(value).arrayBuffer());},async setJSON(key,value){blobs.set(key,structuredClone(value));},async get(key,options){const value=blobs.get(key);if(value===undefined)return null;return options?.type==='json'?structuredClone(value):value.slice(0);}};
globalThis.__courseTest={pool,store,cookie:()=>context.getStore()?.user,user:()=>context.getStore()?.admin?{email:'admin@example.test'}:null};
async function query(sql,...values){let n=0;return pool.query(sql.replace(/\?/g,()=>'$'+(++n)),values);}
async function first(sql,...values){return (await query(sql,...values)).rows[0];}
const entry=join(dir,'entry.ts');
writeFileSync(entry,`export {default as certificatePage} from '${process.cwd()}/app/certificates/[token]/page.tsx';
export * as native from '${process.cwd()}/app/api/native-content/route.ts';
export * as author from '${process.cwd()}/app/api/admin/native-content/route.ts';
export * as nativeUpload from '${process.cwd()}/app/api/native-media/route.ts';
export * as media from '${process.cwd()}/app/api/native-media/[id]/route.ts';
export * as schema from '${process.cwd()}/lib/native-content.ts';
export * as sharing from '${process.cwd()}/lib/shared-catalogue.ts';
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
 b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='headers'?`export const cookies=async()=>({get:()=>globalThis.__courseTest.cookie()?{value:globalThis.__courseTest.cookie()}:undefined});`:a.path==='navigation'?`export const usePathname=()=>'/';export const redirect=()=>{throw new Error('redirect')};export const notFound=()=>{throw new Error('not-found')};`:a.path==='db'?'export const getDatabase=()=>({pool:globalThis.__courseTest.pool});':a.path==='blobs'?'export const getStore=()=>globalThis.__courseTest.store;':a.path==='auth'?'export const getAdminUser=async()=>globalThis.__courseTest.user();export const getPlatformOperator=getAdminUser;':`export class NextRequest extends Request{};export const NextResponse=Response;`,loader:'js'}));
}}]});
const m=await import(join(dir,'bundle.mjs'));
let tests=0;
async function check(name,fn){await fn();console.log('PASS '+name);tests++;}
async function call(mod,method,body,{admin=false,user='',url='https://local.test/api',params,origin='https://local.test'}={}){return context.run({admin,user},async()=>{const req=new Request(url,{method,headers:{...(body instanceof Uint8Array?{'Content-Length':String(body.length)}:{'Content-Type':'application/json'}),...(user?{cookie:'primark_session='+user}:{}),origin},...(body===undefined?{}:{body:body instanceof Uint8Array?body:JSON.stringify(body)})});req.nextUrl=new URL(req.url);req.cookies={get:name=>name==='primark_session'&&user?{value:user}:undefined};const res=await mod[method](req,{params:Promise.resolve(params||{})});return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text(),headers:res.headers};});}
const ireland=m.stores.find(s=>s.country==='Ireland'),uk=m.stores.find(s=>s.country==='United Kingdom'),france=m.stores.find(s=>s.country==='France');
async function learner(id,site){await query('INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES(?,?,?,?,?,?,?)',id,id,id+'@example.test','test-code',site.id,site.country,new Date().toISOString());await query('INSERT INTO sessions(token_hash,learner_id,expires_at) VALUES(?,?,?)',await m.hash(id),id,'2099-01-01T00:00:00.000Z');}
await learner('irish-user',ireland);await learner('uk-user',uk);await learner('fr-user',france);
const admin={admin:true};let course,draftRevision=1,token,assignment;
const uuid=()=>crypto.randomUUID();
const l1=uuid(),l2=uuid(),optional=uuid(),ack=uuid(),practice=uuid(),image=uuid(),video=uuid(),doc=uuid();
const content={schemaVersion:1,sequential:true,lessons:[
 {id:l1,title:'Fictional demonstration',required:true,blocks:[
  {id:uuid(),type:'text',text:'# Example\n**Fictional** training only.\n- One\n- Two\n[Example](https://example.com)'},
  {id:uuid(),type:'image',mediaId:image,caption:'Example',alt:'Fictional image',decorative:false},
  {id:uuid(),type:'video',mediaId:video,transcript:'Fictional demonstration transcript.'},
  {id:uuid(),type:'document',mediaId:doc,label:'Example PDF'},
  {id:uuid(),type:'accordion',items:[{title:'Example',text:'Details'}]},
  {id:uuid(),type:'process',items:[{title:'First',text:'Example step'}]},
  {id:practice,type:'knowledge',required:true,question:{prompt:'Select the example',type:'single',options:['Example','Other'],correctIndex:0,explanation:'This is practice.'}},
  {id:ack,type:'acknowledgement',required:true,statement:'I acknowledge this is fictional.'}
 ]},
 {id:l2,title:'Second lesson',required:true,blocks:[{id:uuid(),type:'text',text:'End of fictional demonstration.'}]},
 {id:optional,title:'Optional reference',required:false,blocks:[{id:uuid(),type:'text',text:'Optional reading.'}]}
]};
const base={title:'FICTIONAL native demonstration',description:'Test only',deliveryType:'native',status:'draft',audience:{countries:[],sites:[],users:[]},catalogueScope:'global'};
const getAuthor=()=>call(m.author,'GET',undefined,{...admin,url:`https://local.test/api?courseId=${course.id}`});
const act=(action,extra={},user='irish-user')=>call(m.native,'POST',{courseId:course.id,token,lessonId:l1,action,...extra},{user});
const publish=async()=>{const r=await call(m.admin,'POST',{...base,id:course.id,revision:course.revision,status:'published',publishNative:true,contentRevision:draftRevision},admin);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;};
try{
 await query('UPDATE organisation_settings SET credits_enabled=false');
 await check('Native authoring permissions and tenant/template schema',async()=>{
  assert.equal((await call(m.admin,'POST',base,{user:'irish-user'})).status,403);
  let r=await call(m.admin,'POST',base,admin);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;assert.equal(course.delivery_type,'native');
  for(const schema of ['public','lms_template','lms_tenant_2'])assert.ok((await pool.query(`SELECT count(*) n FROM ${schema}.native_drafts`)).rows[0]);
  assert.equal((await first('SELECT count(*) n FROM lms_template.native_drafts')).n,0);
  assert.equal((await call(m.author,'GET',undefined,{user:'irish-user',url:`https://local.test/api?courseId=${course.id}`})).status,403);
 });
 await check('Invalid structures, duplicate IDs and foreign media rejected',async()=>{
  assert.throws(()=>m.schema.validateContent({...content,lessons:[content.lessons[0],content.lessons[0]]}));
  assert.equal((await call(m.author,'POST',{courseId:course.id,revision:1,content},admin)).status,400);
  for(const [id,mime] of [[image,'image/webp'],[video,'video/mp4'],[doc,'application/pdf']]){
   await query('INSERT INTO native_media(id,course_id,filename,mime_type,size,sha256,storage_context,created_by) VALUES(?,?,?,?,4,?,?,?)',id,course.id,'example',mime,'abc','preview-'+JSON.parse(readFileSync('lib/deploy-context.json')).branch,'test');
   blobs.set('native/'+id,new TextEncoder().encode('test').buffer);
  }
  const r=await call(m.author,'POST',{courseId:course.id,revision:1,content},admin);assert.equal(r.status,200,JSON.stringify(r.data));draftRevision=r.data.draft.revision;
 });
 await check('Private upload rejects executable and oversized files; images are re-encoded',async()=>{
  const upload=async file=>context.run({admin:true},async()=>{const form=new FormData();form.set('file',file);const r=new Request('https://local.test/api/native-media?courseId='+course.id,{method:'POST',headers:{origin:'https://local.test'},body:form});r.nextUrl=new URL(r.url);const out=await m.nativeUpload.POST(r);return {status:out.status,data:await out.json()};});
  assert.equal((await upload(new File(['<svg onload="alert(1)"></svg>'],'unsafe.svg',{type:'image/svg+xml'}))).status,400);
  assert.equal((await upload(new File([new Uint8Array(3*1024*1024+1)],'large.pdf',{type:'application/pdf'}))).status,400);
  const sharp=(await import('sharp')).default,bytes=await sharp({create:{width:10,height:10,channels:3,background:'#334455'}}).png().toBuffer();
  const r=await upload(new File([bytes],'fictional.png',{type:'image/png'}));assert.equal(r.status,200,JSON.stringify(r.data));assert.ok(r.data.media.some(f=>f.filename==='fictional.webp'&&f.mime_type==='image/webp'));
 });
 await check('Autosave reload and stale edit conflict preserve the first edit',async()=>{
  const r=await getAuthor();assert.deepEqual(r.data.draft.content,content);
  assert.equal((await call(m.author,'POST',{courseId:course.id,revision:1,content:{...content,sequential:false}},admin)).status,409);
  assert.equal((await getAuthor()).data.draft.content.sequential,true);
  assert.equal((await call(m.author,'POST',{courseId:course.id,revision:draftRevision,content},{...admin,origin:'https://evil.test'})).status,403);
 });
 await check('Publish validates required content and pinned immutable package',async()=>{
  assert.throws(()=>m.schema.validateContent({...content,lessons:[]},true));
  assert.throws(()=>m.schema.validateContent({...content,lessons:[{...content.lessons[0],blocks:[{id:uuid(),type:'image',mediaId:image,alt:'',caption:'',decorative:false}]}]},true));
  // Tests use production-scoped mocked storage; the usual test build context permits production reads.
  await publish();assert.ok(course.package_id);const stable=course.package_id;await publish();assert.equal(course.package_id,stable);
  assert.equal((await first('SELECT native_json FROM course_packages WHERE id=?',course.package_id)).native_json.lessons.length,3);
  await assert.rejects(()=>query('UPDATE course_packages SET native_json=? WHERE id=?','{}',course.package_id),/immutable/);
  await query("SELECT assign_credit_course('irish-user',?,'test')",course.id);
  assignment=(await first("SELECT history_id FROM course_assignments WHERE learner_id='irish-user' AND course_id=?",course.id)).history_id;
 });
 await check('Preview cannot create learner records; unauthorised media and SCORM launch denied',async()=>{
  const before=(await first('SELECT count(*) n FROM native_events')).n;
  assert.equal((await call(m.native,'GET',undefined,{...admin,url:`https://local.test/api?courseId=${course.id}&preview=1`})).status,200);
  assert.equal((await first('SELECT count(*) n FROM native_events')).n,before);
  assert.equal((await call(m.runtime,'POST',{action:'launch',courseId:course.id,preview:true},admin)).status,400);
  assert.equal((await call(m.media,'GET',undefined,{user:'uk-user',params:{id:image},url:`https://local.test/api?courseId=${course.id}`})).status,403);
  assert.equal((await call(m.media,'GET',undefined,{user:'irish-user',params:{id:image},url:`https://local.test/api?courseId=${course.id}`})).status,200);
 });
 await check('Sequential lessons, explicit acknowledgements and unscored practice gates',async()=>{
  let r=await act('launch');assert.equal(r.status,200,JSON.stringify(r.data));token=r.data.token;
  assert.equal((await act('visit',{lessonId:l2})).status,403);
  assert.equal((await act('complete')).status,400);
  assert.equal((await act('acknowledge',{blockId:ack})).status,400);
  assert.equal((await act('acknowledge',{blockId:ack,confirmed:true})).status,200);
  assert.equal((await act('complete')).status,400);
  r=await act('practice',{blockId:practice,answers:[1]});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.feedback.correct,false);
  assert.equal((await first('SELECT count(*) n FROM course_quiz_attempts WHERE assignment_id=?',assignment)).n,0);
  assert.equal((await act('complete')).status,200);
  assert.equal((await act('complete')).status,200);
  assert.equal((await first("SELECT count(*) n FROM native_events WHERE assignment_id=? AND kind='lesson_complete'",assignment)).n,1);
  assert.equal((await first('SELECT count(*) n FROM certificates WHERE assignment_id=?',assignment)).n,0);
 });
 await check('Resume across sessions, obsolete tab rejection and active time bounds',async()=>{
  let r=await act('launch',{lessonId:l2});const old=token;token=r.data.token;assert.ok(token!==old);
  assert.equal((await act('visit',{token:old,lessonId:l2})).status,409);
  assert.equal((await act('visit',{lessonId:l2})).status,200);
  assert.equal((await act('heartbeat',{lessonId:l1})).data.state.lessonId,l2);
  await query("UPDATE native_sessions SET last_seen=now()-interval '20 seconds' WHERE assignment_id=?",assignment);
  assert.equal((await act('heartbeat',{lessonId:l2})).status,200);
  const before=(await first('SELECT total_centiseconds FROM scorm_progress WHERE learner_id=? AND package_id=? AND sco_id=?','irish-user',course.package_id,l2)).total_centiseconds;
  assert.ok(before>=2000);
  await query("UPDATE native_sessions SET last_seen=now()-interval '1 hour' WHERE assignment_id=?",assignment);
  await act('heartbeat',{lessonId:l2});assert.equal((await first('SELECT total_centiseconds FROM scorm_progress WHERE learner_id=? AND package_id=? AND sco_id=?','irish-user',course.package_id,l2)).total_centiseconds,before);
  const get=await call(m.native,'GET',undefined,{user:'irish-user',url:`https://local.test/api?courseId=${course.id}`});assert.equal(get.data.state.lessonId,l2);assert.ok(get.data.state.completed.includes(l1));
 });
 await check('Content completion uses existing certificate engine and is idempotent',async()=>{
  const r=await act('complete',{lessonId:l2});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.state.contentComplete,true);
  assert.equal((await first('SELECT count(*) n FROM certificates WHERE assignment_id=?',assignment)).n,1);
  await act('complete',{lessonId:l2});assert.equal((await first('SELECT count(*) n FROM certificates WHERE assignment_id=?',assignment)).n,1);
 });
 await check('New publication preserves assigned content and historical acknowledgements',async()=>{
  const oldPackage=course.package_id,changed=structuredClone(content);changed.lessons[0].title='Updated draft';
  const r=await call(m.author,'POST',{courseId:course.id,revision:draftRevision,content:changed},admin);draftRevision=r.data.draft.revision;
  let get=await call(m.native,'GET',undefined,{user:'irish-user',url:`https://local.test/api?courseId=${course.id}`});assert.equal(get.data.content.lessons[0].title,content.lessons[0].title);
  await publish();assert.notEqual(course.package_id,oldPackage);
  get=await call(m.native,'GET',undefined,{user:'irish-user',url:`https://local.test/api?courseId=${course.id}`});assert.equal(get.data.packageId,oldPackage);
  await query("SELECT assign_credit_course('uk-user',?,'test')",course.id);
  get=await call(m.native,'GET',undefined,{user:'uk-user',url:`https://local.test/api?courseId=${course.id}`});assert.equal(get.data.content.lessons[0].title,'Updated draft');
  assert.equal((await first("SELECT detail FROM native_events WHERE assignment_id=? AND kind='acknowledgement'",assignment)).detail.statement,content.lessons[0].blocks[7].statement);
 });
 await check('Organisation authors require both course-management and authoring permissions',async()=>{
  await learner('native-org',ireland);await query("INSERT INTO reporting_access VALUES('native-org','organisation',NULL,NULL,'test','2026-01-01')");
  const url='https://local.test/api?courseId='+course.id;
  assert.equal((await call(m.author,'GET',undefined,{user:'native-org',url})).status,403);
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{client_course_management}','{\"policy\":\"optional\",\"enabled\":true}')");
  assert.equal((await call(m.author,'GET',undefined,{user:'native-org',url})).status,200);
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{course_authoring,enabled}','false')");
  assert.equal((await call(m.author,'GET',undefined,{user:'native-org',url})).status,403);
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{course_authoring,enabled}','true')");
 });
 await check('Authoring disable retains published learning',async()=>{
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{course_authoring,enabled}','false')");
  assert.equal((await getAuthor()).status,403);
  assert.equal((await call(m.native,'GET',undefined,{user:'irish-user',url:`https://local.test/api?courseId=${course.id}`})).status,200);
  await query("UPDATE organisation_settings SET features=jsonb_set(features,'{course_authoring,enabled}','true')");
 });
 await check('Final assessment and practical sign-off remain certificate gates',async()=>{
  const quiz={passPercent:100,questions:[{prompt:'Final example',options:['Yes','No'],correctIndex:0}]};
  let r=await call(m.admin,'POST',{...base,id:course.id,revision:course.revision,status:'published',quiz,assessorRequired:true,publishNative:true,contentRevision:draftRevision},admin);assert.equal(r.status,200,JSON.stringify(r.data));course=r.data.course;
  await query("SELECT assign_credit_course('fr-user',?,'test')",course.id);
  const h=(await first("SELECT history_id FROM course_assignments WHERE learner_id='fr-user' AND course_id=?",course.id)).history_id;
  r=await act('launch',{},'fr-user');token=r.data.token;
  await act('acknowledge',{blockId:ack,confirmed:true},'fr-user');await act('practice',{blockId:practice,answers:[0]},'fr-user');
  await act('complete',{},'fr-user');r=await act('complete',{lessonId:l2},'fr-user');assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal((await first('SELECT count(*) n FROM certificates WHERE assignment_id=?',h)).n,0);
  r=await call(m.quiz,'POST',{courseId:course.id,assignmentId:h,attemptId:uuid(),answers:[1]},{user:'fr-user'});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.passed,false);
  assert.equal((await first('SELECT count(*) n FROM certificates WHERE assignment_id=?',h)).n,0);
  r=await call(m.quiz,'POST',{courseId:course.id,assignmentId:h,attemptId:uuid(),answers:[0]},{user:'fr-user'});assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.passed,true);
  assert.ok((await first('SELECT theory_completed_at FROM assignment_history WHERE id=?',h)).theory_completed_at);
  assert.equal((await first('SELECT count(*) n FROM certificates WHERE assignment_id=?',h)).n,0);
 });
 console.log(`${tests} native course checks passed`);
}finally{await pg.close();rmSync(dir,{recursive:true,force:true});delete globalThis.__courseTest;}
