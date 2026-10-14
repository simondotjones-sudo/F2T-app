// Optional isolated browser check for platform admin code onboarding.
// Copies the app to a temporary directory and serializes the local PGlite test pool only.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const cliRequire=createRequire(require.resolve('netlify-cli/package.json'));
const databaseModule=cliRequire.resolve.paths('@netlify/database-dev').map(p=>join(p,'@netlify/database-dev/dist/main.js')).find(existsSync);
if(!databaseModule)throw new Error('Install the project Netlify CLI dependency first');
const {NetlifyDB}=await import(pathToFileURL(databaseModule).href);
import {existsSync,readFileSync,readdirSync,createWriteStream,mkdtempSync,cpSync,symlinkSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const {chromium}=await import(process.env.LMS_TEST_PLAYWRIGHT_MODULE||'playwright');
const fixture=mkdtempSync(join(tmpdir(),'operators-browser-app-'));
for(const name of ['app','components','hooks','lib','data','public','assets','vendor','scripts','package.json','tsconfig.json','next.config.ts','next-env.d.ts','postcss.config.mjs'])cpSync(name,join(fixture,name),{recursive:true});
symlinkSync(process.cwd()+'/node_modules',join(fixture,'node_modules'),'dir');
writeFileSync(join(fixture,'lib/database-driver.ts'),`import {getDatabase} from '@netlify/database';import {assertMigrationOpen} from './migration-hold';const state=globalThis as typeof globalThis&{__nativeTestDriver?:ReturnType<typeof getDatabase>};export function databaseDriver(){assertMigrationOpen();const d=state.__nativeTestDriver??=getDatabase();d.pool.options.max=1;return d;}`);
const db=new NetlifyDB({logger:()=>{}});const url=await db.start();
for(const name of readdirSync('netlify/database/migrations').sort().filter(n=>!n.includes('sample-learner-induction-completion')))await db.exec(readFileSync(`netlify/database/migrations/${name}/migration.sql`,'utf8'));
await db.exec('SET search_path TO lms_tenant_2,public; UPDATE organisation_settings SET credits_enabled=false; RESET search_path;');
const log=createWriteStream('/tmp/operators-ui-next.log');
const fixtureEnv={...process.env,NETLIFY_DB_URL:url,F2T_PLATFORM_ADMIN_EMAIL:'operator@example.invalid',F2T_PLATFORM_ADMIN_PASSWORD:'FictionalNativeBrowserPassword2026!',LMS_EMAIL_DELIVERY:'disabled',LMS_BACKGROUND_JOBS:'disabled'};
// Production rendering avoids dev HMR reloading a form while a new API route compiles.
const compile=spawn('node',['node_modules/next/dist/bin/next','build','--webpack'],{cwd:fixture,env:fixtureEnv,stdio:['ignore','pipe','pipe']});compile.stdout.pipe(log,{end:false});compile.stderr.pipe(log,{end:false});
if(await new Promise(resolve=>compile.once('exit',resolve))!==0){await db.stop();log.close();rmSync(fixture,{recursive:true,force:true});throw Error('Browser fixture build failed');}
const app=spawn('node',['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3010'],{cwd:fixture,env:fixtureEnv,stdio:['ignore','pipe','pipe']});app.stdout.pipe(log,{end:false});app.stderr.pipe(log,{end:false});
let browser;
try{
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:3010/api/client-brand');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 browser=await chromium.launch({headless:true,...(process.env.LMS_TEST_CHROMIUM?{executablePath:process.env.LMS_TEST_CHROMIUM}:{}),args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1365,height:900}}),page=await context.newPage();
 page.on('pageerror',e=>console.log('BROWSER ERROR',e.message));

 const login=await context.request.post('http://127.0.0.1:3010/api/admin/session',{headers:{origin:'http://127.0.0.1:3010'},data:{email:'operator@example.invalid',password:'FictionalNativeBrowserPassword2026!'}});if(login.status()!==200)throw new Error('Local admin login failed: '+await login.text());

 await page.goto('http://127.0.0.1:3010/admin/operators');
 await page.getByRole('button',{name:'Not now',exact:true}).click({timeout:1500}).catch(()=>{});
 await page.getByRole('button',{name:'Add platform admin',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('Alex Example');
 await page.getByLabel('Email address',{exact:true}).fill('alex@example.invalid');
 await page.getByRole('button',{name:'Create login code',exact:true}).click();
 await page.getByRole('heading',{name:'Share this login code privately'}).waitFor();
 const code=await page.getByRole('textbox',{name:'Login code',exact:true}).inputValue();
 await page.getByRole('button',{name:'Not now',exact:true}).click({timeout:5000}).catch(()=>{});
 if(!/^[A-F0-9]{8}(-[A-F0-9]{8}){3}$/.test(code))throw Error('Missing code');
 await page.screenshot({path:'/tmp/operators-desktop.png'});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'/tmp/operators-mobile.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Operator page overflows mobile');
 const recipient=await browser.newContext({viewport:{width:390,height:844}}),entry=await recipient.newPage();
 await entry.goto('http://127.0.0.1:3010/platform-access');
 await entry.getByLabel('Email address',{exact:true}).fill('alex@example.invalid');
 await entry.getByLabel('Login code',{exact:true}).fill(code);
 await entry.getByLabel(/^Create password/).fill('FictionalAlexPassword2026!');
 await entry.getByLabel('Confirm password',{exact:true}).fill('FictionalAlexPassword2026!');
 await entry.screenshot({path:'/tmp/operators-activation-mobile.png'});
 if(await entry.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Code entry overflows mobile');
 await entry.getByRole('button',{name:'Save password & login',exact:true}).click();
 await entry.waitForURL('**/admin/clients',{timeout:45000});
 const list=await recipient.request.get('http://127.0.0.1:3010/api/admin/operators');if(!list.ok())throw Error('New admin cannot manage operators');
 if((await list.json()).currentEmail!=='alex@example.invalid')throw Error('Incorrect authenticated identity');
 await page.reload();
 const card=page.locator('article').filter({hasText:'Alex Example'});
 await card.getByText('Active',{exact:true}).waitFor();
 await card.getByRole('button',{name:'Disable access',exact:true}).click();
 await card.locator('.operator-confirm').getByRole('button',{name:'Disable access',exact:true}).click();
 await card.getByText('Disabled',{exact:true}).waitFor();
 const denied=await recipient.request.get('http://127.0.0.1:3010/api/admin/operators');if(denied.status()!==403)throw Error('Disabled admin retains access');
 console.log('PASS Desktop/mobile add-admin UI, manual-code activation, automatic login, global access and immediate revocation');
}catch(e){console.error(e);if(browser){const p=browser.contexts()[0]?.pages()[0];if(p){await p.screenshot({path:'/tmp/operators-error.png'}).catch(()=>{});console.log((await p.locator('main').innerText()).slice(-5000));}}process.exitCode=1;}finally{if(browser)await browser.close();app.kill('SIGTERM');await new Promise(resolve=>{app.once('close',resolve);setTimeout(resolve,5000);});await db.stop();log.close();rmSync(fixture,{recursive:true,force:true});}
