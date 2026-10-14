import {db} from '@/lib/database';
import {CourseError} from '@/lib/course-error';
import type {RegistrationSettings,Department,PublicRegistration} from './registration-types';
export async function registrationSettings(){
 const row=await db().prepare('SELECT * FROM registration_settings WHERE id=1').first<RegistrationSettings>();
 if(!row)throw new CourseError('Registration settings are unavailable.',503);
 return row;
}
export async function departments(){return (await db().prepare('SELECT id,name,archived FROM organisation_departments ORDER BY archived,lower(name)').all<Department>()).results;}
export async function publicRegistration():Promise<PublicRegistration>{const s=await registrationSettings();return {self_registration_enabled:s.self_registration_enabled,employee_id_label:s.employee_id_label,employee_id_required:s.employee_id_required,departments:(await departments()).filter(d=>!d.archived)};}
export async function validateDepartment(value:unknown,current?:string|null,tx?:{query:(sql:string,values:unknown[])=>Promise<{rows:Record<string,unknown>[]}>}){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||value.length>100)throw new CourseError('Choose an active department.');
 const row=tx?(await tx.query('SELECT id,archived FROM organisation_departments WHERE id=$1 FOR SHARE',[value])).rows[0]:await db().prepare('SELECT id,archived FROM organisation_departments WHERE id=?').bind(value).first();
 if(!row||(row.archived&&value!==current))throw new CourseError('Choose an active department.');return value;
}
export function validateRegistration(b:Record<string,unknown>){
 if(!b||typeof b!=='object'||Array.isArray(b))throw new CourseError('Check the registration settings.');
 const label=typeof b.employee_id_label==='string'?b.employee_id_label.trim():'';
 const code=typeof b.registration_code==='string'?b.registration_code.trim():'';
 if(typeof b.self_registration_enabled!=='boolean'||typeof b.employee_id_required!=='boolean'||label.length<2||label.length>40||/\p{C}/u.test(label))throw new CourseError('Check the registration settings.');
 if((b.self_registration_enabled||code)&&!/^[a-zA-Z0-9-]{4,30}$/.test(code))throw new CourseError('Use 4–30 letters, numbers or hyphens for the registration code.');
 return {self_registration_enabled:b.self_registration_enabled,employee_id_label:label,employee_id_required:b.employee_id_required,registration_code:code};
}
