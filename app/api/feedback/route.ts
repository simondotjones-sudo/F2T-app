import type {NextRequest} from 'next/server';
import {currentLearner} from '@/lib/server';
import {db} from '@/lib/database';
import {requireFeature} from '@/lib/features';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {sameOrigin} from '@/lib/shot-server';
import {submitFeedback,validFeedbackEligibility} from '@/lib/feedback';
export async function GET(request:NextRequest){try{
 const learner=await currentLearner(request);if(!learner||learner.admin_only)throw new CourseError('Sign in to see your courses.',401);await requireFeature('course_feedback');
 const rows=(await db().prepare(`SELECT e.id,e.kind,e.target_id,e.title,e.completion_month,e.version,v.name,s.mode,v.questions
 FROM feedback_eligibility e JOIN feedback_surveys s ON s.id=e.survey_id JOIN feedback_versions v ON v.survey_id=e.survey_id AND v.version=e.version
 WHERE e.learner_id=? AND NOT e.submitted AND ${validFeedbackEligibility} ORDER BY e.completion_month DESC,e.title,e.id`).bind(learner.id).all()).results;
 return json({invitations:rows});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 if(!sameOrigin(request))throw new CourseError('Please make this change from the course page.',403);
 const learner=await currentLearner(request);if(!learner||learner.admin_only)throw new CourseError('Sign in to see your courses.',401);
 const b=await bodyJson(request,40000);if(!b||typeof b!=='object')throw new CourseError('Check your survey answers.');return json(await submitFeedback(learner.id,b.id,b.version,b.answers,b.mode));
}catch(e){return failed(e);}}
