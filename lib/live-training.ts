import {db,inTransaction} from './database';
import {CourseError} from './course-admin';
import {requireUserAdministrator,type UserAdministrator} from './user-administration';
import {activeLearnerSql} from './account-type';
import {requireFeature} from './features';
import {liveInstant} from './live-training-types';
import type {NextRequest} from 'next/server';
type Tx=Parameters<Parameters<typeof inTransaction>[0]>[0];
export const liveManager=(actor:UserAdministrator)=>actor.platformAdmin||actor.access.scope==='organisation';
export async function liveAdmin(request?:NextRequest){const actor=await requireUserAdministrator(request);return actor;}
export async function recheckLiveActor(tx:Tx,actor:UserAdministrator){
 if(!liveManager(actor))throw new CourseError('Organisation admin access is required.',403);
 if(actor.id&&!((await tx.query(`SELECT l.id FROM learners l WHERE l.id=$1 AND l.archived_at IS NULL AND
 (EXISTS(SELECT 1 FROM platform_admins WHERE learner_id=l.id) OR EXISTS(SELECT 1 FROM reporting_access WHERE learner_id=l.id AND scope='organisation')) FOR UPDATE`,[actor.id])).rows.length))throw new CourseError('Organisation admin access is required.',403);
 await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
}
async function audit(tx:Tx,actor:string,id:string,action:string,previous:unknown,next:unknown,reason=''){
 await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,previous_state,next_state,reason) VALUES($1,'live_training',$2,$3,$4,$5,$6)",[actor,id,action,previous?JSON.stringify(previous):null,next?JSON.stringify(next):null,reason]);
}
function text(v:unknown,max:number,required=false){if(typeof v!=='string'||v.trim().length>max||(required&&!v.trim()))throw new CourseError('Check the training details.');return v.trim();}
export async function mutateLive(actor:UserAdministrator,b:Record<string,any>){
 if(!liveManager(actor))throw new CourseError('Organisation admin access is required.',403);
 if(['training','session','assign'].includes(b.action))await requireFeature('live_training');
 return inTransaction(async tx=>{
  await recheckLiveActor(tx,actor);
  if(['training','session','assign'].includes(b.action)){await tx.query('SELECT id FROM organisation_settings WHERE id=1 FOR SHARE');if(!(await tx.query("SELECT feature_enabled('live_training') AS enabled")).rows[0].enabled)throw new CourseError('This feature is switched off in Settings.',403);}
  if(b.action==='training'){
   const title=text(b.title,150,true),description=text(b.description??'',2000),trainer=text(b.trainer,150,true);
   if(typeof b.award_certificate!=='boolean'||b.validity_months!==null&&(!Number.isInteger(b.validity_months)||b.validity_months<1||b.validity_months>120))throw new CourseError('Check the training details.');
   const id=typeof b.id==='string'?b.id:crypto.randomUUID();
   const previous=b.id?(await tx.query('SELECT * FROM live_trainings WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;
   if(b.id&&(!previous||previous.revision!==b.revision))throw new CourseError('These settings changed. Reload before saving.',409);
   await tx.query(`INSERT INTO live_trainings(id,title,description,trainer,award_certificate,validity_months,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT(id) DO UPDATE SET title=$2,description=$3,trainer=$4,award_certificate=$5,validity_months=$6,revision=live_trainings.revision+1`,[id,title,description,trainer,b.award_certificate,b.validity_months,actor.email]);
   await audit(tx,actor.email,id,'training_saved',previous,{title,description,trainer,award_certificate:b.award_certificate,validity_months:b.validity_months});return {id};
  }
  if(b.action==='session'){
   let start:string,end:string;try{start=liveInstant(b.starts_at,b.time_zone);end=liveInstant(b.ends_at,b.time_zone);}catch{throw new CourseError('Check the session dates and timezone.');}
   if(Date.parse(start)<=Date.now()||Date.parse(end)<=Date.parse(start)||Date.parse(end)-Date.parse(start)>7*86400000)throw new CourseError('Check the session dates and timezone.');
   if(!['webinar','classroom'].includes(b.format))throw new CourseError('Check the training details.');
   const location=text(b.location,1000,true);
   if(b.format==='webinar'){try{const u=new URL(location);if(u.protocol!=='https:'||u.username||u.password)throw new Error();}catch{throw new CourseError('Enter a secure webinar link.');}}
   const training=(await tx.query('SELECT id FROM live_trainings WHERE id=$1',[b.training_id])).rows[0];if(!training)throw new CourseError('Check the training details.');
   const id=typeof b.id==='string'?b.id:crypto.randomUUID(),old=b.id?(await tx.query('SELECT * FROM live_sessions WHERE id=$1 FOR UPDATE',[id])).rows[0]:null;
   if(b.id&&(!old||old.revision!==b.revision||old.status!=='scheduled'||Date.parse(String(old.starts_at))<=Date.now()||old.training_id!==b.training_id))throw new CourseError('These settings changed. Reload before saving.',409);
   await tx.query(`INSERT INTO live_sessions(id,training_id,starts_at,ends_at,time_zone,format,location,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT(id) DO UPDATE SET starts_at=$3,ends_at=$4,time_zone=$5,format=$6,location=$7,updated_at=now(),revision=live_sessions.revision+1`,[id,b.training_id,start,end,b.time_zone,b.format,location,actor.email]);
   await audit(tx,actor.email,id,'session_saved',old,{training_id:b.training_id,starts_at:start,ends_at:end,time_zone:b.time_zone,format:b.format,location});return {id};
  }
  if(!['assign','attendance','cancel_session'].includes(b.action)||typeof b.session_id!=='string')throw new CourseError('Check the training details.');
  const session=(await tx.query('SELECT s.*,t.title,t.description,t.trainer,t.award_certificate,t.validity_months FROM live_sessions s JOIN live_trainings t ON t.id=s.training_id WHERE s.id=$1 FOR UPDATE OF s',[b.session_id])).rows[0];
  if(!session||session.status!=='scheduled')throw new CourseError('This session is no longer available.',409);
  if(b.action==='assign'){
   if(Date.parse(String(session.starts_at))<=Date.now())throw new CourseError('This session is no longer available.',409);
   const keys={users:'l.id',sites:'l.store_id',departments:'l.department_id',roles:'l.job_role_id'};
   if(!['all',...Object.keys(keys)].includes(b.scope)||!Array.isArray(b.ids)||b.ids.length>1000||b.ids.some((id:unknown)=>typeof id!=='string')||b.scope!=='all'&&!b.ids.length)throw new CourseError('Choose learners or an assignment group.');
   const people=(await tx.query(`SELECT l.id,l.name,l.store_id,l.country FROM learners l WHERE ${activeLearnerSql()} AND (l.employment_ended_on IS NULL) AND (l.employment_started_on IS NULL OR l.employment_started_on<=CURRENT_DATE) AND NOT EXISTS(SELECT 1 FROM organisation_stores os WHERE os.id=l.store_id AND NOT os.active)
    ${b.scope==='all'?'':`AND ${keys[b.scope as keyof typeof keys]}=ANY($1::text[])`} ORDER BY l.id LIMIT 10001 FOR UPDATE`,b.scope==='all'?[]:[b.ids])).rows;
   if(!people.length||people.length>10000||b.scope==='users'&&people.length!==new Set(b.ids).size)throw new CourseError('Choose learners or an assignment group.');
   let assigned=0;
   for(const person of people){
    const snapshot={title:session.title,description:session.description,trainer:session.trainer,award_certificate:session.award_certificate,validity_months:session.validity_months,learner_name:person.name,store_id:person.store_id,country:person.country};
    const r=await tx.query(`INSERT INTO live_enrolments(id,session_id,learner_id,snapshot,assigned_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,learner_id) DO NOTHING RETURNING id`,[crypto.randomUUID(),b.session_id,person.id,JSON.stringify(snapshot),actor.email]);assigned+=r.rows.length;
   }
   await audit(tx,actor.email,b.session_id,'learners_assigned',null,{scope:b.scope,ids:b.ids,assigned});return {assigned,unchanged:people.length-assigned};
  }
  const reason=text(b.reason??'',500);
  if(b.action==='cancel_session'){
   if(b.revision!==session.revision||Date.parse(String(session.starts_at))<=Date.now()||reason.length<3)throw new CourseError('Check the cancellation reason and session.');
   await tx.query("UPDATE live_sessions SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=$1",[b.session_id]);
   await tx.query("UPDATE live_enrolments SET attendance='cancelled',recorded_at=now(),recorded_by=$2,reason=$3,revision=revision+1 WHERE session_id=$1 AND attendance='assigned'",[b.session_id,actor.email,reason]);
   await audit(tx,actor.email,b.session_id,'session_cancelled',session,{status:'cancelled'},reason);return {ok:true};
  }
  if(!['assigned','attended','absent','cancelled'].includes(b.attendance)||!Array.isArray(b.rows)||!b.rows.length||b.rows.length>1000||b.rows.some((r:any)=>typeof r.id!=='string'||!Number.isInteger(r.revision))||new Set(b.rows.map((r:any)=>r.id)).size!==b.rows.length)throw new CourseError('Check the attendance selection.');
  if(b.attendance==='assigned'&&Date.parse(String(session.ends_at))<=Date.now())throw new CourseError('This session is no longer available.',409);
  if(['attended','absent'].includes(b.attendance)&&Date.parse(String(session.ends_at))>Date.now())throw new CourseError('Record attendance after the session ends.');
  for(const row of b.rows){
   const e=(await tx.query('SELECT * FROM live_enrolments WHERE id=$1 AND session_id=$2 FOR UPDATE',[row.id,b.session_id])).rows[0];
   if(!e||e.revision!==row.revision)throw new CourseError('These settings changed. Reload before saving.',409);
   if(e.attendance===b.attendance)continue;
   if((e.attendance!=='assigned'||b.attendance==='cancelled')&&reason.length<3)throw new CourseError('Enter a reason for the attendance change.');
   await tx.query('UPDATE live_enrolments SET attendance=$2,recorded_at=now(),recorded_by=$3,reason=$4,revision=revision+1 WHERE id=$1',[e.id,b.attendance,actor.email,reason]);
   await tx.query('UPDATE live_certificates SET revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE enrolment_id=$1 AND revoked_at IS NULL',[e.id,actor.email,reason]);
   const snapshot=e.snapshot as Record<string,unknown>;
   if(b.attendance==='attended'&&snapshot.award_certificate){
    await tx.query(`INSERT INTO live_certificates(token,enrolment_id,snapshot,completed_at,expires_at) VALUES($1,$2,$3,$4,CASE WHEN $5::integer IS NULL THEN NULL ELSE $4::timestamptz+make_interval(months=>$5::integer) END)`,[crypto.randomUUID(),e.id,JSON.stringify({...snapshot,starts_at:session.starts_at,ends_at:session.ends_at,time_zone:session.time_zone,format:session.format,duration_minutes:Math.round((Date.parse(String(session.ends_at))-Date.parse(String(session.starts_at)))/60000)}),session.ends_at,snapshot.validity_months]);
   }
   await audit(tx,actor.email,String(e.id),'attendance_recorded',e,{attendance:b.attendance},reason);
  }
  return {ok:true};
 });
}
export function liveScope(actor:UserAdministrator){return actor.platformAdmin||actor.access.scope==='organisation'?{sql:'true',args:[]}:actor.access.scope==='unit'?{sql:'l.store_id IN (WITH RECURSIVE u AS (SELECT id FROM organisation_units WHERE id=ANY(?::text[]) UNION SELECT c.id FROM organisation_units c JOIN u ON c.parent_id=u.id) SELECT s.id FROM organisation_stores s JOIN u ON u.id=s.parent_unit_id)',args:[actor.access.unitIds||[]]}:actor.access.scope==='country'?{sql:'l.country=?',args:[actor.access.country]}:{sql:'l.store_id=?',args:[actor.access.siteId]};}
export const liveColumns=`e.id,e.session_id,e.learner_id,l.name,l.store_id,l.country,e.snapshot->>'title' AS title,e.snapshot->>'description' AS description,e.snapshot->>'trainer' AS trainer,s.starts_at,s.ends_at,s.time_zone,s.format,s.location,s.status AS session_status,e.attendance,e.revision,c.token AS certificate_token,c.expires_at`;
export const liveJoins=`FROM live_enrolments e JOIN learners l ON l.id=e.learner_id JOIN live_sessions s ON s.id=e.session_id LEFT JOIN live_certificates c ON c.enrolment_id=e.id AND c.revoked_at IS NULL`;
