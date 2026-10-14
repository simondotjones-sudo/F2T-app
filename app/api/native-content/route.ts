import {NextRequest} from 'next/server';
import {currentLearner} from '@/lib/server';
import {db,inTransaction} from '@/lib/database';
import {nativeAssignment,nativeState,unlockedLesson} from '@/lib/native-learning';
import {nativeAuthor} from '@/lib/native-authoring';
import {sameOrigin} from '@/lib/shot-server';
import {bodyJson,json,failed,CourseError} from '@/lib/course-admin';
import {markAssessment} from '@/lib/course-quiz';
import {practiceQuiz,type NativeContent} from '@/lib/native-content';
import {issueCourseCertificate} from '@/lib/certificate-server';
export const dynamic='force-dynamic';
export async function GET(r:NextRequest){try{
 const id=r.nextUrl.searchParams.get('courseId')||'';
 if(r.nextUrl.searchParams.get('preview')==='1'){
  await nativeAuthor(id);
  const c=await db().prepare('SELECT c.title,d.content FROM courses c JOIN native_drafts d ON d.course_id=c.id WHERE c.id=?').bind(id).first();
  return json({...c,preview:true});
 }
 const learner=await currentLearner(r);if(!learner)throw new CourseError('Sign in to launch this course.',401);
 const a=await nativeAssignment(learner,id);
 return json({title:a.title,content:a.native_json,state:await nativeState(a.id),quizRequired:!!a.quiz_json,packageId:a.package_id});
}catch(e){return failed(e);}}
export async function POST(r:NextRequest){try{
 if(!sameOrigin(r))throw new CourseError('Open the course from My Courses.',403);
 const learner=await currentLearner(r);if(!learner||learner.admin_only)throw new CourseError('Sign in to launch this course.',401);
 const b=await bodyJson(r,20000);
 if(b.preview)throw new CourseError('Preview does not record progress.',400);
 if(!['launch','visit','heartbeat','acknowledge','practice','complete'].includes(b.action))throw new CourseError('Unknown action.');
 const a=await nativeAssignment(learner,b.courseId);
 let feedback:unknown;
 const token=await inTransaction(async tx=>{
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[learner.email]);
  const person=(await tx.query('SELECT id FROM learners WHERE id=$1 AND archived_at IS NULL FOR UPDATE',[learner.id])).rows[0];
  const live=(await tx.query("SELECT h.id FROM course_assignments a JOIN assignment_history h ON h.id=a.history_id JOIN courses c ON c.id=a.course_id WHERE a.history_id=$1 AND c.status='published' AND h.cancelled_at IS NULL AND pathway_course_unlocked(a.learner_id,a.course_id)",[a.id])).rows[0];
  if(!person||!live)throw new CourseError('This course assignment has changed. Return to My Courses.',403);
  const state=await nativeState(a.id),content=a.native_json as NativeContent;
  const lessonId=b.lessonId||state.lessonId||content.lessons[0]?.id;
  const lesson=content.lessons.find(l=>l.id===lessonId);
  if(!lesson||!unlockedLesson(content,lessonId,state.completed))throw new CourseError('Complete earlier required lessons first.',403);
  const event=async(kind:string,blockId:string|null=null,detail:unknown={})=>tx.query('INSERT INTO native_events(id,assignment_id,package_id,lesson_id,block_id,kind,detail) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING',[crypto.randomUUID(),a.id,a.package_id,kind==='start'||kind==='resume'||kind==='content_complete'?null:lessonId,blockId,kind,JSON.stringify(detail)]);
  if(b.action==='launch'){
   const token=crypto.randomUUID();
   await event((await tx.query("SELECT 1 FROM native_events WHERE assignment_id=$1 AND kind='start'",[a.id])).rows.length?'resume':'start');
   await tx.query('UPDATE assignment_history SET started_at=COALESCE(started_at,now()) WHERE id=$1',[a.id]);
   await tx.query('INSERT INTO native_sessions(assignment_id,lesson_id,token) VALUES($1,$2,$3) ON CONFLICT(assignment_id) DO UPDATE SET lesson_id=excluded.lesson_id,token=excluded.token,last_seen=now()',[a.id,lessonId,token]);
   return token;
  }
  const session=(await tx.query('SELECT *,EXTRACT(EPOCH FROM now()-last_seen) AS elapsed FROM native_sessions WHERE assignment_id=$1 FOR UPDATE',[a.id])).rows[0];
  if(!session||session.token!==b.token)throw new CourseError('This lesson was opened in another tab. Reopen it here to continue saving.',409);
  if(b.action==='heartbeat'&&session.lesson_id!==lessonId)return session.token;
  if(b.action==='heartbeat'){
   const elapsed=Number(session.elapsed);
   if(elapsed>0&&elapsed<=35&&session.lesson_id===lessonId&&lesson.required)await tx.query("UPDATE scorm_progress SET total_centiseconds=total_centiseconds+$4,updated_at=$5 WHERE learner_id=$1 AND package_id=$2 AND sco_id=$3",[learner.id,a.package_id,lessonId,Math.floor(elapsed*100),new Date().toISOString()]);
  }
  if(b.action==='visit'&&lesson.required)await tx.query("INSERT INTO scorm_progress(learner_id,package_id,sco_id,status,updated_at) VALUES($1,$2,$3,'incomplete',$4) ON CONFLICT DO NOTHING",[learner.id,a.package_id,lessonId,new Date().toISOString()]);
  if(b.action==='acknowledge'){
   const block=lesson.blocks.find(v=>v.id===b.blockId&&v.type==='acknowledgement');
   if(!block||block.type!=='acknowledgement'||b.confirmed!==true)throw new CourseError('Confirm the acknowledgement statement.');
   await event('acknowledgement',block.id,{statement:block.statement});
  }
  if(b.action==='practice'){
   const block=lesson.blocks.find(v=>v.id===b.blockId&&v.type==='knowledge');
   if(!block||block.type!=='knowledge')throw new CourseError('Question not found.');
   let marked;try{marked=markAssessment(practiceQuiz(block.question),[b.answers]);}catch(e){throw new CourseError((e as Error).message);}
   feedback={correct:marked.passed,explanation:block.question.explanation||''};
   await event('practice',block.id,{answers:b.answers,...marked});
  }
  if(b.action==='complete'){
   if(lesson.blocks.some(v=>v.type==='acknowledgement'&&v.required&&!state.acknowledged.includes(v.id)||v.type==='knowledge'&&v.required&&!state.practised.includes(v.id)))throw new CourseError('Complete the required interactions first.');
   await event('lesson_complete');
   if(lesson.required)await tx.query("INSERT INTO scorm_progress(learner_id,package_id,sco_id,status,updated_at,completed_at) VALUES($1,$2,$3,'completed',$4,$4) ON CONFLICT(learner_id,package_id,sco_id) DO UPDATE SET status='completed',completed_at=COALESCE(scorm_progress.completed_at,excluded.completed_at),updated_at=excluded.updated_at",[learner.id,a.package_id,lessonId,new Date().toISOString()]);
   if(content.lessons.filter(l=>l.required).every(l=>l.id===lessonId||state.completed.includes(l.id)))await event('content_complete');
   await issueCourseCertificate(learner.id,a.package_id).execute(tx);
  }
  await tx.query('UPDATE native_sessions SET lesson_id=$2,last_seen=now() WHERE assignment_id=$1',[a.id,lessonId]);
  return session.token;
 });
 return json({token,state:await nativeState(a.id),feedback});
}catch(e){return failed(e);}}
