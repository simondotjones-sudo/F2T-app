import type {NextRequest} from 'next/server';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {requireUserAdministrator} from '@/lib/user-administration';
import {inTransaction} from '@/lib/database';
import {registrationSettings,departments,validateRegistration} from '@/lib/registration-settings';
export const dynamic='force-dynamic';
async function actor(request?:NextRequest){const a=await requireUserAdministrator(request);if(!a.platformAdmin&&a.access.scope!=='organisation')throw new CourseError('Organisation admin access is required.',403);return a;}
async function state(){return json({settings:await registrationSettings(),departments:await departments()});}
export async function GET(){try{await actor();return await state();}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const a=await actor(request),b=await bodyJson(request,30000),settings=validateRegistration(b);
 if(!Number.isSafeInteger(b.revision)||!Array.isArray(b.departments)||b.departments.length>100)throw new CourseError('Check the registration settings.');
 const names=new Set<string>(),ids=new Set<string>();
 const list=b.departments.map((d:Record<string,unknown>)=>{if(!d||typeof d!=='object')throw new CourseError('Check the departments.');const name=typeof d.name==='string'?d.name.trim():'';if(name.length<2||name.length>100||typeof d.archived!=='boolean'||typeof d.id!=='string'||d.id.length>100||names.has(name.toLowerCase())||d.id&&ids.has(d.id))throw new CourseError('Use unique department names with 2–100 characters.');names.add(name.toLowerCase());if(d.id)ids.add(d.id);return {id:d.id,name,archived:d.archived};});
 await inTransaction(async tx=>{
  if(a.id){const row=(await tx.query("SELECT l.id FROM learners l WHERE l.id=$1 AND l.archived_at IS NULL AND (EXISTS(SELECT 1 FROM platform_admins p WHERE p.learner_id=l.id) OR EXISTS(SELECT 1 FROM reporting_access r WHERE r.learner_id=l.id AND r.scope='organisation')) FOR UPDATE",[a.id])).rows[0];if(!row)throw new CourseError('Organisation admin access is required.',403);}
  const old=(await tx.query('SELECT * FROM registration_settings WHERE id=1 FOR UPDATE')).rows[0];if(old.revision!==b.revision)throw new CourseError('These settings changed. Reload before saving.',409);
  const existing=(await tx.query('SELECT id FROM organisation_departments')).rows;
  if(existing.some(d=>!ids.has(String(d.id)))||[...ids].some(id=>!existing.some(d=>d.id===id)))throw new CourseError('These settings changed. Reload before saving.',409);
  for(const d of list){if(d.id)await tx.query('UPDATE organisation_departments SET name=$1,archived=$2 WHERE id=$3',[d.name,d.archived,d.id]);else await tx.query('INSERT INTO organisation_departments(id,name,archived) VALUES($1,$2,$3)',[crypto.randomUUID(),d.name,d.archived]);}
  await tx.query('UPDATE registration_settings SET self_registration_enabled=$1,employee_id_label=$2,employee_id_required=$3,registration_code=$4,revision=revision+1 WHERE id=1',[settings.self_registration_enabled,settings.employee_id_label,settings.employee_id_required,settings.registration_code]);
  await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,next_state) VALUES($1,'registration','settings','updated',$2)",[a.email,JSON.stringify({...settings,registration_code:undefined,registration_code_changed:old.registration_code!==settings.registration_code,departments:list})]);
 });return await state();
}catch(e){if((e as {code?:string}).code==='23505')return json({error:'Use unique department names with 2–100 characters.'},409);return failed(e);}}
