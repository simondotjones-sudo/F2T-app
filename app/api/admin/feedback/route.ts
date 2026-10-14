import type {NextRequest} from 'next/server';
import {requireCourseAdministrator} from '@/lib/course-permissions';
import {getPlatformOperator} from '@/lib/admin-auth';
import {requireFeature} from '@/lib/features';
import {db} from '@/lib/database';
import {bodyJson,CourseError,failed,json} from '@/lib/course-admin';
import {feedbackReporter,saveFeedbackTemplate,attachFeedback} from '@/lib/feedback';
export async function GET(){try{
 const actor=await feedbackReporter(),editor=await requireCourseAdministrator().catch(()=>null),operator=!!await getPlatformOperator();
 const templates=editor?(await db().prepare(`SELECT s.*,v.questions,EXISTS(SELECT 1 FROM feedback_responses r WHERE r.survey_id=s.id) AS locked
 FROM feedback_surveys s JOIN feedback_versions v ON v.survey_id=s.id AND v.version=s.revision ORDER BY s.name`).all()).results.map(s=>({...s,readOnly:s.shared&&!operator})):[];
 const targets=(await db().prepare(`SELECT 'course' AS kind,c.id,c.title,b.survey_id,EXISTS(SELECT 1 FROM catalogue_subscriptions WHERE course_id=c.id) AS shared
  FROM courses c LEFT JOIN feedback_bindings b ON b.kind='course' AND b.target_id=c.id
  UNION ALL SELECT 'live',t.id,t.title,b.survey_id,false FROM live_trainings t LEFT JOIN feedback_bindings b ON b.kind='live' AND b.target_id=t.id ORDER BY title`).all()).results;
 return json({templates,targets,editor:!!editor,operator,platformAdmin:actor.platformAdmin});
}catch(e){return failed(e);}}
export async function POST(request:NextRequest){try{
 const actor=await requireCourseAdministrator(request);await requireFeature('course_feedback');const operator=!!await getPlatformOperator(),b=await bodyJson(request,100000);
 if(!b||typeof b!=='object'||Array.isArray(b))throw new CourseError('Check the survey details.');
 if(b.action==='attach')return json(await attachFeedback(request,b,operator));
 return json(await saveFeedbackTemplate(b,actor,operator));
}catch(e){return failed(e);}}
