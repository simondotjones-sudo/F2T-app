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
for(const name of readdirSync('netlify/database/migrations').sort().filter(name=>name!=='20261009160000_sample-learner-induction-completion'))await pg.exec(readFileSync('netlify/database/migrations/'+name+'/migration.sql','utf8'));
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

try {
 await learner('org-admin',ireland);await learner('country-admin',ireland);
 await query("INSERT INTO reporting_access VALUES('org-admin','organisation',NULL,NULL,'test','2026-01-01'),('country-admin','country','Ireland',NULL,'test','2026-01-01')");
 const opts={user:'org-admin'};
 const draft={title:'Client-owned course',description:'Permission test',status:'draft',audience:{countries:[],sites:[],users:[]},catalogueScope:'global'};
 await check('Course management defaults off, including the provisioning template',async()=>{
  assert.equal((await first("SELECT feature_enabled('client_course_management') AS enabled")).enabled,false);
  assert.deepEqual((await first('SELECT features FROM lms_template.organisation_settings')).features.client_course_management,{policy:'disabled',enabled:false});
  assert.equal((await call(m.admin,'GET',undefined,opts)).status,403);
  assert.equal((await call(m.admin,'POST',draft,opts)).status,403);
 });
 await check('Only platform admins can change the permission, including optional policy',async()=>{
  let settings=(await call(m.settings,'GET',undefined,{admin:true})).data;
  assert.equal((await call(m.settings,'POST',{revision:settings.revision,changes:{client_course_management:{policy:'optional',enabled:true}}},opts)).status,403);
  assert.equal((await call(m.settings,'POST',{revision:settings.revision,changes:{client_course_management:{policy:'optional',enabled:true}}},{admin:true})).status,200);
  settings=(await call(m.settings,'GET',undefined,opts)).data;
  assert.equal((await call(m.settings,'POST',{revision:settings.revision,changes:{client_course_management:{enabled:false}}},opts)).status,403);
  for(const user of ['country-admin','irish-user'])assert.equal((await call(m.admin,'GET',undefined,{user})).status,403);
  assert.equal((await call(m.admin,'POST',draft,{...opts,origin:'https://evil.test'})).status,403);
 });
 await check('Enabled organisation admin creates, uploads, previews and publishes own course',async()=>{
  let result=await call(m.admin,'POST',draft,opts);assert.equal(result.status,200,JSON.stringify(result.data));course=result.data.course;
  result=await call(m.packages,'POST',{courseId:course.id,filename:'fixture.zip',files:Object.entries(files).map(([path,v])=>({path,size:new TextEncoder().encode(v).length}))},opts);
  assert.equal(result.status,200,JSON.stringify(result.data));pack=result.data.id;
  for(const [path,v] of Object.entries(files))assert.equal((await call(m.upload,'PUT',new TextEncoder().encode(v),{...opts,params:{id:pack},url:'https://local.test/api?path='+encodeURIComponent(path)})).status,200);
  result=await call(m.packages,'POST',{action:'finish',id:pack},opts);assert.equal(result.status,200,JSON.stringify(result.data));course=result.data.course;
  result=await call(m.runtime,'POST',{action:'launch',preview:true,courseId:course.id},opts);assert.equal(result.status,200,JSON.stringify(result.data));
  assert.equal((await call(m.content,'GET',undefined,{...opts,params:{token:result.data.token,path:['index.html']}})).status,200);
  result=await call(m.admin,'POST',{...draft,id:course.id,revision:course.revision,status:'published'},opts);assert.equal(result.status,200,JSON.stringify(result.data));course=result.data.course;
  assert.equal((await first('SELECT published_by FROM course_versions WHERE course_id=?',course.id)).published_by,'org-admin@example.test');
 });
 await check('Shared courses reject client metadata, package init, finish and file writes',async()=>{
  // Model an in-flight package that subsequently becomes a shared course.
  await query("UPDATE courses SET status='draft' WHERE id=?",course.id);
  await query("UPDATE course_packages SET status='uploading' WHERE id=?",pack);
  await query("INSERT INTO catalogue_subscriptions(course_id,source_client_id,source_course_id,release_id,version) VALUES(?,2,'source','release',1)",course.id);
  assert.equal((await call(m.admin,'GET',undefined,opts)).data.courses.find(c=>c.id===course.id).read_only,true);
  assert.equal((await call(m.admin,'GET',undefined,{admin:true})).data.courses.find(c=>c.id===course.id).read_only,false);
  assert.equal((await call(m.admin,'POST',{...draft,id:course.id,revision:course.revision},opts)).status,403);
  assert.equal((await call(m.packages,'POST',{courseId:course.id},opts)).status,409);
  assert.equal((await call(m.packages,'POST',{action:'finish',id:pack},opts)).status,403);
  assert.equal((await call(m.upload,'PUT',new TextEncoder().encode(files['index.html']),{...opts,params:{id:pack},url:'https://local.test/api?path=index.html'})).status,403);
 });
 await check('Revoking permission blocks existing sessions and upload endpoints',async()=>{
  await query(`UPDATE organisation_settings SET features=jsonb_set(features,'{client_course_management}',?::jsonb)`,JSON.stringify({policy:'disabled',enabled:false}));
  assert.equal((await call(m.admin,'GET',undefined,opts)).status,403);
  assert.equal((await call(m.packages,'POST',{action:'finish',id:pack},opts)).status,403);
  assert.equal((await call(m.runtime,'POST',{action:'launch',preview:true,courseId:course.id},opts)).status,401);
  assert.equal((await call(m.admin,'GET',undefined,{admin:true})).status,200);
 });
 console.log(`${tests} client course-management checks passed`);
} finally {await pg.close();rmSync(dir,{recursive:true,force:true});}
