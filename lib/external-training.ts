import type {NextRequest} from 'next/server';
import {currentLearner} from './server';
import {getUserAdministrator,managedUsersSql,type UserAdministrator} from './user-administration';
import {storeDirectory} from './store-directory';
import {db} from './database';
import {CourseError} from './course-admin';
import {sameOrigin} from './request-origin';
export type ExternalActor={id?:string;email:string;admin:UserAdministrator|null};
export async function externalActor(request:NextRequest,review=false):Promise<ExternalActor>{
 if(request.method!=='GET'&&!sameOrigin(request))throw new CourseError('Please use the External training page.',403);
 if(review){const a=await getUserAdministrator();if(!a)throw new CourseError('Reporting access is required.',403);return {id:a.id,email:a.email,admin:a};}
 const l=await currentLearner(request);if(!l)throw new CourseError('Sign in to view your training.',403);return {id:l.id,email:l.email,admin:null};
}
export async function externalScope(a:ExternalActor){return a.admin?managedUsersSql(a.admin,await storeDirectory(false)):{sql:'l.id=?',args:[a.id]};}
export async function externalPerson(a:ExternalActor,id:string,lock=false){
 const s=await externalScope(a);
 const l=await db().prepare(`SELECT l.id,l.email FROM learners l WHERE l.id=? AND l.archived_at IS NULL AND ${s.sql}${lock?' FOR UPDATE OF l':''}`).bind(id,...s.args).first();
 if(!l)throw new CourseError('Training record is not available.',404);
 return l;
}
export async function externalRecord(a:ExternalActor,id:string,lock=false){
 const s=await externalScope(a);
 const r=await db().prepare(`SELECT e.*,to_char(e.completed_on,'YYYY-MM-DD') AS completed_on,to_char(e.expires_on,'YYYY-MM-DD') AS expires_on FROM external_training e JOIN learners l ON l.id=e.learner_id WHERE e.id=? AND ${s.sql}${lock?' FOR UPDATE OF e':''}`).bind(id,...s.args).first();
 if(!r)throw new CourseError('Training record is not available.',404);return r;
}
export async function revalidateExternalActor(a:ExternalActor){
 if(!a.id)return; // Global operator credentials were resolved before the tenant transaction.
 const l=await db().prepare('SELECT id FROM learners WHERE id=? AND archived_at IS NULL FOR SHARE').bind(a.id).first();
 if(!l)throw new CourseError('Reporting access is required.',403);
 if(a.admin){const r=await db().prepare(`SELECT 1 FROM learners l WHERE l.id=? AND (EXISTS(SELECT 1 FROM platform_admins p WHERE p.learner_id=l.id) OR EXISTS(SELECT 1 FROM reporting_access r WHERE r.learner_id=l.id AND r.scope=? AND r.country IS NOT DISTINCT FROM ? AND r.site_id IS NOT DISTINCT FROM ? AND r.unit_ids=?::text[]))`).bind(a.id,a.admin.access.scope,a.admin.access.country,a.admin.access.siteId,a.admin.access.unitIds||[]).first();if(!r)throw new CourseError('Reporting access is required.',403);}
}
export function externalFields(b:Record<string,unknown>){
 const text=(key:string,max:number,required=false)=>{const v=b[key];if(typeof v!=='string'||v.length>max||required&&!v.trim())throw new CourseError('Check the external training details.');return v.trim();};
 const date=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 if(!date(b.completedOn)||String(b.completedOn)>new Date().toISOString().slice(0,10)||b.expiresOn!==null&&(!date(b.expiresOn)||String(b.expiresOn)<String(b.completedOn)))throw new CourseError('Choose valid completion and expiry dates.');
 if(b.hours!==null&&(typeof b.hours!=='number'||!Number.isFinite(b.hours)||b.hours<0||b.hours>100000))throw new CourseError('Check the training hours.');
 return [text('title',300,true),text('provider',300,true),b.completedOn,b.expiresOn,text('reference',300),b.hours,text('notes',5000)];
}
export const externalStatus="CASE WHEN e.status='approved' AND e.expires_on<CURRENT_DATE THEN 'expired' ELSE e.status END";
