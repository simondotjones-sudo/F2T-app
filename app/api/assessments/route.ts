import type {NextRequest} from 'next/server';
import {requireUserAdministrator} from '@/lib/user-administration';
import {reportingFilter} from '@/lib/reporting-access';
import {storeDirectory} from '@/lib/store-directory';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {db,inTransaction} from '@/lib/database';
import {csvDownload} from '@/lib/learner-import-csv';
import {attemptAllowance} from '@/lib/assessment-attempts';
import type {CourseQuiz} from '@/lib/course-quiz';
export async function GET(request:NextRequest){try{
 const actor=await requireUserAdministrator();
 const filter=reportingFilter(actor.access,request.nextUrl.searchParams,await storeDirectory(false));
 const query=request.nextUrl.searchParams.get('q')?.slice(0,150)||'';
 const result=await db().prepare(`SELECT h.id AS assignment_id,l.name,l.email,l.store_id,l.country,h.course_title,h.learning_version,
 q.id AS attempt_id,q.started_at,q.submitted_at,q.correct_count,q.question_count,q.passed,
 CASE WHEN h.quiz_json->'advanced'->>'maxAttempts' IS NULL THEN NULL ELSE greatest(0,(h.quiz_json->'advanced'->>'maxAttempts')::int+
 (SELECT count(*) FROM course_quiz_grants g WHERE g.assignment_id=h.id)-(SELECT count(*) FROM course_quiz_attempts a WHERE a.assignment_id=h.id)) END AS remaining,
 (SELECT count(*) FROM course_quiz_attempts a WHERE a.assignment_id=h.id) AS attempts,
 (SELECT started_at FROM course_quiz_sessions s WHERE s.assignment_id=h.id AND s.submitted_at IS NULL) AS in_progress
 FROM assignment_history h JOIN learners l ON l.id=h.learner_id LEFT JOIN course_quiz_attempts q ON q.assignment_id=h.id
 WHERE h.quiz_json IS NOT NULL AND (?::text[] IS NULL OR l.store_id=ANY(?::text[]))
 AND (l.name ILIKE ? OR l.email ILIKE ? OR h.course_title ILIKE ?)
 ORDER BY h.assigned_at DESC,h.id,q.submitted_at DESC`).bind(filter.siteIds,filter.siteIds,'%'+query+'%','%'+query+'%','%'+query+'%').all();
 const rows=result.results;
 if(request.nextUrl.searchParams.get('format')==='csv')return new Response(csvDownload([
 ['Learner','Email','Site','Country','Course','Assessment version','Assignment','Attempt','Started','Submitted','Score %','Result','Attempts used','Remaining attempts','In progress'],
 ...rows.map(r=>[r.name,r.email,r.store_id,r.country,r.course_title,r.learning_version,r.assignment_id,r.attempt_id,r.started_at,r.submitted_at,r.question_count?Number(r.correct_count)*100/Number(r.question_count):'',r.passed===null?'':r.passed?'passed':'failed',r.attempts,r.remaining??'unlimited',r.in_progress||''])]),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="assessment-attempts.csv"','Cache-Control':'no-store'}});
 return json({rows,canGrant:actor.platformAdmin||actor.access.scope==='organisation'});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await requireUserAdministrator(request);
 if(!actor.platformAdmin&&actor.access.scope!=='organisation')throw new CourseError('Organisation administrator access is required.',403);
 const b=await bodyJson(request,5000);
 if(typeof b.assignmentId!=='string'||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>500||typeof b.requestId!=='string'||!/^[-a-zA-Z0-9]{16,80}$/.test(b.requestId))throw new CourseError('Enter a reason for the additional attempt.');
 await inTransaction(async tx=>{
  const h=(await tx.query('SELECT h.*,l.store_id,l.country FROM assignment_history h JOIN learners l ON l.id=h.learner_id WHERE h.id=$1',[b.assignmentId])).rows[0];
  if(!h)throw new CourseError('Assignment not found.',404);
  await tx.query('SELECT id FROM learners WHERE id=$1 FOR UPDATE',[h.learner_id]);
  if((await tx.query('SELECT id FROM course_quiz_grants WHERE id=$1 AND assignment_id=$2',[b.requestId,b.assignmentId])).rows.length)return;
  const quiz=h.quiz_json as CourseQuiz;
  if(!quiz?.advanced||quiz.advanced.maxAttempts===null)throw new CourseError('This assessment already allows unlimited attempts.');
  if(!(await tx.query('SELECT 1 FROM course_assignments WHERE history_id=$1',[b.assignmentId])).rows.length||
   (await tx.query('SELECT 1 FROM course_quiz_attempts WHERE assignment_id=$1 AND passed',[b.assignmentId])).rows.length)throw new CourseError('An active, unfinished assignment is required.',409);
  const allowance=await attemptAllowance(tx,b.assignmentId,quiz);
  if(allowance.remaining!==0)throw new CourseError('The learner still has attempts remaining.',409);
  await tx.query('INSERT INTO course_quiz_grants(id,assignment_id,granted_by,reason) VALUES($1,$2,$3,$4)',[b.requestId,b.assignmentId,actor.email,b.reason.trim()]);
  await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,learner_id,store_id,country,next_state,reason) VALUES($1,'course_quiz_grant',$2,'attempt_granted',$3,$4,$5,$6,$7)",[actor.email,b.requestId,h.learner_id,h.store_id,h.country,JSON.stringify({assignmentId:b.assignmentId,additionalAttempts:1}),b.reason.trim()]);
 });return json({granted:true});
}catch(e){return failed(e);}}
