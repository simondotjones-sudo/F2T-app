import {randomInt} from 'node:crypto';
import {CourseError} from '@/lib/course-admin';
import {assessmentReview,markAssessment,publicAssessment,selectAssessment,type CourseQuiz} from '@/lib/course-quiz';
type Tx={query:(sql:string,args?:unknown[])=>Promise<{rows:Record<string,any>[]}>};
export async function attemptAllowance(tx:Tx,assignmentId:string,quiz:CourseQuiz){
 const {rows:[row]}=await tx.query(`SELECT count(*)::int AS used,max(submitted_at) AS last,
  (SELECT count(*)::int FROM course_quiz_grants WHERE assignment_id=$1) AS extra FROM course_quiz_attempts WHERE assignment_id=$1`,[assignmentId]);
 const limit=quiz.advanced?.maxAttempts??null;
 const retryAt=row.last&&quiz.advanced?.retryMinutes?new Date(new Date(row.last).getTime()+quiz.advanced.retryMinutes*60000).toISOString():null;
 return {used:row.used,remaining:limit===null?null:Math.max(0,limit+row.extra-row.used),retryAt};
}
export async function startAssessment(tx:Tx,assignmentId:string,quiz:CourseQuiz,version:number|null){
 const existing=(await tx.query('SELECT * FROM course_quiz_sessions WHERE assignment_id=$1 AND submitted_at IS NULL',[assignmentId])).rows[0];
 const allowance=await attemptAllowance(tx,assignmentId,quiz);
 if(existing)return sessionResponse(existing,allowance);
 if(allowance.remaining===0)throw new CourseError('No attempts remaining. Contact your administrator.',409);
 if(allowance.retryAt&&Date.parse(allowance.retryAt)>Date.now())throw new CourseError('The retry delay has not ended.',409);
 const snapshot=selectAssessment(quiz,randomInt),id=crypto.randomUUID();
 const session=(await tx.query('INSERT INTO course_quiz_sessions(id,assignment_id,snapshot,assessment_version) VALUES($1,$2,$3,$4) RETURNING *',[id,assignmentId,JSON.stringify(snapshot),version])).rows[0];
 return sessionResponse(session,allowance);
}
function sessionResponse(s:Record<string,any>,allowance:unknown){return {attemptId:s.id,questions:publicAssessment(s.snapshot),answers:s.answers,startedAt:s.started_at,assessmentVersion:s.assessment_version,allowance};}
export async function saveAssessment(tx:Tx,assignmentId:string,id:string,answers:unknown,submit:boolean){
 const s=(await tx.query('SELECT * FROM course_quiz_sessions WHERE id=$1 AND assignment_id=$2 FOR UPDATE',[id,assignmentId])).rows[0];
 if(!s)throw new CourseError('Reopen the assessment before submitting.',409);
 if(s.submitted_at){
  const old=(await tx.query('SELECT * FROM course_quiz_attempts WHERE id=$1 AND assignment_id=$2',[id,assignmentId])).rows[0];
  return {correct:old.correct_count,total:old.question_count,passPercent:old.pass_percent,passed:old.passed,review:assessmentReview(old.snapshot,old.passed)};
 }
 const quiz=s.snapshot as CourseQuiz;
 if(!submit){
  if(!Array.isArray(answers)||answers.length!==quiz.questions.length||answers.some((a,i)=>a!==null&&(!Array.isArray(a)||new Set(a).size!==a.length||a.some(n=>!Number.isInteger(n)||n<0||n>=quiz.questions[i].options.length)||(quiz.questions[i].type!=='multiple'&&a.length>1))))throw new CourseError('Check the saved answers.');
  await tx.query('UPDATE course_quiz_sessions SET answers=$2,updated_at=now() WHERE id=$1',[id,JSON.stringify(answers)]);return {saved:true};
 }
 let marked;try{marked=markAssessment(quiz,answers);}catch(e){throw new CourseError((e as Error).message);}
 await tx.query(`INSERT INTO course_quiz_attempts(id,assignment_id,answers,correct_count,question_count,pass_percent,passed,snapshot,assessment_version,started_at)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,[id,assignmentId,JSON.stringify(answers),marked.correct,marked.total,marked.passPercent,marked.passed,JSON.stringify(quiz),s.assessment_version,s.started_at]);
 await tx.query('UPDATE course_quiz_sessions SET answers=$2,submitted_at=now(),updated_at=now() WHERE id=$1',[id,JSON.stringify(answers)]);
 return {...marked,review:assessmentReview(quiz,marked.passed)};
}
