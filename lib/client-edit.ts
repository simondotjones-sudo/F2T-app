import {isLanguage} from './i18n';
import {normaliseImage} from './image-validation';
import {createHash,randomUUID} from 'node:crypto';
import {controlTransaction} from './control-database';
import {inClientScope,inTransaction} from './database';
import {CourseError} from './course-admin';
import {publicBrand,validLogo,type Tenant} from './tenant-types';
import {featureCatalogue,type FeatureChoices} from './feature-catalogue';
import {validateRegistration} from './registration-settings';
import type {ClientEdit,EditableSite} from './client-edit-types';
import type {Department} from './registration-types';

const conflict=()=>new CourseError('These settings changed. Reload before saving.',409);
const clean=(v:unknown)=>typeof v==='string'?v.trim().replace(/\s+/g,' '):'';
const hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
async function snapshot(tenant:Tenant){return inTransaction(async tx=>{
 const sites=(await tx.query('SELECT id,name,country,COALESCE(store_code,\'\') AS code,active,updated_at FROM organisation_stores WHERE deleted_at IS NULL ORDER BY id')).rows;
 const departments=(await tx.query('SELECT id,name,archived FROM organisation_departments ORDER BY id')).rows;
 const registration=(await tx.query('SELECT * FROM registration_settings WHERE id=1')).rows[0];
 const settings=(await tx.query('SELECT * FROM organisation_settings WHERE id=1')).rows[0];
 if(!registration||!settings)throw new CourseError('Organisation settings are unavailable.',503);
 const choices=structuredClone(settings.features) as FeatureChoices;
 for(const f of featureCatalogue)if('legacy' in f)choices[f.id].enabled=!!settings[f.legacy];
 return {client:publicBrand(tenant),sites,departments,registration,choices,revisionToken:hash([tenant.revision,sites,departments,registration,settings.revision])};
});}
// Authorisation is checked by the route before entering this control-plane operation.
export async function clientSettings(id:number){
 return controlTransaction(async control=>{
  const row=(await control.query('SELECT * FROM public.lms_clients WHERE id=$1 AND active FOR SHARE',[id])).rows[0];
  if(!row)throw new CourseError('Choose a client.',404);
  const tenant={...row,id:Number(row.id)} as Tenant;
  return inClientScope(control,tenant,()=>snapshot(tenant));
 });
}
export async function saveClientSettings(id:number,b:ClientEdit,actor:string){
 if(!b||typeof b!=='object'||!b.client||b.client.id!==id||typeof b.revisionToken!=='string')throw new CourseError('Choose a client.');
 const name=clean(b.client.name),color=clean(b.client.theme_color).toLowerCase();
 if(name.length<2||name.length>100)throw new CourseError('Enter a client name with 2–100 characters.');
 if(!validLogo(b.client.logo_url)||!/^#[a-f0-9]{6}$/.test(color))throw new CourseError('Check the client logo and theme colour.');
 if(b.client.default_language!==undefined&&!isLanguage(b.client.default_language)||b.client.location_term!==undefined&&b.client.location_term!==null&&!['site','store'].includes(b.client.location_term))throw new CourseError('Choose a supported language and location terminology.');
 const background=b.client.login_background===undefined?undefined:await normaliseImage(b.client.login_background);
 const registration=validateRegistration(b.registration as unknown as Record<string,unknown>);
 if(!Array.isArray(b.sites)||b.sites.length>10000||!Array.isArray(b.departments)||b.departments.length>100)throw new CourseError('Check the departments.');
 const siteIds=new Set<string>(),names=new Set<string>(),codes=new Set<string>();
 const sites:EditableSite[]=b.sites.map(s=>{
  const name=clean(s?.name),country=clean(s?.country),code=clean(s?.code),key=(country+'\n'+name).toLowerCase();
  if(!s||typeof s.id!=='string'||s.id.length>150||s.id&&siteIds.has(s.id)||typeof s.active!=='boolean'||name.length<2||name.length>150||country.length<2||country.length>80||code.length>50||names.has(key)||code&&codes.has(code.toLowerCase()))throw new CourseError('Check site names, countries and unique site codes.');
  if(s.id)siteIds.add(s.id);names.add(key);if(code)codes.add(code.toLowerCase());return {id:s.id,name,country,code,active:s.active};
 });
 const departmentIds=new Set<string>(),departmentNames=new Set<string>();
 const departments:Department[]=b.departments.map(d=>{
  const name=clean(d?.name);
  if(!d||typeof d.id!=='string'||d.id.length>100||d.id&&departmentIds.has(d.id)||typeof d.archived!=='boolean'||name.length<2||name.length>100||departmentNames.has(name.toLowerCase()))throw new CourseError('Use unique department names with 2–100 characters.');
  if(d.id)departmentIds.add(d.id);departmentNames.add(name.toLowerCase());return {id:d.id,name,archived:d.archived};
 });
 const choices=b.choices;
 if(!choices||Object.keys(choices).length!==featureCatalogue.length||featureCatalogue.some(f=>!choices[f.id]||!['disabled','optional','required'].includes(choices[f.id].policy)||typeof choices[f.id].enabled!=='boolean'||Object.keys(choices[f.id]).some(k=>!['enabled','policy'].includes(k))))throw new CourseError('Check the feature settings.');
 for(const f of featureCatalogue)if('parent' in f&&choices[f.id].policy==='required'&&choices[f.parent].policy!=='required')throw new CourseError('Make the parent feature Required before requiring a dependent feature.');
 return controlTransaction(async control=>{
  const row=(await control.query('SELECT * FROM public.lms_clients WHERE id=$1 AND active FOR UPDATE',[id])).rows[0];
  if(!row)throw new CourseError('Choose a client.',404);
  const tenant={...row,id:Number(row.id)} as Tenant;
  if(tenant.slug!==b.client.slug||tenant.revision!==b.client.revision)throw conflict();
  const language=b.client.default_language??tenant.default_language??'en',locationTerm=b.client.location_term===undefined?tenant.location_term??null:b.client.location_term;
  // Registry writes are provisional until the client-scoped phase succeeds.
  await control.query('UPDATE public.lms_clients SET name=$1,logo_url=$2,theme_color=$3,login_background=$5,default_language=$6,location_term=$7,revision=revision+1,updated_at=now() WHERE id=$4',[name,b.client.logo_url,color,id,background===undefined||b.client.login_background===tenant.login_background?tenant.login_background??null:background,language,locationTerm]);
  await control.query("INSERT INTO public.lms_client_audit(client_id,actor,action,details) VALUES($1,$2,'settings_updated',$3)",[id,actor,JSON.stringify({name,default_language:language,location_term:locationTerm,theme_color:color})]);
  return inClientScope(control,tenant,()=>inTransaction(async tx=>{
   await tx.query('LOCK TABLE organisation_stores,organisation_departments,registration_settings,organisation_settings IN SHARE ROW EXCLUSIVE MODE');
   const old=await snapshot(tenant);
   if(old.revisionToken!==b.revisionToken)throw conflict();
   if(old.sites.some(s=>!siteIds.has(String(s.id)))||[...siteIds].some(id=>!old.sites.some(s=>s.id===id))||old.departments.some(d=>!departmentIds.has(String(d.id)))||[...departmentIds].some(id=>!old.departments.some(d=>d.id===id)))throw conflict();
   await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor]);
   for(const s of sites){
    const previous=old.sites.find(v=>v.id===s.id);
    // Country transfers stay in Organisation, which also updates user/reporting scope.
    if(previous&&previous.country!==s.country)throw new CourseError('Manage site country changes in Organisation.');
    if(previous&&['name','country','code','active'].every(k=>previous[k]===s[k as keyof EditableSite]))continue;
    const siteId=s.id||randomUUID(),date=new Date().toISOString();
    await tx.query('INSERT INTO organisation_stores(id,name,country,store_code,active,updated_at,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=excluded.name,store_code=excluded.store_code,active=excluded.active,updated_at=excluded.updated_at,updated_by=excluded.updated_by',[siteId,s.name,s.country,s.code||null,s.active,date,actor]);
    if(!previous)await tx.query('SELECT ensure_store_credits($1,$2,$3,$4)',[siteId,s.name,s.country,s.code||null]);
    // Update labels/status only: editing never resets existing balances or top-up targets.
    await tx.query('UPDATE store_credit_accounts SET store_name=$2,country=$3,store_code=$4,active=$5 WHERE store_id=$1',[siteId,s.name,s.country,s.code||null,s.active]);
    await tx.query('INSERT INTO organisation_store_audit(id,store_id,actor,action,recorded_at) VALUES($1,$2,$3,$4,$5)',[randomUUID(),siteId,actor,previous?'edit':'add',date]);
   }
   for(const d of departments){if(d.id)await tx.query('UPDATE organisation_departments SET name=$1,archived=$2 WHERE id=$3',[d.name,d.archived,d.id]);else await tx.query('INSERT INTO organisation_departments(id,name,archived) VALUES($1,$2,$3)',[randomUUID(),d.name,d.archived]);}
   await tx.query('UPDATE registration_settings SET self_registration_enabled=$1,employee_id_label=$2,employee_id_required=$3,registration_code=$4,revision=revision+1 WHERE id=1',[registration.self_registration_enabled,registration.employee_id_label,registration.employee_id_required,registration.registration_code]);
   const before=(await tx.query('SELECT * FROM organisation_settings WHERE id=1')).rows[0];
   const next=(await tx.query('UPDATE organisation_settings SET features=$1,revision=revision+1,updated_at=now(),updated_by=$2 WHERE id=1 RETURNING *',[JSON.stringify(choices),actor])).rows[0];
   await tx.query('INSERT INTO organisation_settings_audit(actor,previous_state,next_state) VALUES($1,$2,$3)',[actor,JSON.stringify(before),JSON.stringify(next)]);
   const groups={assignment_emails:['course_assigned','pathway_assigned'],registration_reminders:['invitation_reminder','account_reminder'],expiry_reminders:['expiry_reminder','expired'],weekly_store_reports:['manager_digest'],monthly_country_reports:['country_digest']};
   const forced=Object.entries(groups).filter(([id])=>choices[id as keyof typeof choices].policy==='required').flatMap(([,kinds])=>kinds);
   if(forced.length){const mail=(await tx.query('SELECT * FROM email_settings WHERE id=1 FOR UPDATE')).rows[0],enabled=mail.enabled as string[],missing=forced.filter(k=>!enabled.includes(k));if(missing.length){const since={...(mail.enabled_since as Record<string,string>)};for(const k of missing)since[k]=new Date().toISOString();await tx.query('UPDATE email_settings SET enabled=$1,enabled_since=$2,revision=revision+1,updated_at=now(),updated_by=$3 WHERE id=1',[JSON.stringify([...enabled,...missing]),JSON.stringify(since),actor]);await tx.query("INSERT INTO email_audit(actor,action,details) VALUES($1,'required_features',$2)",[actor,JSON.stringify({enabled:missing})]);}}
   await tx.query("UPDATE email_outbox SET status='cancelled',error_code='feature_disabled' WHERE status='queued' AND (NOT feature_enabled('email_notifications') OR (kind IN ('course_assigned','pathway_assigned') AND NOT feature_enabled('assignment_emails')) OR (kind IN ('invitation_reminder','account_reminder') AND NOT feature_enabled('registration_reminders')) OR (kind IN ('expiry_reminder','expired') AND NOT feature_enabled('expiry_reminders')) OR (kind='manager_digest' AND NOT feature_enabled('weekly_store_reports')) OR (kind='country_digest' AND NOT feature_enabled('monthly_country_reports')))");
   await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,next_state) VALUES($1,'client_settings',$2,'updated',$3)",[actor,String(id),JSON.stringify({name,default_language:language,location_term:locationTerm,theme_color:color,sites,departments,registration:{...registration,registration_code:undefined,registration_code_changed:old.registration.registration_code!==registration.registration_code}})]);
   return {ok:true};
  }));
 });
}
