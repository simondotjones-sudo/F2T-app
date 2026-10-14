import {db,inTransaction} from './database';
import {CourseError} from './course-admin';
import {requireFeature} from './features';
import {requireUserAdministrator} from './user-administration';
import {requireCourseAdministrator,requireEditableCourse} from './course-permissions';
import type {NextRequest} from 'next/server';
import type {FeedbackQuestion,FeedbackAnswer,FeedbackTemplate} from './feedback-types';
type Tx=Parameters<Parameters<typeof inTransaction>[0]>[0];
export async function feedbackReporter(){const actor=await requireUserAdministrator();await requireFeature('course_feedback');if(!actor.platformAdmin&&actor.access.scope!=='organisation')throw new CourseError('Organisation administrator access is required.',403);return actor;}
export function validateFeedback(input:unknown):FeedbackQuestion[]{
 if(!Array.isArray(input)||input.length<1||input.length>15)throw new CourseError('Use 1–15 survey questions.');
 const questions=input.map((q:any)=>{
  if(!q||typeof q.id!=='string'||!q.id||q.id.length>100||typeof q.prompt!=='string'||!q.prompt.trim()||q.prompt.length>500||typeof q.required!=='boolean'||!['rating','single','multiple','text'].includes(q.type))throw new CourseError('Check the survey questions.');
  if(!Array.isArray(q.options)||q.options.some((v:unknown)=>typeof v!=='string'||!v.trim()||(v as string).length>150)||new Set(q.options.map((v:string)=>v.trim())).size!==q.options.length||
   (q.type==='rating'?q.options.length!==5:q.type==='text'?q.options.length!==0:q.options.length<2||q.options.length>10))throw new CourseError('Check the survey answer labels.');
  return {id:q.id,type:q.type,prompt:q.prompt.trim(),required:q.required,options:q.options.map((v:string)=>v.trim())} as FeedbackQuestion;
 });
 if(new Set(questions.map(q=>q.id)).size!==questions.length)throw new CourseError('Question identifiers must be unique.');return questions;
}
export function validateFeedbackAnswers(questions:FeedbackQuestion[],input:unknown):FeedbackAnswer[]{
 if(!Array.isArray(input)||input.length!==questions.length)throw new CourseError('Check your survey answers.');
 return questions.map((q,i)=>{
  const a=input[i],empty=a===null||a===''||Array.isArray(a)&&a.length===0;
  if(empty){if(q.required)throw new CourseError('Answer the required questions before submitting.');return null;}
  if(q.type==='text'){if(typeof a!=='string'||a.trim().length>2000)throw new CourseError('Keep comments within 2,000 characters.');if(q.required&&!a.trim())throw new CourseError('Answer the required questions before submitting.');return a.trim()||null;}
  const values=q.type==='multiple'?a:[a],min=q.type==='rating'?1:0,max=q.type==='rating'?5:q.options.length-1;
  if(!Array.isArray(values)||!values.length||values.some(v=>!Number.isInteger(v)||v<min||v>max)||new Set(values).size!==values.length)throw new CourseError('Check your survey answers.');
  return q.type==='multiple'?[...values].sort((a,b)=>a-b):a;
 });
}
export async function saveFeedbackTemplate(input:FeedbackTemplate,actor:{email:string;platformAdmin:boolean},operator:boolean){
 await requireFeature('course_feedback');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>120||!['anonymous','named'].includes(input.mode)||typeof input.shared!=='boolean')throw new CourseError('Check the survey details.');
 if(input.shared&&!operator)throw new CourseError('Shared surveys are managed by EazySAFE.',403);
 const questions=validateFeedback(input.questions),id=input.id||crypto.randomUUID();
 return inTransaction(async tx=>{
  const old=(await tx.query('SELECT * FROM feedback_surveys WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(input.id&&!old)throw new CourseError('Survey not found.',404);
  if(old?.shared&&!operator)throw new CourseError('Shared surveys are managed by EazySAFE.',403);
  if(old&&old.revision!==input.revision)throw new CourseError('This survey changed. Reload before saving.',409);
  if(old&&old.mode!==input.mode&&(await tx.query('SELECT 1 FROM feedback_responses WHERE survey_id=$1 LIMIT 1',[id])).rows.length)throw new CourseError('Feedback response mode is locked.',409);
  const revision=Number(old?.revision||0)+1;
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
  await tx.query(`INSERT INTO feedback_surveys(id,name,mode,shared,revision,updated_by) VALUES($1,$2,$3,$4,$5,$6)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,shared=excluded.shared,revision=excluded.revision,updated_by=excluded.updated_by`,[id,input.name.trim(),input.mode,input.shared,revision,actor.email]);
  await tx.query('INSERT INTO feedback_versions(survey_id,version,name,questions) VALUES($1,$2,$3,$4)',[id,revision,input.name.trim(),JSON.stringify(questions)]);
  return {id,revision};
 });
}
// Attaching a survey offers it to existing completions as well. Previously offered
// versions and submission records are never replaced, including after reattachment.
export async function backfillFeedback(tx:Tx,kind:string,targetId:string){
 await tx.query(`INSERT INTO feedback_eligibility(kind,occurrence_id,learner_id,target_id,title,survey_id,version,completion_month)
  SELECT $1,x.id,x.learner_id,$2,x.title,s.id,s.revision,to_char(x.completed_at AT TIME ZONE 'UTC','YYYY-MM') FROM (
   SELECT h.id,h.learner_id,c.title,h.completed_at FROM assignment_history h JOIN courses c ON c.id=h.course_id
   WHERE $1='course' AND h.course_id=$2 AND h.completed_at IS NOT NULL AND h.cancelled_at IS NULL
   UNION ALL SELECT e.id,e.learner_id,e.snapshot->>'title',ls.ends_at FROM live_enrolments e JOIN live_sessions ls ON ls.id=e.session_id
   WHERE $1='live' AND ls.training_id=$2 AND e.attendance='attended' AND ls.status='scheduled'
  ) x JOIN feedback_bindings b ON b.kind=$1 AND b.target_id=$2 JOIN feedback_surveys s ON s.id=b.survey_id
  ON CONFLICT(kind,occurrence_id) DO NOTHING`,[kind,targetId]);
}
export async function attachFeedback(request:NextRequest,b:any,operator:boolean){
 const actor=await requireCourseAdministrator(request);await requireFeature('course_feedback');
 if(!['course','live'].includes(b.kind)||typeof b.targetId!=='string')throw new CourseError('Choose a course or training.');
 if(b.kind==='course')await requireEditableCourse(actor,b.targetId);
 return inTransaction(async tx=>{
  const table=b.kind==='course'?'courses':'live_trainings';
  if(!(await tx.query(`SELECT id FROM ${table} WHERE id=$1 FOR UPDATE`,[b.targetId])).rows.length)throw new CourseError('Course not found.',404);
  // Shared catalogue courses require a global operator, not a client platform grant.
  if(b.kind==='course'&&!operator&&(await tx.query('SELECT 1 FROM catalogue_subscriptions WHERE course_id=$1',[b.targetId])).rows.length)throw new CourseError('Shared surveys are managed by EazySAFE.',403);
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
  if(!b.surveyId){await tx.query('DELETE FROM feedback_bindings WHERE kind=$1 AND target_id=$2',[b.kind,b.targetId]);return {ok:true};}
  if(!(await tx.query('SELECT id FROM feedback_surveys WHERE id=$1 FOR UPDATE',[b.surveyId])).rows.length)throw new CourseError('Survey not found.',404);
  await tx.query('INSERT INTO feedback_bindings(kind,target_id,survey_id) VALUES($1,$2,$3) ON CONFLICT(kind,target_id) DO UPDATE SET survey_id=excluded.survey_id',[b.kind,b.targetId,b.surveyId]);
  await backfillFeedback(tx,b.kind,b.targetId);return {ok:true};
 });
}
export const validFeedbackEligibility=`((e.kind='course' AND EXISTS(SELECT 1 FROM assignment_history h WHERE h.id=e.occurrence_id AND h.learner_id=e.learner_id AND h.completed_at IS NOT NULL AND h.cancelled_at IS NULL))
 OR (e.kind='live' AND EXISTS(SELECT 1 FROM live_enrolments le JOIN live_sessions ls ON ls.id=le.session_id WHERE le.id=e.occurrence_id AND le.learner_id=e.learner_id AND le.attendance='attended' AND ls.status='scheduled')))`;
export async function submitFeedback(learnerId:string,id:unknown,version:unknown,input:unknown,mode:unknown){
 await requireFeature('course_feedback');
 if(typeof id!=='string')throw new CourseError('Survey not found.',404);
 return inTransaction(async tx=>{
  const e=(await tx.query(`SELECT e.* FROM feedback_eligibility e WHERE e.id=$1 AND e.learner_id=$2 AND ${validFeedbackEligibility} FOR UPDATE`,[id,learnerId])).rows[0];
  if(!e)throw new CourseError('Survey not found.',404);
  if(e.submitted)throw new CourseError('Feedback already submitted.',409);
  if(e.version!==version)throw new CourseError('This survey changed. Reload before saving.',409);
  const s=(await tx.query('SELECT * FROM feedback_surveys WHERE id=$1 FOR UPDATE',[e.survey_id])).rows[0];
  if(s.mode!==mode)throw new CourseError('This survey changed. Reload before saving.',409);
  const v=(await tx.query('SELECT questions FROM feedback_versions WHERE survey_id=$1 AND version=$2',[e.survey_id,e.version])).rows[0];
  const answers=validateFeedbackAnswers(v.questions as FeedbackQuestion[],input);
  await tx.query('INSERT INTO feedback_responses(survey_id,version,kind,target_id,completion_month,mode,respondent_id,answers) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[e.survey_id,e.version,e.kind,e.target_id,e.completion_month,s.mode,s.mode==='named'?learnerId:null,JSON.stringify(answers)]);
  // No answer ID, timestamp, answers or audit actor retained in tracking.
  await tx.query('UPDATE feedback_eligibility SET submitted=true WHERE id=$1',[id]);return {ok:true};
 });
}
