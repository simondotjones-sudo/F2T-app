import {tenantFixture,pglitePool} from './tenant-fixture.mjs';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {build} from 'esbuild';

const dir=mkdtempSync(join(tmpdir(),'eazysafe-bootstrap-'));
const jobs=readdirSync('netlify/functions').filter(n=>n.endsWith('.mts'));
const state={calls:0,stores:[],context:{context:'dev',branch:'bootstrap-test'}};
globalThis.__bootstrapTest=state;
const env={...process.env};
delete process.env.LMS_MIGRATION_HOLD;
const entry=join(dir,'entry.ts');
writeFileSync(entry,jobs.map((name,i)=>`export {default as job${i}} from '${process.cwd()}/netlify/functions/${name}';`).join('\n')+`
export {emailConnection,deliverLearningEmail} from '${process.cwd()}/lib/email-delivery.ts';
export {photoBucket} from '${process.cwd()}/lib/storage.ts';
export {db,inTransaction} from '${process.cwd()}/lib/database.ts';
export {default as holdEdge,config as holdConfig} from '${process.cwd()}/lib/migration-hold-edge.ts';
export {default as storedEdge} from '${process.cwd()}/lib/stored-files-edge.ts';`);
try{
 await build({entryPoints:[entry],outfile:join(dir,'bundle.mjs'),bundle:true,format:'esm',platform:'node',tsconfig:'tsconfig.json',plugins:[tenantFixture,{name:'isolation-fixtures',setup(b){
  b.onResolve({filter:/^@netlify\/database$/},()=>({path:'database',namespace:'fixture'}));
  b.onResolve({filter:/^@netlify\/blobs$/},()=>({path:'blobs',namespace:'fixture'}));
  b.onResolve({filter:/lib\/course-refreshers$/},()=>({path:'refreshers',namespace:'fixture'}));
  b.onResolve({filter:/lib\/hr-integration$/},()=>({path:'hr',namespace:'fixture'}));
  b.onResolve({filter:/lib\/email-worker$/},()=>({path:'email-worker',namespace:'fixture'}));
  b.onResolve({filter:/deploy-context\.json$/},()=>({path:'context',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:{
   database:'export function getDatabase(){return {pool:{async connect(){globalThis.__bootstrapTest.calls++;return {query:async()=>({rows:[{added:0,archived:0,assigned:0}]}),release(){}}}}}}',
   blobs:'export function getStore(options){globalThis.__bootstrapTest.stores.push(options);return {get:async()=>null,set:async()=>{},setJSON:async()=>{}}}',
   hr:'export async function runScheduledHr(){globalThis.__bootstrapTest.calls++;}',
   refreshers:'export async function syncCourseRefreshers(){globalThis.__bootstrapTest.calls++;return {checked:0}}',
   'email-worker':'export async function runEmailNotifications(){globalThis.__bootstrapTest.calls++;return {sent:0}}',
   context:'export default globalThis.__bootstrapTest.context;'
  }[a.path]}));
 }}]});
 const m=await import(join(dir,'bundle.mjs'));
 const runJobs=async()=>{for(let i=0;i<jobs.length;i++)await m['job'+i]();};
 assert.equal(jobs.length,6);
 for(const value of [undefined,'disabled','true','ENABLED']){
  process.env.CONTEXT='production';
  if(value===undefined)delete process.env.LMS_BACKGROUND_JOBS;else process.env.LMS_BACKGROUND_JOBS=value;
  await runJobs();assert.equal(state.calls,0,'Disabled jobs must not acquire a database or invoke work');
 }
 process.env.LMS_BACKGROUND_JOBS='enabled';
 for(const context of ['dev','deploy-preview','branch-deploy']){
  process.env.CONTEXT=context;await runJobs();assert.equal(state.calls,0,'Non-production must not process jobs');
 }
 delete process.env.CONTEXT;await runJobs();assert.equal(state.calls,0,'Local build context must stay disabled');
 process.env.CONTEXT='production';await runJobs();assert.equal(state.calls,jobs.length);
 console.log('PASS All six jobs default off, stay off in previews, and require an explicit production opt-in');

 process.env.POSTMARK_SERVER_TOKEN='test-bootstrap-token';process.env.POSTMARK_FROM_EMAIL='sender@example.test';
 process.env.PRIMARK_APP_URL='https://eazysafe.example.test';process.env.PRIMARK_EMAIL_DELIVERY='enabled';
 delete process.env.LMS_EMAIL_DELIVERY;
 assert.equal(m.emailConnection().ready,false,'Original project switch must not enable delivery');
 process.env.LMS_EMAIL_DELIVERY='disabled';assert.equal(m.emailConnection().ready,false);
 process.env.LMS_EMAIL_DELIVERY='enabled';assert.equal(m.emailConnection().ready,true);
 process.env.CONTEXT='deploy-preview';assert.equal(m.emailConnection().ready,false);
 console.log('PASS Email requires the new installation switch; original settings and previews cannot enable it');

 for(const context of ['production','deploy-preview','dev']){
  state.context.context=context;state.stores.length=0;await m.photoBucket().head('fixture');
  const names=state.stores.map(s=>s.name);
  assert.deepEqual(names,context==='production'?['eazysafe-files']:['eazysafe-files','eazysafe-preview-bootstrap-test']);
  assert(state.stores.every(s=>!s.siteID&&!s.token),'Storage must use this project runtime identity');
 }
 console.log('PASS Production and preview use EazySAFE store names and the current site identity');

 // Warm the pooled driver before enabling the hold: cached connections must stop too.
 await m.db().prepare('SELECT 1').all();
 const before=state.calls, storesBefore=state.stores.length;
 process.env.CONTEXT='production';
 process.env.LMS_BACKGROUND_JOBS='enabled';process.env.LMS_EMAIL_DELIVERY='enabled';
 process.env.LMS_MIGRATION_HOLD='enabled';
 await runJobs();assert.equal(state.calls,before,'The hold overrides every enabled job');
 assert.equal(m.emailConnection().ready,false,'The hold overrides enabled email delivery');
 assert.deepEqual(await m.deliverLearningEmail('learner@example.test',{Subject:'test',HtmlBody:'test',TextBody:'test'},'test'),{status:'failed',code:'delivery_disabled'});
 await assert.rejects(m.db().prepare('SELECT 1').all(),/temporarily paused/);
 await assert.rejects(m.db().batch([m.db().prepare('SELECT 1')]),/temporarily paused/);
 await assert.rejects(m.inTransaction(async()=>assert.fail('Transaction must not run')),/temporarily paused/);
 assert.throws(()=>m.photoBucket(),/temporarily paused/);
 assert.equal(state.calls,before);assert.equal(state.stores.length,storesBefore);
 for(const [method,path] of [['GET','/'],['POST','/api/prototype'],['GET','/admin/courses'],['HEAD','/scorm-content/package/file.js']]){
  const response=await m.holdEdge(new Request('https://migration.example.test'+path,{method}),{});
  assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'300');
  assert.equal(response.headers.get('Cache-Control'),'private, no-store');
  if(method==='HEAD')assert.equal(await response.text(),'');
  else if(path.startsWith('/api/'))assert.equal(typeof (await response.json()).error,'string');
 }
 const stored=await m.storedEdge(new Request('https://migration.example.test/scorm-content/p/index.html'),{next:()=>assert.fail('Held storage must not call the application')});
 assert.equal(stored.status,503);
 assert.equal(m.holdConfig.path,'/*');assert.equal(m.holdConfig.onError,'fail');
 console.log('PASS Migration hold blocks interactive routes, cached database access, storage, all jobs and email');

 process.env.LMS_MIGRATION_HOLD='disabled';
 assert.equal(m.holdEdge(new Request('https://migration.example.test/api/prototype'),{}),undefined);
 assert.equal(m.emailConnection().ready,true);
 await m.db().prepare('SELECT 1').all();
 await runJobs();assert.equal(state.calls,before+jobs.length+1);
 // The Netlify runtime environment takes precedence over local process variables.
 globalThis.Netlify={env:{get:key=>key==='LMS_MIGRATION_HOLD'?'enabled':process.env[key]}};
 assert.equal(m.holdEdge(new Request('https://migration.example.test/'),{}).status,503);
 delete globalThis.Netlify;
 console.log('PASS Releasing the hold restores normal handling; Netlify runtime flags are honoured');
}finally{
 for(const key of Object.keys(process.env))if(!(key in env))delete process.env[key];
 Object.assign(process.env,env);delete globalThis.Netlify;delete globalThis.__bootstrapTest;rmSync(dir,{recursive:true,force:true});
}
