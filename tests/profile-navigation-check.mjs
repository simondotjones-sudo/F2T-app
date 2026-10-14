import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const temp=mkdtempSync(join(tmpdir(),'client-navigation-'));
try {
 await build({stdin:{contents:`export * from './lib/profile'; export * from './lib/feature-catalogue'; export {default as FeaturePage} from './components/feature-page';`,resolveDir:process.cwd(),loader:'ts'},outfile:join(temp,'check.mjs'),bundle:true,platform:'node',format:'esm',plugins:[{name:'feature-context',setup(b){
  b.onResolve({filter:/^@\/lib\/features$/},()=>({path:'features',namespace:'fixture'}));
  b.onResolve({filter:/^next\/navigation$/},()=>({path:'navigation',namespace:'fixture'}));
  b.onResolve({filter:/^@\/components\/feature-boundary$/},()=>({path:'boundary',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path==='features'?'export const featureEnabled=async id=>globalThis.enabledFeatures[id]===true;':a.path==='navigation'?'export const redirect=url=>{throw new Error("REDIRECT "+url)};':'export const FeatureBoundary=()=>null;',loader:'js'}));
 }}]});
 const m=await import(join(temp,'check.mjs'));
 const base={name:'Test',email:'test@example.invalid',role:'Admin',site:'Test',platformAdmin:false,reportingAccess:null};
 const platform={...base,platformAdmin:true,platformOperator:true,reportingAccess:{scope:'organisation'}};
 const enabled=Object.fromEntries(m.featureCatalogue.map(f=>[f.id,true]));
 const values=(account,features)=>m.visibleProfileViews(account,features).map(v=>v.value);
 for(const feature of ['course_feedback','assessor','live_training','pathways','email_notifications']) {
  const view=Object.keys(m.profileFeatures).find(v=>m.profileFeatures[v]===feature);
  assert(values(platform,enabled).includes(view));
  assert(!values(platform,{...enabled,[feature]:false}).includes(view));
 }
 assert(!values(platform,{}).some(v=>m.profileFeatures[v]),'Loading features must not flash optional links');
 for(const v of ['settings','clients','courses','organisation','access'])assert(values(platform,{}).includes(v));
 assert(m.isPlatformView('operators'));assert.equal(m.profileHref('operators'),'/admin/operators');assert(values(platform,{}).includes('operators'));assert(!values({...platform,platformOperator:false},enabled).includes('operators'));
 assert(m.isPlatformView('catalogue'));assert(values(platform,{}).includes('catalogue'));assert(!values({...platform,platformOperator:false},enabled).includes('catalogue'));assert.equal(m.profileHref('catalogue'),'/admin/catalogue');
 assert(m.isPlatformView('clients'));assert(!m.isPlatformView('organisation'));
 assert(!values({...platform,platformOperator:false},enabled).includes('clients'));
 assert(!values(base,enabled).includes('assessor'));
 assert(values({...base,assessor:true},enabled).includes('assessor'));
 assert(!values({...base,assessor:true},{...enabled,assessor:false}).includes('assessor'));
 const choices=Object.fromEntries(m.featureCatalogue.map(f=>[f.id,{policy:'optional',enabled:true}]));
 for(const [policy,choice,expected] of [['disabled',true,false],['optional',false,false],['required',false,true]]) {
  choices.assessor={policy,enabled:choice};
  assert.equal(values(platform,{...enabled,assessor:m.effectiveFeature(choices,'assessor')}).includes('assessor'),expected);
 }
 for(const feature of [...Object.values(m.profileFeatures),'training_recognition']) {
  globalThis.enabledFeatures={[feature]:false};
  await assert.rejects(m.FeaturePage({feature,children:'page'}),/REDIRECT \/\?featureUnavailable=1/);
  globalThis.enabledFeatures={[feature]:true};
  const result=await m.FeaturePage({feature,children:'page'});
  assert.equal(result.props.children,'page');assert.equal(result.props.feature,feature);
 }
 const org={...base,reportingAccess:{scope:'organisation'}};
 assert(!values(org,{}).includes('courses'));
 assert(values(org,enabled).includes('courses'));
 assert(!values({...org,reportingAccess:{scope:'country'}},enabled).includes('courses'));
 assert.deepEqual(m.profileGroups(platform,enabled).map(g=>g.heading),['Management','Training','Configuration','Platform administration','Support']);
 assert.deepEqual(m.profileGroups(platform,enabled).find(g=>g.heading==='Management').options.map(v=>v.value),['report','access','organisation']);
 assert(m.profileGroups(org,enabled).find(g=>g.heading==='Training').options.some(v=>v.value==='courses'));
 assert(!m.profileGroups(org,enabled).some(g=>g.heading==='Platform administration'));
 console.log('PASS client navigation: role permissions, feature policy, loading, platform grouping and disabled-page redirects');
} finally {rmSync(temp,{recursive:true,force:true});}
