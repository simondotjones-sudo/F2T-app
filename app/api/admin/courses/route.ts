import {publishNative,nativeAuthor,checkedContent} from '@/lib/native-authoring';
import {normaliseImage} from '@/lib/image-validation';
import {requireCourseAdministrator,requireEditableCourse} from '@/lib/course-permissions';
import {isDeepStrictEqual} from 'node:util';
import {requireFeature,featureEnabled} from '@/lib/features';
import {publishCourseVersion} from '@/lib/course-versions';
import {resolveAssessment} from '@/lib/assessment-authoring';
import {inTransaction} from '@/lib/database';
import {creditError} from '@/lib/credits';
import { activeLearnerSql } from '@/lib/account-type';
import { NextRequest } from 'next/server';
import { db } from '@/lib/server';
import { bodyJson, failed, getCourse, getPackage, json, now, validateAudience, CourseError } from '@/lib/course-admin';
import { type Course, type Person } from '@/lib/course-types';
import {storeDirectory} from '@/lib/store-directory';
import { courseLanguages } from '@/lib/course-catalogue';
export const dynamic='force-dynamic';
function optionalPositiveInteger(value: unknown, existing: number | null | undefined, label: string, max: number) {
  if (value === undefined) return existing ?? null;
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > max)
    throw new CourseError(`${label} must be a whole number from 1 to ${max.toLocaleString('en-GB')}, or left blank.`);
  return value;
}
export async function GET() { try {
  const actor=await requireCourseAdministrator();
  const [courses,people,packages,progress] = await Promise.all([
    db().prepare(`SELECT c.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('country',r.country,'courseId',r.refresher_course_id) ORDER BY r.country) FROM course_refresher_rules r WHERE r.source_course_id=c.id),'[]'::jsonb) AS refresher_rules FROM courses c ORDER BY updated_at DESC`).all<Course>(),
    db().prepare(`SELECT l.id,l.name,l.email,l.country,l.store_id FROM learners l WHERE ${activeLearnerSql()} ORDER BY name`).all<Person>(),
    db().prepare("SELECT id,course_id,filename,status,scos_json,created_at,file_count,total_bytes FROM course_packages WHERE status='ready'").all<any>(),
    db().prepare('SELECT learner_id,package_id,sco_id,status,score,updated_at FROM scorm_progress').all<any>(),
  ]);
  const shared=await db().prepare('SELECT course_id FROM catalogue_subscriptions').all<{course_id:string}>();
  return json({authoring:await featureEnabled('course_authoring'),courses:courses.results.map(c=>({...c,read_only:!actor.platformAdmin&&shared.results.some(s=>s.course_id===c.id)})),people:people.results,packages:packages.results,progress:progress.results});
} catch(e) { return failed(creditError(e)); } }
export async function POST(request: NextRequest) { try {
  const actor=await requireCourseAdministrator(request);
 const stores=await storeDirectory(false);const storeById=new Map(stores.map(s=>[s.id,s]));
  const b=await bodyJson(request,2000000); const title=typeof b.title==='string'?b.title.trim():''; const description=typeof b.description==='string'?b.description.trim():'';
  if (!title || title.length>150 || description.length>2000) throw new CourseError('Add a course title (up to 150 characters) and a description of up to 2,000 characters.');
  if(b.retrain!==undefined&&typeof b.retrain!=='boolean')throw new CourseError('Choose whether retraining is required.');
  if (!['draft','published'].includes(b.status)) throw new CourseError('Invalid course status.');
  const audience=await validateAudience(b.audience);
  const existing=b.id?await getCourse(b.id):null;
  if(existing)await requireEditableCourse(actor,existing.id);
  const delivery=b.deliveryType??existing?.delivery_type??'scorm';
  if(!['scorm','native'].includes(delivery)||(existing&&delivery!==existing.delivery_type))throw new CourseError('Course delivery type cannot be changed.');
  if(delivery==='native'){await requireFeature('course_authoring');if(existing)await nativeAuthor(existing.id);}
  if (b.id && !existing) throw new CourseError('Course not found.',404);
  const coverImage=b.coverImage===undefined||b.coverImage===existing?.cover_image?existing?.cover_image??null:await normaliseImage(b.coverImage);
  const rules=b.refresherRules===undefined?(existing?.refresher_rules??[]):b.refresherRules;
  if(!Array.isArray(rules)||rules.length>30||rules.some(r=>!r||typeof r.country!=='string'||!stores.some(s=>s.country===r.country)||typeof r.courseId!=='string'||r.courseId===b.id)||new Set(rules.map(r=>r.country)).size!==rules.length)throw new CourseError('Choose valid refresher rules.');
  const targets=await db().prepare('SELECT id FROM courses').all<{id:string}>();
  if(rules.some(r=>!targets.results.some(c=>c.id===r.courseId)))throw new CourseError('Choose valid refresher rules.');
  const assessorRequired=b.assessorRequired===undefined?!!existing?.assessor_required:b.assessorRequired;
  if(typeof assessorRequired!=='boolean')throw new CourseError('Choose whether assessor sign-off is required.');
  const deadlineDays=optionalPositiveInteger(b.deadlineDays,existing?.deadline_days,'Deadline',3650);
  let quiz;try{quiz=b.quiz===undefined||isDeepStrictEqual(b.quiz,existing?.quiz_json)?existing?.quiz_json??null:await resolveAssessment(b.quiz);}catch(e){if(e instanceof CourseError)throw e;throw new CourseError((e as Error).message);}
  if(assessorRequired&&!existing?.assessor_required)await requireFeature('assessor');
  if(quiz&&!isDeepStrictEqual(quiz,existing?.quiz_json)){await requireFeature('quizzes');if(quiz.advanced)await requireFeature('advanced_assessments');}
  const validityMonths=optionalPositiveInteger(b.validityMonths,existing?.validity_months,'Validity',120);
  const duration=optionalPositiveInteger(b.estimatedDurationMinutes,existing?.estimated_duration_minutes,'Estimated duration',10080);
  const lessonCount=optionalPositiveInteger(b.lessonCount,existing?.lesson_count,'Lesson count',1000);
  const englishTitle=typeof b.englishTitle==='string'?b.englishTitle.trim():existing?.english_title||title;
  const category=typeof b.category==='string'?b.category.trim():existing?.category||'';
  const languageCode=b.languageCode??existing?.language_code??'en';
  const catalogueScope=b.catalogueScope??existing?.catalogue_scope??'unconfigured';
  const availableCountries=b.availableCountries??JSON.parse(existing?.available_countries_json||'[]');
  const inductionRole=b.inductionRole??existing?.induction_role??'none';
  if(englishTitle.length>150||category.length>80||!Object.hasOwn(courseLanguages,languageCode))throw new CourseError('Check the English title, category and language.');
  if(!['unconfigured','countries','global'].includes(catalogueScope)||!Array.isArray(availableCountries)||availableCountries.length>30||availableCountries.some(c=>typeof c!=='string'||!stores.some(s=>s.country===c)))throw new CourseError('Choose valid catalogue countries.');
  const linkedCountries=catalogueScope==='countries'?[...new Set(availableCountries)]:[];
  if(catalogueScope==='countries'&&!linkedCountries.length)throw new CourseError('Select at least one country.');
  if(!['none','country','default'].includes(inductionRole)||(inductionRole==='country'&&catalogueScope!=='countries')||(inductionRole==='default'&&(languageCode!=='en'||catalogueScope!=='global')))throw new CourseError('Country induction needs country availability. The default induction must be English and available in all countries.');
  if (b.status==='published') {
    if (delivery==='scorm'&&(!existing?.package_id || (await getPackage(existing.package_id))?.status!=='ready')) throw new CourseError('Upload and validate a SCORM package before publishing.');
    if (!audience.countries.length&&!audience.sites.length&&!audience.users.length&&!audience.units?.length&&catalogueScope==='unconfigured') throw new CourseError('Choose an audience or make the course available in the country library before publishing.');
    if(inductionRole!=='none'){
      const others=await db().prepare("SELECT * FROM courses WHERE status='published' AND induction_role=? AND id<>?").bind(inductionRole,existing!.id).all<Course>();
      if(others.results.some(c=>inductionRole==='default'||JSON.parse(c.available_countries_json).some((country:string)=>linkedCountries.includes(country))))throw new CourseError('Another published induction already uses this default or country. Pause it before publishing this version.',409);
    }
  }
  if(b.status==='published'&&delivery==='native'&&b.publishNative===true){
    const draft=await db().prepare('SELECT * FROM native_drafts WHERE course_id=?').bind(existing?.id).first<{revision:number;content:unknown}>();
    if(!draft||draft.revision!==b.contentRevision)throw new CourseError('Course content changed. Reload the builder before publishing.',409);
    // Resolve tenant-scoped storage before acquiring the publication transaction.
    await checkedContent(draft.content,existing!.id,true);
  }
  const id=existing?.id||crypto.randomUUID(); const date=now();
  const auditActor=actor.email;
  await inTransaction(async client=>{
  if(audience.units?.length){
    await client.query('SELECT id FROM organisation_hierarchy WHERE id=1 FOR UPDATE');
    const groups=await client.query('SELECT id FROM organisation_units WHERE id=ANY($1::text[])',[audience.units]);
    if(groups.rows.length!==audience.units.length)throw new CourseError('Choose an existing parent group.');
  }
  await client.query("SELECT set_config('app.audit_actor',$1,true)",[auditActor]);
  // Match assignment/lifecycle lock order before changing the shared course.
  if(b.status==='published')await client.query('SELECT id FROM learners ORDER BY id FOR UPDATE');
  if (existing) {
    const statement=db().prepare('UPDATE courses SET title=?,description=?,audience_json=?,status=?,english_title=?,category=?,language_code=?,catalogue_scope=?,available_countries_json=?,induction_role=?,estimated_duration_minutes=?,lesson_count=?,validity_months=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?')
      .bind(title,description,JSON.stringify(audience),b.status,englishTitle,category,languageCode,catalogueScope,JSON.stringify(linkedCountries),inductionRole,duration,lessonCount,validityMonths,date,id,b.revision);
    const result=await statement.execute(client);
    if (!result.rowCount) throw new CourseError('This course changed in another session. Reload it before saving.',409);
  } else await db().prepare('INSERT INTO courses(id,title,description,status,audience_json,created_at,updated_at,english_title,category,language_code,catalogue_scope,available_countries_json,induction_role,estimated_duration_minutes,lesson_count,validity_months) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,title,description,b.status,JSON.stringify(audience),date,date,englishTitle,category,languageCode,catalogueScope,JSON.stringify(linkedCountries),inductionRole,duration,lessonCount,validityMonths).execute(client);
  await client.query('UPDATE courses SET deadline_days=$2,quiz_json=$3,assessor_required=$4,cover_image=$5 WHERE id=$1',[id,deadlineDays,quiz===null?null:JSON.stringify(quiz),assessorRequired,coverImage]);
  await client.query('DELETE FROM course_refresher_rules WHERE source_course_id=$1',[id]);
  for(const rule of rules)await client.query('INSERT INTO course_refresher_rules(source_course_id,country,refresher_course_id) VALUES($1,$2,$3)',[id,rule.country,rule.courseId]);
  if(!existing){await client.query('UPDATE courses SET delivery_type=$2 WHERE id=$1',[id,delivery]);if(delivery==='native')await client.query('INSERT INTO native_drafts(course_id,updated_by) VALUES($1,$2)',[id,actor.email]);}
  if(b.status==='published'&&delivery==='native'){if(b.publishNative===true)await publishNative(client,id,b.contentRevision);else if(!existing?.package_id)throw new CourseError('Publish course content from the builder first.');}
  if(b.status==='published'){await publishCourseVersion(client,id,b.versionReason,b.retrain===true);await client.query('SELECT sync_credit_assignments()');}
  });
  return json({course:await getCourse(id)});
} catch(e) { return failed(creditError(e)); } }
