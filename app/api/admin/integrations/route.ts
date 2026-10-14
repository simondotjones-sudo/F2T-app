import {randomBytes,randomUUID} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {requireUserAdministrator} from '@/lib/user-administration';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {db,inTransaction} from '@/lib/database';
import {currentTenant} from '@/lib/tenant-context';
import {digest} from '@/lib/hr-integration';
import {featureEnabled} from '@/lib/features';
import {hrEmployee} from '@/lib/hr-schema';
export const dynamic='force-dynamic';
async function actorFor(request?:NextRequest){const actor=await requireUserAdministrator(request);if(!actor.platformAdmin&&actor.access.scope!=='organisation')throw new CourseError('Organisation admin access is required.',403);return actor;}
export async function GET(request:NextRequest){try{
 await actorFor();
 const filter=(request.nextUrl.searchParams.get('employeeId')||'').trim().toUpperCase().slice(0,50);
 const keys=await db().prepare('SELECT id,name,created_at,created_by,expires_at,revoked_at,last_used_at FROM hr_credentials ORDER BY created_at DESC LIMIT 100').all();
 const events=await db().prepare("SELECT id,employee_id,effective_on,status,result,created_at,credential_id FROM hr_events WHERE (?='' OR employee_id=?) ORDER BY created_at DESC LIMIT 100").bind(filter,filter).all();
 const managed=await db().prepare("SELECT id,name,workday_id FROM learners WHERE hr_managed AND (?='' OR workday_id=?) ORDER BY name LIMIT 100").bind(filter,filter).all();
 const counts=await db().prepare('SELECT status,count(*)::int AS count FROM hr_events GROUP BY status').all();
 const lastSuccess=await db().prepare("SELECT max(applied_at) AS at FROM hr_events WHERE status='applied'").first<{at:string|null}>();
 return json({lastSuccess:lastSuccess?.at||null,keys:keys.results,events:events.results,managed:managed.results,counts:counts.results,slug:(await currentTenant()).slug,enabled:await featureEnabled('hr_integration'),lifecycle:await featureEnabled('lifecycle')});
 }catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await actorFor(request),body=await bodyJson(request,10000);
 if(!body||!['create','rotate','revoke','cancel','retry','release'].includes(body.action))throw new CourseError('Choose an integration action.');
 return json(await inTransaction(async tx=>{
 // Recheck tenant-local authority after acquiring the actor's row lock.
 if(actor.id){const user=(await tx.query(`SELECT l.id FROM learners l WHERE l.id=$1 AND l.archived_at IS NULL AND
 (EXISTS(SELECT 1 FROM platform_admins p WHERE p.learner_id=l.id) OR EXISTS(SELECT 1 FROM reporting_access r WHERE r.learner_id=l.id AND r.scope='organisation')) FOR UPDATE`,[actor.id])).rows[0];if(!user)throw new CourseError('Organisation admin access is required.',403);}
 await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
 let token:string|undefined,id=body.id;
 if(['create','rotate','retry'].includes(body.action)&&!(await tx.query("SELECT feature_enabled('hr_integration') AND feature_enabled('lifecycle') enabled")).rows[0].enabled)throw new CourseError('Enable HR integration and lifecycle handling in Settings first.',403);
 if(body.action==='create'){
 if(typeof body.name!=='string'||body.name.trim().length<2||body.name.length>80)throw new CourseError('Enter a credential name (2–80 characters).');
 id=randomUUID();token='hr_'+randomBytes(32).toString('hex');
 await tx.query("INSERT INTO hr_credentials(id,name,token_hash,created_by,expires_at) VALUES($1,$2,$3,$4,now()+interval '365 days')",[id,body.name.trim(),digest(token),actor.email]);
 }else if(body.action==='rotate'||body.action==='revoke'){
 if(body.action==='rotate')token='hr_'+randomBytes(32).toString('hex');
 const result=body.action==='rotate'?await tx.query("UPDATE hr_credentials SET token_hash=$2,expires_at=now()+interval '365 days',window_start=now(),requests=0 WHERE id=$1 AND revoked_at IS NULL RETURNING id",[id,digest(token!)]):await tx.query('UPDATE hr_credentials SET revoked_at=now() WHERE id=$1 AND revoked_at IS NULL RETURNING id',[id]);
 if(!result.rows.length)throw new CourseError('Credential not found or already revoked.',404);
 }else if(body.action==='release'){
 const user=(await tx.query('SELECT workday_id FROM learners WHERE id=$1 AND hr_managed FOR UPDATE',[id])).rows[0];
 if(!user)throw new CourseError('Managed employee not found.',404);
 if((await tx.query("SELECT id FROM hr_events WHERE employee_id=$1 AND status='scheduled'",[user.workday_id])).rows.length)throw new CourseError('Cancel scheduled changes for this employee before releasing payroll control.',409);
 await tx.query('UPDATE learners SET hr_managed=false WHERE id=$1',[id]);
 }else{
 const event=(await tx.query('SELECT * FROM hr_events WHERE id=$1 FOR UPDATE',[id])).rows[0];
 if(!event)throw new CourseError('Event not found.',404);
 if(body.action==='cancel'){
 if(event.status!=='scheduled'&&event.status!=='failed')throw new CourseError('Only scheduled or failed events can be cancelled.');
 await tx.query("UPDATE hr_events SET status='cancelled',result=result||'{\"status\":\"cancelled\"}'::jsonb WHERE id=$1",[id]);
 }else{
 if(event.status!=='failed')throw new CourseError('Only failed events can be retried.');
 hrEmployee.parse(event.payload);
 const key=(await tx.query('SELECT id FROM hr_credentials WHERE id=$1 AND revoked_at IS NULL AND expires_at>now()',[event.credential_id])).rows[0];
 if(!key)throw new CourseError('Rotate an expired credential, or resubmit with a new credential and eventId after revocation.');
 await tx.query("UPDATE hr_events SET status='scheduled',result='{\"status\":\"scheduled\"}' WHERE id=$1",[id]);
 }
 }
 await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,reason) VALUES($1,'hr_integration',$2,$3,$4)",[actor.email,id,body.action,'HR integration administration']);
 return {ok:true,...(token?{token}:{})};
 }));
 }catch(e){return failed(e);}}
