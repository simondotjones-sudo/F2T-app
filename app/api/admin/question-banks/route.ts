import type {NextRequest} from 'next/server';
import {requireCourseAdministrator} from '@/lib/course-permissions';
import {requireFeature} from '@/lib/features';
import {db,inTransaction} from '@/lib/database';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {validateQuiz} from '@/lib/course-quiz';
export async function GET(){try{const actor=await requireCourseAdministrator();
 const result=await db().prepare('SELECT * FROM question_banks ORDER BY name').all();
 return json({banks:result.results.map(b=>({...b,readOnly:b.shared&&!actor.platformAdmin})),platformAdmin:actor.platformAdmin});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await requireCourseAdministrator(request);await requireFeature('advanced_assessments');
 const b=await bodyJson(request,1500000);
 if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120||typeof b.shared!=='boolean')throw new CourseError('Check the question bank details.');
 if(b.shared&&!actor.platformAdmin)throw new CourseError('Shared question banks are managed by EazySAFE.',403);
 let questions;try{questions=validateQuiz({passPercent:80,questions:b.questions,advanced:{mode:'fixed',count:1,bankIds:[],categories:[],shuffleQuestions:false,shuffleAnswers:false,maxAttempts:null,retryMinutes:0,review:'never'}})!.questions;}catch(e){throw new CourseError((e as Error).message);}
 // Persist stable identities for fixed selections and category filtering.
 questions=questions.map(q=>({...q,id:q.id||crypto.randomUUID()}));
 if(new Set(questions.map(q=>q.id)).size!==questions.length)throw new CourseError('Question identifiers must be unique.');
 const id=b.id||crypto.randomUUID();
 await inTransaction(async tx=>{
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor.email]);
  const old=(await tx.query('SELECT * FROM question_banks WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(b.id&&!old)throw new CourseError('Question bank not found.',404);
  if(old?.shared&&!actor.platformAdmin)throw new CourseError('Shared question banks are managed by EazySAFE.',403);
  if(old){if(old.revision!==b.revision)throw new CourseError('This question bank changed. Reload before saving.',409);
   await tx.query('UPDATE question_banks SET name=$2,shared=$3,questions=$4,revision=revision+1,updated_at=now(),updated_by=$5 WHERE id=$1',[id,b.name.trim(),b.shared,JSON.stringify(questions),actor.email]);
  }else await tx.query('INSERT INTO question_banks(id,name,shared,questions,updated_by) VALUES($1,$2,$3,$4,$5)',[id,b.name.trim(),b.shared,JSON.stringify(questions),actor.email]);
 });return json({id});
}catch(e){return failed(e);}}
