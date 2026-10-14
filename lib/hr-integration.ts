import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {inTransaction,db} from '@/lib/database';
import {CourseError} from '@/lib/course-error';
import {requireFeature} from '@/lib/features';
import {learnerOnlySql} from '@/lib/account-type';
import {validateDepartment} from '@/lib/registration-settings';
import {validateJobRole} from '@/lib/job-roles';
import {runtimeEnv} from '@/lib/runtime-env';
const reservedEmail=()=>runtimeEnv('F2T_PLATFORM_ADMIN_EMAIL').trim().toLowerCase();
import {hrEmployee,type HrEmployee} from '@/lib/hr-schema';
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
type Tx=Parameters<Parameters<typeof inTransaction>[0]>[0];
export async function authenticateHr(request:Request){
 const token=request.headers.get('authorization')?.match(/^Bearer (hr_[a-f0-9]{64})$/)?.[1];
 if(!token)throw new CourseError('A valid HR API bearer credential is required.',401);
 const key=await inTransaction(async tx=>{
 const row=(await tx.query(`UPDATE hr_credentials SET last_used_at=now(),
 requests=CASE WHEN window_start<now()-interval '1 minute' THEN 1 ELSE requests+1 END,
 window_start=CASE WHEN window_start<now()-interval '1 minute' THEN now() ELSE window_start END
 WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() RETURNING id,requests`,[digest(token)])).rows[0];
 return row;
 });
 if(!key)throw new CourseError('Invalid or expired HR API credential.',401);
 if(Number(key.requests)>60)throw new CourseError('Rate limit exceeded. Retry after 60 seconds.',429);
 await requireFeature('hr_integration');await requireFeature('lifecycle');
 return String(key.id);
}
export async function assertHrKey(tx:Tx,id:string){
 const key=(await tx.query('SELECT id FROM hr_credentials WHERE id=$1 AND revoked_at IS NULL AND expires_at>now() FOR SHARE',[id])).rows[0];
 if(!key)throw new CourseError('Credential revoked or expired; cancel this event and resubmit with a new credential.',401);
 if(!(await tx.query("SELECT feature_enabled('hr_integration') AND feature_enabled('lifecycle') AS enabled")).rows[0]?.enabled)throw new CourseError('HR integration and lifecycle features must be enabled.',403);
}
const day=(v:unknown)=>v instanceof Date?v.toISOString().slice(0,10):String(v||'').slice(0,10);
// The existing learner records, lifecycle fields, audit triggers and assignment functions remain authoritative.
async function applyEmployee(tx:Tx,e:HrEmployee,preview=false){
 const target=(await tx.query(`SELECT l.*,NOT (${learnerOnlySql()}) AS admin_only FROM learners l WHERE workday_id=$1 FOR UPDATE`,[e.employeeId])).rows[0];
 if(target&&(target.admin_only||target.email===reservedEmail()))throw new CourseError('This employee has administrator access and requires manual management.',403);
 if(e.action==='starter'&&target)throw new CourseError('Employee ID already exists. Use update or rehire.',409);
 if(e.action!=='starter'&&!target)throw new CourseError('Employee ID was not found.',404);
 if(target&&e.action==='rehire'&&!target.archived_at)throw new CourseError('Only archived employees can be rehired.',409);
 if(target&&e.action!=='rehire'&&target.archived_at)throw new CourseError('Employee is archived. Use rehire.',409);
 if(e.action==='leave'&&['name','email','storeId','departmentId','jobRoleId','startDate'].some(k=>k in e))throw new CourseError('Send leavers separately from employee detail changes.');
 const storeId=e.storeId??target?.store_id;
 const store=(await tx.query('SELECT id,country,active,deleted_at FROM organisation_stores WHERE id=$1 FOR SHARE',[storeId||''])).rows[0];
 if(e.action!=='leave'&&(!store||!store.active||store.deleted_at))throw new CourseError('Choose an active storeId from the reference endpoint.');
 const name=e.name??target?.name,email=e.email===undefined?target?.email??null:e.email;
 if(!name)throw new CourseError('A starter requires name and storeId.');
 if(email&&email===reservedEmail())throw new CourseError('Email is already registered.',409);
 if(email&&(await tx.query('SELECT id FROM learners WHERE lower(email)=lower($1) AND id<>$2',[email,target?.id||''])).rows.length)throw new CourseError('Email is already registered.',409);
 const start=e.action==='rehire'?e.effectiveDate:(e.startDate??day(target?.employment_started_on))||e.effectiveDate;
 if(e.startDate&&e.action==='rehire'&&e.startDate!==e.effectiveDate)throw new CourseError('Rehire startDate must equal effectiveDate.');
 if(start>e.effectiveDate)throw new CourseError('Start date cannot be after the effective date.');
 const job=e.action==='leave'?target?.job_role_id:await validateJobRole(e.jobRoleId===undefined?target?.job_role_id:e.jobRoleId, target?.job_role_id as string|null,tx);
 const department=e.action==='leave'?target?.department_id:await validateDepartment(e.departmentId===undefined?target?.department_id:e.departmentId,target?.department_id as string|null,tx);
 const result={employeeId:e.employeeId,action:e.action,learnerId:target?.id||null,status:preview?'valid':'applied',fields:{name,email,storeId,jobRoleId:job,departmentId:department,startDate:start},pathwayFailures:0};
 if(preview)return result;
 const id=String(target?.id||randomUUID());
 await tx.query("SELECT set_config('app.hr_sync','on',true),set_config('app.audit_reason',$1,true)",[`HR ${e.eventId}: ${e.reason} (effective ${e.effectiveDate})`]);
 if(!target){
 await tx.query(`INSERT INTO learners(id,name,email,workday_id,store_id,country,entered_at,code_hash,password_hash,induction_enrolled,employment_started_on,job_role_id,department_id,hr_managed)
 VALUES($1,$2,$3,$4,$5,$6,now(),$7,NULL,true,$8,$9,$10,true)`,[id,name,email,e.employeeId,storeId,store!.country,digest(randomBytes(32).toString('hex')),start,job,department]);
 }else if(e.action==='leave'){
 await tx.query('UPDATE learners SET archived_at=now(),employment_ended_on=$2,lifecycle_reason=$3,hr_managed=true WHERE id=$1',[id,e.effectiveDate,e.reason]);
 await tx.query('UPDATE assessor_grants SET active=false WHERE learner_id=$1',[id]);
 }else{
 await tx.query(`UPDATE learners SET name=$2,email=$3,store_id=$4,country=$5,job_role_id=$6,department_id=$7,employment_started_on=$8,
 employment_ended_on=NULL,archived_at=NULL,lifecycle_reason=$9,hr_managed=true WHERE id=$1`,[id,name,email,storeId,store!.country,job,department,start,e.reason]);
 if(target.country!==store!.country)await tx.query('DELETE FROM learner_inductions WHERE learner_id=$1',[id]);
 if(target.store_id!==storeId||e.action==='rehire')await tx.query('UPDATE assessor_grants SET active=false WHERE learner_id=$1',[id]);
 if(e.action==='rehire')await tx.query('DELETE FROM assessor_accounts WHERE learner_id=$1',[id]);
 }
 if(target&&(e.action!=='update'||target.email!==email||target.store_id!==storeId)){
 await tx.query('DELETE FROM sessions WHERE learner_id=$1',[id]);await tx.query('DELETE FROM scorm_launches WHERE learner_id=$1',[id]);
 await tx.query("DELETE FROM password_resets WHERE account_type='learner' AND account_id=$1",[id]);
 }
 if(e.action!=='leave')await tx.query('SELECT sync_credit_assignments($1)',[id]);
 result.learnerId=id;result.pathwayFailures=Number((await tx.query('SELECT count(*) AS n FROM pathway_assignment_failures WHERE learner_id=$1',[id])).rows[0].n);
 return result;
}
export async function processHrEvent(keyId:string,input:unknown,preview=false,scheduled=false){
 const parsed=hrEmployee.safeParse(input);
 if(!parsed.success)return {status:'failed',error:parsed.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join(';')};
 const e=parsed.data,hash=digest(JSON.stringify(e));
 return inTransaction(async tx=>{
 await assertHrKey(tx,keyId);
 // Serialize identity, grants and idempotency with existing user import operations.
 await tx.query('LOCK TABLE learners,platform_admins,reporting_access,store_managers,assessor_accounts,organisation_stores IN SHARE ROW EXCLUSIVE MODE');
 const prior=(await tx.query('SELECT * FROM hr_events WHERE id=$1 FOR UPDATE',[e.eventId])).rows[0];
 if(prior&&prior.payload_hash!==hash)throw new CourseError('eventId was already used with a different payload.',409);
 if(prior&&!scheduled)return {eventId:e.eventId,...prior.result as object,status:prior.status,replayed:true};
 if(scheduled&&(!prior||prior.status!=='scheduled'))return {eventId:e.eventId,status:prior?.status||'cancelled'};
 await tx.query("SELECT set_config('app.audit_actor',$1,true)",['hr-api:'+keyId]);
 const future=e.effectiveDate>new Date().toISOString().slice(0,10);
 // A future event is fully validated now and validated again when it is applied.
 let result:Record<string,unknown>;
 await tx.query('SAVEPOINT hr_row');
 try{
 if((await tx.query("SELECT id FROM hr_events WHERE employee_id=$1 AND status='applied' AND effective_on>$2::date LIMIT 1",[e.employeeId,e.effectiveDate])).rows.length)throw new CourseError('A newer effective change was already applied. Review this stale event before resubmitting.',409);
 result=await applyEmployee(tx,e,preview||future);
 if(future)result={...result,status:'scheduled'};
 await tx.query('RELEASE SAVEPOINT hr_row');
 }catch(error){
 await tx.query('ROLLBACK TO SAVEPOINT hr_row');
 result={employeeId:e.employeeId,status:'failed',error:error instanceof CourseError?error.message:'Employee change failed. Check required fields, identity conflicts, feature settings and available credits.'};
 }
 if(!preview){
 await tx.query(`INSERT INTO hr_events(id,credential_id,employee_id,payload,payload_hash,effective_on,status,result,applied_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7='applied' THEN now() END)
 ON CONFLICT(id) DO UPDATE SET status=excluded.status,result=excluded.result,applied_at=excluded.applied_at`,[e.eventId,keyId,e.employeeId,JSON.stringify(e),hash,e.effectiveDate,result.status,JSON.stringify(result)]);
 }
 return {eventId:e.eventId,...result,preview};
 });
}
export async function runScheduledHr(){
 const events=(await db().prepare("SELECT e.credential_id,e.payload FROM hr_events e JOIN hr_credentials k ON k.id=e.credential_id WHERE e.status='scheduled' AND e.effective_on<=CURRENT_DATE AND k.revoked_at IS NULL AND k.expires_at>now() AND feature_enabled('hr_integration') AND feature_enabled('lifecycle') ORDER BY e.effective_on,e.created_at,e.id LIMIT 25").all<{credential_id:string;payload:unknown}>()).results;
 for(const event of events){try{await processHrEvent(event.credential_id,event.payload,false,true);}catch{/* Disabled/revoked integrations remain paused and visible to admins. */}}
}
