import {db} from '@/lib/database';
import {CourseError} from '@/lib/course-admin';
import {validateQuiz,validateAssessmentOptions,type CourseQuiz,type QuizQuestion} from '@/lib/course-quiz';
// Pools are frozen into the existing course/assignment snapshot. Shared catalogue
// releases carry this self-contained snapshot; recipient clients need no bank access.
export async function resolveAssessment(value:unknown):Promise<CourseQuiz|null>{
 const input=value as CourseQuiz|null;
 if(!input?.advanced)return validateQuiz(value);
 const a=validateAssessmentOptions(input.advanced);
 let questions=input.questions;
 if(a.mode==='random'){
  if(!a.bankIds.length)throw new CourseError('Select at least one question bank.');
  const rows=await db().prepare('SELECT id,questions FROM question_banks WHERE id=ANY(?::text[])').bind(a.bankIds).all<{id:string;questions:QuizQuestion[]}>();
  if(rows.results.length!==a.bankIds.length)throw new CourseError('Question bank not found.',404);
  questions=rows.results.flatMap(b=>b.questions.filter(q=>!a.categories.length||a.categories.includes(q.category||'')).map(q=>({...q,bankId:b.id})));
  if(questions.length<a.count)throw new CourseError('Not enough eligible questions.');
 }
 if(a.mode==='fixed'&&questions.length>50)throw new CourseError('Use at most 50 fixed questions.');
 return validateQuiz({...input,advanced:a,questions});
}
