import {mediaIds,type NativeContent} from './native-content';
import {evidenceStore,evidenceContext} from './assessment-evidence';
import {backfillFeedback} from './feedback';
import {isDeepStrictEqual} from 'node:util';
import {getPlatformOperator} from './admin-auth';
import {controlQuery} from './control-database';
import {db,inTransaction} from './database';
import {withTenant} from './tenant-context';
import type {Tenant} from './tenant-types';
import {CourseError} from './course-admin';
import {publishCourseVersion} from './course-versions';

type Row=Record<string,any>;
const fields=['delivery_type','cover_image','title','description','english_title','category','language_code','quiz_json','estimated_duration_minutes','lesson_count','validity_months','deadline_days','assessor_required'] as const;
export async function catalogueOperator(){const actor=await getPlatformOperator();if(!actor)throw new CourseError('Platform administrator access is required.',403);return actor;}
export async function catalogueClients(){await catalogueOperator();return (await controlQuery<Tenant>('SELECT * FROM public.lms_clients WHERE active ORDER BY id')).rows.map(t=>({...t,id:Number(t.id)}));}
export async function catalogueOverview(){
 const clients=await catalogueClients();const courses:Row[]=[],subscriptions:Row[]=[];
 for(const tenant of clients)await withTenant(tenant,async()=>{
  const masters=await db().prepare(`SELECT c.id,c.title,c.status,c.package_id,c.revision,
   COALESCE((SELECT max(version) FROM catalogue_releases WHERE course_id=c.id),0) AS version,
   (SELECT id FROM catalogue_releases WHERE course_id=c.id ORDER BY version DESC LIMIT 1) AS release_id
   FROM courses c WHERE NOT EXISTS(SELECT 1 FROM catalogue_subscriptions s WHERE s.course_id=c.id) ORDER BY c.title`).all<Row>();
  courses.push(...masters.results.map(c=>({...c,sourceClientId:tenant.id,sourceClientName:tenant.name,sourceSlug:tenant.slug})));
  const grants=await db().prepare('SELECT * FROM catalogue_subscriptions').all<Row>();
  subscriptions.push(...grants.results.map(s=>({...s,clientId:tenant.id})));
 });
 return {clients:clients.map(c=>({id:c.id,name:c.name,slug:c.slug})),courses,subscriptions};
}
export async function publishCatalogueRelease(tenant:Tenant,courseId:string,revision:number,actor:string){
 return withTenant(tenant,()=>inTransaction(async tx=>{
  const c=(await tx.query('SELECT * FROM courses WHERE id=$1 FOR UPDATE',[courseId])).rows[0] as Row;
  if(!c||c.status!=='published'||c.revision!==revision)throw new CourseError('Publish the course and refresh before creating a catalogue version.',409);
  if((await tx.query('SELECT 1 FROM catalogue_subscriptions WHERE course_id=$1',[courseId])).rows.length)throw new CourseError('Use the original master course.',409);
  const pack=(await tx.query("SELECT * FROM course_packages WHERE id=$1 AND status='ready'",[c.package_id])).rows[0];
  if(!pack)throw new CourseError('A ready SCORM package is required.');
  const files=(await tx.query('SELECT path,size,uploaded FROM course_files WHERE package_id=$1 ORDER BY path',[c.package_id])).rows;
  if(files.length!==Number(pack.file_count)||files.some(f=>f.uploaded!==1))throw new CourseError('The course package is incomplete.');
  const feedback=(await tx.query(`SELECT s.name,s.mode,v.questions FROM feedback_bindings b JOIN feedback_surveys s ON s.id=b.survey_id JOIN feedback_versions v ON v.survey_id=s.id AND v.version=s.revision WHERE b.kind='course' AND b.target_id=$1`,[courseId])).rows[0]||null;
  const nativeMedia=pack.native_json?(await tx.query('SELECT id,filename,mime_type,size,sha256,storage_context FROM native_media WHERE id=ANY($1::text[]) ORDER BY id',[mediaIds(pack.native_json as NativeContent)])).rows:[];
  const snapshot={...Object.fromEntries(fields.map(k=>[k,c[k]])),feedback,nativeMedia};
  const last=(await tx.query('SELECT * FROM catalogue_releases WHERE course_id=$1 ORDER BY version DESC LIMIT 1',[courseId])).rows[0];
  if(last&&isDeepStrictEqual(last.snapshot,snapshot)&&(last.package as Row).id===pack.id)return last;
  const id=crypto.randomUUID(),version=Number(last?.version||0)+1;
  await tx.query('INSERT INTO catalogue_releases(id,course_id,version,snapshot,package,files,published_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,courseId,version,JSON.stringify(snapshot),JSON.stringify(pack),JSON.stringify(files),actor]);
  await tx.query("INSERT INTO audit_events(actor,entity,entity_id,action,next_state) VALUES($1,'catalogue_release',$2,'published',$3)",[actor,id,JSON.stringify({courseId,version})]);
  return {id,version};
 }));
}
export async function distributeCatalogueRelease(source:Tenant,target:Tenant,releaseId:string,actor:string,expectedVersion:number){
 if(source.id===target.id)throw new CourseError('Choose a different client.');
 // Resolve source evidence before starting the destination transaction.
 const release=await withTenant(source,()=>db().prepare('SELECT * FROM catalogue_releases WHERE id=?').bind(releaseId).first<Row>());
 if(!release)throw new CourseError('Catalogue version not found.',404);
 // Copy only the explicitly released, immutable media into the recipient namespace.
 for(const m of release.snapshot.nativeMedia||[]){
  const bytes=await withTenant(source,async()=>(await evidenceStore(m.storage_context)).get(`native/${m.id}`,{type:'arrayBuffer'}));
  if(!bytes)throw new CourseError('A course file is unavailable.');
  await withTenant(target,async()=>(await evidenceStore(evidenceContext(),true)).set(`native/${m.id}`,bytes,{onlyIfNew:true}));
 }
 return withTenant(target,()=>inTransaction(async tx=>{
  await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor]);
  await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`catalogue:${source.id}:${release.course_id}`]);
  const link=(await tx.query('SELECT * FROM catalogue_subscriptions WHERE source_client_id=$1 AND source_course_id=$2 FOR UPDATE',[source.id,release.course_id])).rows[0];
  if(Number(link?.version||0)!==expectedVersion)throw new CourseError('Client availability changed. Refresh and try again.',409);
  if(link&&Number(link.version)>release.version)throw new CourseError('A newer version is already available to this client.',409);
  if(link&&Number(link.version)===release.version){await tx.query('UPDATE catalogue_subscriptions SET active=true,updated_at=now() WHERE course_id=$1',[link.course_id]);return {courseId:link.course_id};}
  const courseId=String(link?.course_id||crypto.randomUUID()),packageId=crypto.randomUUID(),stamp=new Date().toISOString();
  const s=release.snapshot,p=release.package;
  if(!link)await tx.query(`INSERT INTO courses(id,title,description,status,audience_json,created_at,updated_at,english_title,category,language_code,catalogue_scope,available_countries_json,induction_role,validity_months,deadline_days,assessor_required)
   VALUES($1,$2,$3,'published','{"countries":[],"sites":[],"users":[]}',$4,$4,$5,$6,$7,'global','[]','none',$8,$9,$10)`,[courseId,s.title,s.description,stamp,s.english_title,s.category,s.language_code,s.validity_months,s.deadline_days,s.assessor_required]);
  await tx.query("INSERT INTO course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES($1,$2,$3,'ready',$4,$5,$6,$7)",[packageId,courseId,p.filename,p.scos_json,p.file_count,p.total_bytes,stamp]);
  if(p.native_json)await tx.query('UPDATE course_packages SET native_json=$2 WHERE id=$1',[packageId,JSON.stringify(p.native_json)]);
  for(const m of s.nativeMedia||[])await tx.query('INSERT INTO native_media(id,course_id,filename,mime_type,size,sha256,storage_context,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING',[m.id,courseId,m.filename,m.mime_type,m.size,m.sha256,evidenceContext(),actor]);
  await tx.query('UPDATE courses SET delivery_type=$2 WHERE id=$1',[courseId,s.delivery_type||'scorm']);
  await tx.query(`INSERT INTO course_files(package_id,path,size,uploaded) SELECT $1,f.path,f.size,1 FROM jsonb_to_recordset($2::jsonb) AS f(path text,size integer)`,[packageId,JSON.stringify(release.files)]);
  await tx.query('INSERT INTO catalogue_package_sources(package_id,source_client_id,source_package_id,release_id) VALUES($1,$2,$3,$4)',[packageId,source.id,p.id,release.id]);
  // Content changes only. Client deadlines, expiry, assessor rules, audience and credits remain local.
  await tx.query(`UPDATE courses SET title=$2,description=$3,english_title=$4,category=$5,language_code=$6,quiz_json=$7,
   estimated_duration_minutes=$8,lesson_count=$9,package_id=$10,revision=revision+1,updated_at=$11 WHERE id=$1`,[courseId,s.title,s.description,s.english_title,s.category,s.language_code,s.quiz_json?JSON.stringify(s.quiz_json):null,s.estimated_duration_minutes,s.lesson_count,packageId,stamp]);
  await tx.query('UPDATE courses SET cover_image=$2 WHERE id=$1',[courseId,s.cover_image??null]);
  await tx.query(`INSERT INTO catalogue_subscriptions(course_id,source_client_id,source_course_id,release_id,version) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(course_id) DO UPDATE SET release_id=excluded.release_id,version=excluded.version,active=true,updated_at=now()`,[courseId,source.id,release.course_id,release.id,release.version]);
  // Portable, platform-managed survey snapshot. Answers stay in the recipient tenant.
  if(s.feedback){
   const surveyId=`catalogue-feedback-${courseId}`;
   const old=(await tx.query('SELECT * FROM feedback_surveys WHERE id=$1 FOR UPDATE',[surveyId])).rows[0];
   const previous=old?(await tx.query('SELECT questions FROM feedback_versions WHERE survey_id=$1 AND version=$2',[surveyId,old.revision])).rows[0]:null;
   if(old&&old.mode!==s.feedback.mode&&(await tx.query('SELECT 1 FROM feedback_responses WHERE survey_id=$1 LIMIT 1',[surveyId])).rows.length)throw new CourseError('Feedback response mode is locked.',409);
   if(!old||old.name!==s.feedback.name||old.mode!==s.feedback.mode||!isDeepStrictEqual(previous?.questions,s.feedback.questions)){
    const version=Number(old?.revision||0)+1;
    await tx.query(`INSERT INTO feedback_surveys(id,name,mode,shared,revision,updated_by) VALUES($1,$2,$3,true,$4,$5)
     ON CONFLICT(id) DO UPDATE SET name=excluded.name,mode=excluded.mode,revision=excluded.revision,updated_by=excluded.updated_by`,[surveyId,s.feedback.name,s.feedback.mode,version,actor]);
    await tx.query('INSERT INTO feedback_versions(survey_id,version,name,questions) VALUES($1,$2,$3,$4)',[surveyId,version,s.feedback.name,JSON.stringify(s.feedback.questions)]);
   }
   await tx.query(`INSERT INTO feedback_bindings(kind,target_id,survey_id) VALUES('course',$1,$2) ON CONFLICT(kind,target_id) DO UPDATE SET survey_id=excluded.survey_id`,[courseId,surveyId]);
   if((await tx.query("SELECT feature_enabled('course_feedback') AS enabled")).rows[0].enabled)await backfillFeedback(tx,'course',courseId);
  }else if(Object.hasOwn(s,'feedback'))await tx.query("DELETE FROM feedback_bindings WHERE kind='course' AND target_id=$1",[courseId]);
  await publishCourseVersion(tx,courseId,`EazySAFE catalogue version ${release.version}`,false);
  return {courseId};
 }));
}
export async function withdrawCatalogueCourse(target:Tenant,courseId:string,version:number,actor:string){return withTenant(target,()=>inTransaction(async tx=>{
 await tx.query("SELECT set_config('app.audit_actor',$1,true)",[actor]);
 const r=await tx.query('UPDATE catalogue_subscriptions SET active=false,updated_at=now() WHERE course_id=$1 AND version=$2 RETURNING course_id',[courseId,version]);
 if(!r.rows.length)throw new CourseError('Client availability changed. Refresh and try again.',409);
}));}
