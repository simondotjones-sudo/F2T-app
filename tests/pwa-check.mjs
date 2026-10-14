import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import sharp from 'sharp';
const require=createRequire(import.meta.url),dir=mkdtempSync(join(tmpdir(),'pwa-test-'));
try{
 const outfile=join(dir,'pwa.cjs');
 await build({stdin:{contents:`export * from './lib/pwa';export * from './lib/pwa-icon';export * as manifestRoute from './app/api/pwa/manifest/route';export * as iconRoute from './app/api/pwa/icon/route';export * from './proxy';`,resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/tenant-context$/},()=>({path:'tenant',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function currentTenant(){return globalThis.__pwaBrand}',loader:'js'}));b.onResolve({filter:/^(sharp|next\/server)$/},a=>({path:require.resolve(a.path),external:true}));}}]});
 const {pwaManifest,renderPwaIcon,manifestRoute,iconRoute,proxy}=require(outfile);
 const brand={id:2,slug:'fit2trade',name:'Fit2Trade',logo_url:'/branding/fit2trade-logo.svg',theme_color:'#2E6052',revision:2};
 const primark={...brand,id:1,slug:'primark',name:'Primark',logo_url:'/branding/primark-logo.svg',theme_color:'#008bc9'};
 for(const client of [brand,primark]){
  globalThis.__pwaBrand=client;
  const manifest=pwaManifest(client);assert.equal(manifest.start_url,'/?client='+client.slug);assert.equal(manifest.id,client.id===2?'/?client=eazysafe-internal':manifest.start_url);assert.equal(manifest.name,client.id===2?'Fit2Trade':'Primark Safety Passport');assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.theme_color,client.theme_color);
  assert.equal(manifest.icons.length,4);for(const icon of manifest.icons){assert(icon.src.includes('client='+client.slug));assert(['any','maskable'].includes(icon.purpose));}
  const response=await manifestRoute.GET();assert.equal(response.headers.get('content-type'),'application/manifest+json');assert.match(response.headers.get('cache-control'),/no-store/);assert.deepEqual(await response.json(),manifest);
  for(const size of [180,192,512]){const bytes=await renderPwaIcon(client,size);const meta=await sharp(bytes).metadata();assert.equal(meta.width,size);assert.equal(meta.height,size);assert.equal(meta.format,'png');}
 }
 // Uploaded PNG/JPG/WebP logos are supported without fetching arbitrary URLs.
 for(const format of ['png','jpeg','webp']){const data=await sharp({create:{width:100,height:200,channels:3,background:'#335577'}}).toFormat(format).toBuffer();const icon=await renderPwaIcon({...brand,slug:'uploaded-client',logo_url:`data:image/${format};base64,${data.toString('base64')}`},192);assert.equal((await sharp(icon).metadata()).width,192);}
 await assert.rejects(()=>renderPwaIcon({...brand,logo_url:'https://example.test/logo.png'},192));
 assert.equal((await iconRoute.GET(new Request('https://lms.test/api/pwa/icon?size=10000'))).status,400);
 const {NextRequest}=require('next/server');
 // Manifest/icon reads must not mutate a user's selected portal or log them out.
 const response=proxy(new NextRequest('https://lms.test/api/pwa/manifest?client=primark',{headers:{cookie:'lms_client=eazysafe-internal; primark_session=test'}}));
 assert.equal(response.headers.get('set-cookie'),null);assert.equal(response.headers.get('x-middleware-request-x-lms-client'),'primark');
 const launch=proxy(new NextRequest('https://lms.test/?client=primark',{headers:{cookie:'lms_client=eazysafe-internal; primark_session=test'}}));assert.match(launch.headers.get('set-cookie'),/lms_client=primark/);
 const legacy=proxy(new NextRequest('https://lms.test/?client=fit2trade',{headers:{cookie:'lms_client=eazysafe-internal; primark_session=existing; primark_admin=operator'}}));
 assert.equal(legacy.headers.get('x-middleware-request-x-lms-client'),'fit2trade');assert.match(legacy.headers.get('set-cookie'),/lms_client=fit2trade/);assert.match(legacy.headers.get('set-cookie'),/primark_session=;/);assert.doesNotMatch(legacy.headers.get('x-middleware-request-cookie'),/primark_session/);assert.match(legacy.headers.get('x-middleware-request-cookie'),/primark_admin=operator/);
 assert.equal(proxy(new NextRequest('https://lms.test/api/users',{headers:{cookie:'lms_client=eazysafe-internal','x-lms-expected-client':'eazysafe-internal'}})).status,409);
 assert.equal(proxy(new NextRequest('https://lms.test/')).headers.get('x-middleware-request-x-lms-client'),'fit2trade');
 assert.equal(proxy(new NextRequest('https://lms.test/?client=primark',{headers:{'x-lms-expected-client':'fit2trade'}})).status,409);
 const events={},entries=new Map(),deleted=[],fetches=[];let fail=false,claimed=false;
 const cache={put:async(k,v)=>entries.set(k,v),match:async k=>entries.get(k)};
 const context={URL,Response,fetch:async request=>{fetches.push(request);if(fail)throw new Error('offline');return new Response(typeof request==='string'?'eazysafe-offline-page':'private learner page',{headers:{'content-type':'text/html'}});},caches:{open:async()=>cache,match:cache.match,keys:async()=>['eazysafe-pwa-v0','unrelated-cache','eazysafe-pwa-v1'],delete:async key=>deleted.push(key)},self:{location:{origin:'https://lms.test'},clients:{claim:async()=>{claimed=true;}},addEventListener:(name,fn)=>events[name]=fn}};
 vm.runInNewContext(readFileSync('public/sw.js','utf8'),context);
 let pending;events.install({waitUntil:p=>pending=p});await pending;assert.deepEqual([...entries.keys()],['/offline.html']);
 events.activate({waitUntil:p=>pending=p});await pending;assert.deepEqual(deleted,['eazysafe-pwa-v0']);assert(claimed);
 const request=(url,overrides={})=>({url:'https://lms.test'+url,method:'GET',mode:'navigate',destination:'document',...overrides});
 const dispatch=request=>{let result;events.fetch({request,respondWith:p=>result=p});return result;};
 assert.equal(await (await dispatch(request('/?client=primark'))).text(),'private learner page');assert.equal(entries.size,1);
 fail=true;assert.equal(await (await dispatch(request('/?client=primark'))).text(),'eazysafe-offline-page');
 for(const req of [request('/api/certificates'),request('/scorm-content/token/index.html'),request('/course',{destination:'iframe'}),request('/',{method:'POST'}),request('/course',{mode:'cors',destination:''}),request('/',{url:'https://other.test/'})])assert.equal(dispatch(req),undefined);
 assert.equal(entries.size,1);
 assert(readFileSync('public/offline.html','utf8').includes('eazysafe-offline-page'));
 console.log('PASS client manifests, PNG icons and uploaded formats, portal selection, online-only private data, offline fallback and safe worker lifecycle');
}finally{delete globalThis.__pwaBrand;rmSync(dir,{recursive:true,force:true});}
