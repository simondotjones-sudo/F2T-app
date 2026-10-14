import type {NextRequest} from 'next/server';
import {db,inTransaction} from '@/lib/database';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {featureEnabled,requireFeature} from '@/lib/features';
import {externalActor,externalFields,externalPerson,externalRecord,externalScope,externalStatus,revalidateExternalActor} from '@/lib/external-training';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){try{
 const a=await externalActor(request,request.nextUrl.searchParams.get('admin')==='1'),scope=await externalScope(a);
 const search=(request.nextUrl.searchParams.get('search')||'').slice(0,150),state=request.nextUrl.searchParams.get('state')||'',exporting=request.nextUrl.searchParams.get('export')==='csv';
 const page=Number(request.nextUrl.searchParams.get('page')||1);if(!Number.isSafeInteger(page)||page<1||page>100000)throw new CourseError('Check the page number.');
 const rows=(await db().prepare(`SELECT e.*,l.name,l.email,l.store_id,${externalStatus} AS display_status,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'filename',f.filename,'state',f.state)) FROM external_training_evidence f WHERE f.record_id=e.id),'[]') evidence,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',r.id,'course',h.course_title,'valid_until',r.valid_until,'revoked_at',r.revoked_at,'reason',r.reason,'approved_by',r.approved_by,'approved_at',r.approved_at,'valid',recognition_valid(r.id),'practical_pending',h.assessor_required AND h.passed_assessment_id IS NULL)) FROM training_recognitions r JOIN assignment_history h ON h.id=r.assignment_id WHERE r.external_record_id=e.id),'[]') recognitions
 FROM external_training e JOIN learners l ON l.id=e.learner_id WHERE ${scope.sql}
 AND (?='' OR strpos(lower(l.name||' '||COALESCE(l.email,'')||' '||e.title||' '||e.provider),lower(?))>0)
 AND (?='' OR ${externalStatus}=? OR (?='expiring' AND e.status='approved' AND (e.expires_on BETWEEN CURRENT_DATE AND CURRENT_DATE+30 OR EXISTS(SELECT 1 FROM training_recognitions x WHERE x.external_record_id=e.id AND recognition_valid(x.id) AND x.valid_until BETWEEN now() AND now()+interval '30 days'))))
 ORDER BY e.submitted_at DESC,e.id LIMIT ? OFFSET ?`).bind(...scope.args,search,search,state,state,state,exporting?10001:26,exporting?0:(page-1)*25).all()).results;
 if(exporting){if(rows.length>10000)throw new CourseError('Narrow the filters before exporting more than 10000 records.');const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';return new Response('\uFEFF'+[['Learner','Email','Training','Provider','Completed','Expiry','Reference','Hours','Notes','Status','Reviewer','Decision date','Reason','RPL courses'],...rows.map(r=>[r.name,r.email,r.title,r.provider,r.completed_on,r.expires_on,r.reference,r.hours,r.notes,r.display_status,r.reviewed_by,r.reviewed_at,r.decision_reason,(r.recognitions as {course:string;valid:boolean}[]).map(x=>x.course+(x.valid?' (valid)':' (not current)')).join('; ')])].map(r=>r.map(cell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="external-training.csv"','Cache-Control':'private, no-store'}});}
 const person=request.nextUrl.searchParams.get('learner')||'';let assignments:unknown[]=[];if(person){await externalPerson(a,person);assignments=(await db().prepare(`SELECT h.id,h.course_title,h.assessor_required FROM course_assignments c JOIN assignment_history h ON h.id=c.history_id WHERE c.learner_id=? AND h.cancelled_at IS NULL AND h.superseded_at IS NULL ORDER BY h.course_title`).bind(person).all()).results;}
 const people=a.admin?(await db().prepare(`SELECT l.id,l.name,l.email FROM learners l WHERE l.archived_at IS NULL AND ${scope.sql} AND (?='' OR strpos(lower(l.name||' '||COALESCE(l.email,'')),lower(?))>0) ORDER BY l.name LIMIT 100`).bind(...scope.args,search,search).all()).results:[];
 return json({legacyRpl:!!a.admin&&(a.admin.platformAdmin||a.admin.access.scope==='organisation'),rows:rows.slice(0,25),hasMore:rows.length>25,people,assignments,enabled:await featureEnabled('external_training'),submissions:await featureEnabled('external_submissions'),rpl:await featureEnabled('training_recognition')});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const a=await externalActor(request,request.nextUrl.searchParams.get('admin')==='1'),b=await bodyJson(request,15000);
 if(!b||typeof b!=='object'||Array.isArray(b))throw new CourseError('Check the external training details.');
 const result=await inTransaction(async tx=>{
 await revalidateExternalActor(a);await tx.query("SELECT set_config('app.audit_actor',$1,true),set_config('app.audit_reason',$2,true)",[a.email,typeof b.reason==='string'?b.reason.slice(0,2000):'External training record']);
 if(b.action==='create'){
  await requireFeature('external_training');if(!a.admin)await requireFeature('external_submissions');
  const learnerId=a.admin?b.learnerId:a.id;if(typeof learnerId!=='string')throw new CourseError('Choose a learner.');await externalPerson(a,learnerId,true);
  const f=externalFields(b),id=crypto.randomUUID();await tx.query('INSERT INTO external_training(id,learner_id,title,provider,completed_on,expires_on,reference,hours,notes,submitted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',[id,learnerId,...f,a.email]);return {id};
 }
 if(typeof b.id!=='string')throw new CourseError('Choose a training record.');const r=await externalRecord(a,b.id,true);
 if(b.revision!==r.revision)throw new CourseError('This record changed. Reload before saving.',409);
 if(b.action==='edit'){
  await requireFeature('external_training');if(!a.admin)await requireFeature('external_submissions');if(r.status!=='pending')throw new CourseError('Only pending records can be edited.',409);
  const f=externalFields(b);await tx.query('UPDATE external_training SET title=$2,provider=$3,completed_on=$4,expires_on=$5,reference=$6,hours=$7,notes=$8,revision=revision+1 WHERE id=$1',[b.id,...f]);return {id:b.id};
 }
 if(!a.admin)throw new CourseError('Reporting access is required.',403);
 const l=await externalPerson(a,String(r.learner_id),true);
 if(r.learner_id===a.id||String(l.email).toLowerCase()===a.email.toLowerCase())throw new CourseError('You cannot review your own training.',403);
 if(typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>2000)throw new CourseError('Enter a decision reason.');
 if(!['approve','reject','revoke','recognise'].includes(b.action))throw new CourseError('Choose a decision.');
 if(b.action==='recognise'&&(!b.assignmentId||typeof b.assignmentId!=='string'))throw new CourseError('Choose a current assignment for this learner.');
 if(b.action==='revoke'){
  if(r.status!=='approved')throw new CourseError('Only approved records can be revoked.',409);
  await tx.query("UPDATE training_recognitions SET revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE external_record_id=$1 AND revoked_at IS NULL",[b.id,a.email,b.reason.trim()]);
 }else{
  await requireFeature('external_training');
  if(b.action==='recognise'?r.status!=='approved':r.status!=='pending')throw new CourseError('This record is no longer awaiting this decision.',409);
  if(b.action==='approve'||b.action==='recognise'){
   if(!(await tx.query("SELECT id FROM external_training_evidence WHERE record_id=$1 AND state='ready' LIMIT 1",[b.id])).rowCount)throw new CourseError('Upload supporting evidence before approval.');
  }
 }
 if(b.action!=='recognise')await tx.query('UPDATE external_training SET status=$2,reviewed_by=$3,reviewed_at=now(),decision_reason=$4,revision=revision+1 WHERE id=$1',[b.id,({approve:'approved',reject:'rejected',revoke:'revoked'} as Record<string,string>)[b.action],a.email,b.reason.trim()]);
 if((b.action==='approve'||b.action==='recognise')&&b.assignmentId){
  await requireFeature('training_recognition');
  const h=(await tx.query('SELECT h.* FROM assignment_history h JOIN course_assignments c ON c.history_id=h.id WHERE h.id=$1 AND h.learner_id=$2 AND h.cancelled_at IS NULL AND h.superseded_at IS NULL FOR UPDATE OF h',[b.assignmentId,r.learner_id])).rows[0];if(!h)throw new CourseError('Choose a current assignment for this learner.');
  if(r.expires_on&&String(r.expires_on).slice(0,10)<new Date().toISOString().slice(0,10))throw new CourseError('Expired training cannot satisfy a current course.');
  const expiry=b.validUntil===null?null:typeof b.validUntil==='string'?b.validUntil:'';
  if(expiry!==null&&(!/^\d{4}-\d{2}-\d{2}$/.test(expiry)||!Number.isFinite(Date.parse(expiry))||new Date(expiry).toISOString().slice(0,10)!==expiry||expiry<new Date().toISOString().slice(0,10))||r.expires_on&&(expiry===null||expiry>String(r.expires_on).slice(0,10)))throw new CourseError('Recognition validity must not exceed the external certificate expiry.');
  await tx.query(`INSERT INTO training_recognitions(assignment_id,learner_id,kind,reason,evidence_ref,qualification,achieved_on,valid_until,approved_by,external_record_id) VALUES($1,$2,'recognised',$3,$4,$5,$6,CASE WHEN $7::date IS NULL THEN NULL ELSE ($7::date+1)::timestamp AT TIME ZONE 'UTC' END,$8,$9)`,[h.id,r.learner_id,b.reason.trim(),'External evidence record '+b.id,r.title,r.completed_on,expiry,a.email,b.id]);

 }
 return {id:b.id};
 });return json({ok:true,...result});
}catch(e){if((e as {code?:string}).code==='23505')return failed(new CourseError('Revoke the existing decision before recording a replacement.',409));return failed(e);}}
