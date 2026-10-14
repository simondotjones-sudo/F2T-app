import {validateHierarchy} from './organisation-hierarchy';
import {isLanguage} from './i18n';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {CourseError} from './course-admin';
import {normaliseImage} from './image-validation';
import {controlQuery,controlTransaction} from './control-database';
import {canonicalClientSlug,DEFAULT_BRAND,validLogo,portalUrl,type Tenant} from './tenant-types';
import {validateRegistration} from './registration-settings';
import {featureCatalogue,type FeatureId} from './feature-catalogue';
import {credentials} from './admin-auth';
import {withTenant} from './tenant-context';
import {inTransaction} from './database';
const digest=(v:string)=>createHash('sha256').update(v).digest('hex');
const clean=(v:unknown)=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
export async function setupClient(b:Record<string,unknown>,actor:string){
 if(!b||typeof b!=='object'||!/^[-a-f0-9]{36}$/i.test(String(b.requestId))||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(String(b.requestId)))throw new CourseError('Reload the client setup and try again.');
 const name=clean(b.name),slug=clean(b.slug).toLowerCase(),logo=b.logo_url||DEFAULT_BRAND.logo_url,color=clean(b.theme_color).toLowerCase();
 if(name.length<2||name.length>100)throw new CourseError('Enter a client name with 2–100 characters.');
 if(canonicalClientSlug(slug)===DEFAULT_BRAND.slug)throw new CourseError('That portal address is already in use.',409);
 if(!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)||slug.length<2||slug.length>60)throw new CourseError('Use 2–60 lowercase letters, numbers and hyphens for the portal address.');
 if(!validLogo(logo)||!/^#[a-f0-9]{6}$/.test(color))throw new CourseError('Check the client logo and theme colour.');
 const language=b.default_language===undefined?'en':b.default_language,locationTerm=b.location_term===undefined?'site':b.location_term;
 if(!isLanguage(language)||typeof locationTerm!=='string'||!['site','store'].includes(locationTerm))throw new CourseError('Choose a supported language and location terminology.');
 const admin=b.administrator as Record<string,unknown>|undefined,adminName=clean(admin?.name),email=clean(admin?.email).toLowerCase();
 if(adminName.length<2||adminName.length>101||email.length>254||!/^[^\s@<>,;:"\\]+@[^\s@<>,;:"\\]+\.[^\s@<>,;:"\\]+$/.test(email))throw new CourseError('Enter the administrator name and a valid email address.');
 if(email===credentials()?.email)throw new CourseError('Use a different email for the client administrator.');
 if(!Array.isArray(b.sites)||!b.sites.length||b.sites.length>100)throw new CourseError('Add between 1 and 100 sites.');
 const hierarchy=validateHierarchy(b.hierarchy||{labels:['Organisation',locationTerm==='store'?'Store':'Site'],countryLevel:null});
 const siteNames=new Set<string>(),codes=new Set<string>();
 const sites=b.sites.map((s:Record<string,unknown>,i:number)=>{const name=clean(s?.name),country=clean(s?.country),code=clean(s?.code),key=(country+'\n'+name).toLowerCase();if(name.length<2||name.length>150||country.length<2||country.length>80||code.length>50||siteNames.has(key)||code&&codes.has(code.toLowerCase()))throw new CourseError('Check site names, countries and unique site codes.');siteNames.add(key);if(code)codes.add(code.toLowerCase());const groups=s.groups??[];if(!Array.isArray(groups)||groups.length>hierarchy.labels.length-2||groups.some(v=>typeof v!=='string'||v.length>100))throw new CourseError('Check the organisation group path.');return {id:`${b.requestId}-${i+1}`,name,country,code,groups:groups.map(v=>v.trim())};});
 if(hierarchy.countryLevel)for(const site of sites){
  const level=hierarchy.countryLevel;
  if(site.groups[level-1]&&site.groups[level-1]!==site.country)throw new CourseError('Store country must match its country group.');
  while(site.groups.length<level)site.groups.push('');
  site.groups[level-1]=site.country;
 }
 if(!Array.isArray(b.departments)||b.departments.length>100)throw new CourseError('Check the departments.');
 const departments=b.departments.map(clean);if(departments.some(n=>n.length<2||n.length>100)||new Set(departments.map(n=>n.toLowerCase())).size!==departments.length)throw new CourseError('Use unique department names with 2–100 characters.');
 const registration=validateRegistration(b.registration as Record<string,unknown>);
 const input=b.features as Record<FeatureId,unknown>|undefined;
 if(!input||Array.isArray(input)||Object.keys(input).length!==featureCatalogue.length||featureCatalogue.some(f=>typeof input[f.id]!=='boolean'))throw new CourseError('Check the feature settings.');
 for(const f of featureCatalogue)if('parent' in f&&input[f.id]&&!input[f.parent])throw new CourseError('Enable the parent feature before its dependent features.');
 // Availability and starting state are explicit; the organisation can adjust enabled optional features later.
 const features=Object.fromEntries(featureCatalogue.map(f=>[f.id,{policy:input[f.id]?'optional':'disabled',enabled:input[f.id]}]));
 if(!Number.isSafeInteger(b.creditsPerSite)||Number(b.creditsPerSite)<1||Number(b.creditsPerSite)>1000000)throw new CourseError('Choose a credit balance between 1 and 1,000,000.');
 const background=await normaliseImage(b.login_background??null);
 const config={hierarchy,default_language:language,location_term:locationTerm,name,slug,login_background:background,logo_url:logo,theme_color:color,administrator:{name:adminName,email},sites,departments,registration,features,creditsPerSite:b.creditsPerSite};
 const token=randomBytes(32).toString('hex'),codeHash=digest(randomBytes(32).toString('hex')),fingerprint=digest(JSON.stringify([null,codeHash]));
 const result=await controlTransaction(async tx=>{
 const {rows}=await tx.query('SELECT public.lms_setup_client($1::jsonb,$2,$3::uuid,$4,$5,$6,$7,$8) AS result',[JSON.stringify(config),actor,b.requestId,digest(JSON.stringify(config)),randomUUID(),codeHash,digest(token),fingerprint]);
 const result=rows[0].result as {id:number;created:boolean};
 if(result.created)await tx.query('UPDATE public.lms_clients SET login_background=$1,default_language=$3,location_term=$4 WHERE id=$2',[background,result.id,language,locationTerm]);
 return result;
 });
 return {...result,id:Number(result.id),slug,activationPath:result.created?portalUrl(slug,'/activate-account#token='+token):null,expiresAt:result.created?new Date(Date.now()+7*86400000).toISOString():null};
}
export async function clientForSetup(id:unknown){
 if(!Number.isSafeInteger(Number(id))||Number(id)<1)throw new CourseError('Choose a client.');
 const row=(await controlQuery<Tenant&{setup_admin_id:string|null}>('SELECT * FROM public.lms_clients WHERE id=$1 AND active',[Number(id)])).rows[0];
 if(!row||!row.setup_admin_id)throw new CourseError('This client has no setup administrator.',404);
 return {...row,id:Number(row.id)};
}
export async function setupAdministrator(id:unknown,actor:string,renew=false){
 const tenant=await clientForSetup(id);
 return withTenant(tenant,()=>inTransaction(async tx=>{
  const row=(await tx.query("SELECT l.id,l.name,l.email,l.password_hash,l.code_hash,l.archived_at,r.scope FROM learners l LEFT JOIN reporting_access r ON r.learner_id=l.id WHERE l.id=$1 FOR UPDATE OF l",[tenant.setup_admin_id])).rows[0];
  if(!row||row.archived_at||row.scope!=='organisation')throw new CourseError('The setup administrator is no longer available.',409);
  const activated=!!row.password_hash;
  if(!renew)return {name:row.name,email:row.email,activated,activationPath:null,expiresAt:null};
  if(activated)throw new CourseError('This administrator has already activated their account.',409);
  const token=randomBytes(32).toString('hex'),expiresAt=new Date(Date.now()+7*86400000).toISOString();
  await tx.query('DELETE FROM password_resets WHERE account_id=$1',[row.id]);
  await tx.query("INSERT INTO password_resets(token_hash,account_type,account_id,credential_hash,expires_at) VALUES($1,'learner',$2,$3,$4)",[digest(token),row.id,digest(JSON.stringify([row.password_hash,row.code_hash])),expiresAt]);
  await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action) VALUES($1,'client_setup',$2,'activation_link_created')",[actor,row.id]);
  return {name:row.name,email:row.email,activated:false,activationPath:portalUrl(tenant.slug,'/activate-account#token='+token),expiresAt};
 }));
}
