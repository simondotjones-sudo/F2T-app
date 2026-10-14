import assert from 'node:assert/strict';
export async function sharedCatalogueChecks({m,check,q,query,run,call,req,operator,primaryCookie}){
 const post=body=>call(m.catalogue,'POST','/api/admin/catalogue',body,'primark',operator);
 const sharp=(await import('sharp')).default;
 const cover='data:image/jpeg;base64,'+(await sharp({create:{width:30,height:20,channels:3,background:'#445566'}}).jpeg().toBuffer()).toString('base64');
 let release,courseId,oldPackage;
 await check('Shared catalogue rejects client admins, learners and cross-origin writes',async()=>{
  assert.equal((await call(m.catalogue,'GET','/api/admin/catalogue',null,'primark',primaryCookie)).status,403);
  const r=req('/api/admin/catalogue','POST',{action:'publish'},operator);r.headers.set('origin','https://bad.invalid');
  assert.equal((await run('primark',()=>m.catalogue.POST(r),operator)).status,403);
 });
 await check('Publishing freezes only course content; duplicate publication is idempotent',async()=>{
  await q(`INSERT INTO public.courses(id,title,description,status,audience_json,created_at,updated_at,catalogue_scope,validity_months,deadline_days) VALUES('catalogue-master','Master safety','Shared course','published','{"countries":[],"sites":[],"users":[]}',now()::text,now()::text,'global',12,30)`);
  await q(`INSERT INTO public.course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES('master-package','catalogue-master','master.zip','ready','[{"id":"sco","title":"Lesson","href":"index.html","mastery":"","launchData":""}]',1,11,now()::text)`);
  await q("INSERT INTO public.course_files(package_id,path,size,uploaded) VALUES('master-package','index.html',11,1)");
  await q("UPDATE public.courses SET package_id='master-package' WHERE id='catalogue-master'");
  await run('primark',()=>m.photoBucket().put('scorm/master-package/index.html',new TextEncoder().encode('MASTER FILE')));
  await q("UPDATE public.courses SET quiz_json=$1 WHERE id='catalogue-master'",[JSON.stringify({passPercent:80,questions:[{id:'shared-q',prompt:'Frozen shared question',options:['Yes','No'],correctIndex:0}],advanced:{mode:'random',count:1,bankIds:['source-bank'],categories:[],shuffleQuestions:true,shuffleAnswers:true,maxAttempts:2,retryMinutes:0,review:'never'}})]);
  await q("INSERT INTO public.feedback_surveys(id,name,mode,shared,updated_by) VALUES('shared-survey','Shared feedback','anonymous',true,'operator')");
  await q('INSERT INTO public.feedback_versions(survey_id,version,name,questions) VALUES($1,1,$2,$3)',['shared-survey','Shared feedback',JSON.stringify([{id:'rating',prompt:'Original feedback question',type:'rating',required:true,options:['Very poor','Poor','Fair','Good','Excellent']}])]);
  await q("INSERT INTO public.feedback_bindings(kind,target_id,survey_id) VALUES('course','catalogue-master','shared-survey')");
  await q("UPDATE public.courses SET cover_image=$1 WHERE id='catalogue-master'",[cover]);
  const body={action:'publish',sourceClientId:1,courseId:'catalogue-master',revision:1};
  const r=await post(body);assert.equal(r.status,200,await r.clone().text());release=await r.json();
  const repeat=await post(body);assert.equal((await repeat.json()).id,release.id);
  const saved=(await q('SELECT * FROM public.catalogue_releases WHERE id=$1',[release.id]))[0];
  assert.equal(saved.snapshot.audience_json,undefined);assert.equal(saved.snapshot.title,'Master safety');assert.equal(saved.snapshot.cover_image,cover);
  await assert.rejects(q('UPDATE public.catalogue_releases SET version=9 WHERE id=$1',[release.id]),/cannot be changed/);
 });
 await check('Client availability creates no assignments and retries create no duplicate courses',async()=>{
  const body={action:'distribute',sourceClientId:1,clientId:3,releaseId:release.id,version:0};
  const r=await post(body);assert.equal(r.status,200,await r.clone().text());courseId=(await r.json()).courseId;
  assert.equal((await query('third-client','SELECT * FROM course_assignments')).length,0);
  assert.equal((await post(body)).status,409);
  assert.equal((await post({...body,version:1})).status,200);
  assert.equal((await query('third-client','SELECT * FROM catalogue_subscriptions')).length,1);
  assert.equal((await query('third-client','SELECT cover_image FROM courses WHERE id=?',courseId))[0].cover_image,cover);
  const assessment=(await query('third-client','SELECT quiz_json FROM courses WHERE id=?',courseId))[0].quiz_json;assert.equal(assessment.questions[0].prompt,'Frozen shared question');assert.equal(assessment.advanced.count,1);assert.equal((await query('third-client','SELECT * FROM question_banks')).length,0);
  const survey=(await query('third-client','SELECT * FROM feedback_surveys'))[0];assert.equal(survey.shared,true);
  assert.equal((await query('third-client','SELECT questions FROM feedback_versions'))[0].questions[0].prompt,'Original feedback question');
  assert.equal((await query('third-client','SELECT * FROM feedback_responses')).length,0);
  oldPackage=(await query('third-client','SELECT package_id FROM courses WHERE id=?',courseId))[0].package_id;
  await query('third-client',`INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('cat-person','Learner','catalogue@test.invalid','unused','cat-store','Ireland',now()::text)`);
  await query('third-client','UPDATE organisation_settings SET credits_enabled=false');
  assert.equal((await query('third-client',"SELECT assign_credit_course('cat-person',?,'tester') AS added",courseId))[0].added,true);
 });
 await check('Version updates retain client settings, assignment snapshots and the original package',async()=>{
  await query('third-client','UPDATE courses SET deadline_days=7,validity_months=24,assessor_required=true WHERE id=?',courseId);
  await q(`INSERT INTO public.course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) SELECT 'master-package-v2',course_id,filename,status,scos_json,file_count,total_bytes,created_at FROM public.course_packages WHERE id='master-package'`);
  await q("INSERT INTO public.course_files(package_id,path,size,uploaded) VALUES('master-package-v2','index.html',11,1)");
  await q("UPDATE public.courses SET title='Master safety updated',package_id='master-package-v2',revision=2 WHERE id='catalogue-master'");
  const r=await post({action:'publish',sourceClientId:1,courseId:'catalogue-master',revision:2});assert.equal(r.status,200,await r.clone().text());release=await r.json();assert.equal(release.version,2);
  assert.equal((await post({action:'distribute',sourceClientId:1,clientId:3,releaseId:release.id,version:1})).status,200);
  const course=(await query('third-client','SELECT * FROM courses WHERE id=?',courseId))[0];assert.equal(course.title,'Master safety updated');assert.equal(course.deadline_days,7);assert.equal(course.validity_months,24);assert.equal(course.assessor_required,true);assert.notEqual(course.package_id,oldPackage);
  const history=(await query('third-client',"SELECT * FROM assignment_history WHERE learner_id='cat-person'"))[0];assert.equal(history.package_id,oldPackage);assert.equal(history.course_snapshot.title,'Master safety');assert.equal(history.assessor_required,false);
 });
 await check('Shared feedback stays local and cannot be read with another client session',async()=>{
  await query('third-client',"UPDATE assignment_history SET completed_at='2026-10-12' WHERE learner_id='cat-person'");
  assert.equal((await query('third-client','SELECT * FROM feedback_eligibility')).length,1);
  const response=await call(m.feedbackReports,'GET','/api/feedback/reports',null,'third-client',operator);assert.equal(response.status,200,await response.clone().text());
  const groups=(await response.json()).groups;assert.equal(groups.length,1);assert.equal(groups[0].suppressed,true);assert.equal(groups[0].eligible,1);
  assert.equal((await call(m.feedbackReports,'GET','/api/feedback/reports',null,'third-client',primaryCookie)).status,403);
  const source=await call(m.feedbackReports,'GET','/api/feedback/reports?target=course:'+courseId,null,'primark',operator);assert.equal(source.status,200);assert.equal((await source.json()).groups.length,0);
  const targets=await call(m.feedbackAdmin,'GET','/api/admin/feedback',null,'primark',operator);assert.equal(targets.status,200);assert(!(await targets.json()).targets.some(t=>t.id===courseId));
 });
 await check('Withdrawal blocks new manual and renewal assignments while retaining learner content access',async()=>{
  assert.equal((await post({action:'withdraw',clientId:3,courseId,version:2})).status,200);
  await query('third-client',`INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES('cat-new','New learner','cat-new@test.invalid','unused','cat-store','Ireland',now()::text)`);
  assert.equal((await query('third-client',"SELECT assign_credit_course('cat-new',?,'tester') AS added",courseId))[0].added,false);
  assert.equal((await query('third-client',"SELECT assign_credit_course('cat-person',?,'tester',now(),true) AS added",courseId))[0].added,false);
  await query('third-client',`INSERT INTO scorm_launches(token,course_id,package_id,learner_id,sco_id,seed_json,preview,expires_at) VALUES('catalogue-launch',?,?,'cat-person','sco','{}',0,'2099-01-01')`,courseId,oldPackage);
  const r=await run('third-client',()=>m.content.GET(req('/scorm-content/catalogue-launch/index.html'),{params:Promise.resolve({token:'catalogue-launch',path:['index.html']})}));assert.equal(r.status,200,await r.clone().text());assert((await r.text()).includes('MASTER FILE'));
  const other=await run('eazysafe-internal',()=>m.content.GET(req('/scorm-content/catalogue-launch/index.html'),{params:Promise.resolve({token:'catalogue-launch',path:['index.html']})}));assert.equal(other.status,401);
  assert.equal((await query('third-client',"SELECT * FROM assignment_history WHERE learner_id='cat-person'")).length,1);
  const restored=await post({action:'distribute',sourceClientId:1,clientId:3,releaseId:release.id,version:2});assert.equal(restored.status,200);
  assert.equal((await query('third-client',"SELECT assign_credit_course('cat-new',?,'tester') AS added",courseId))[0].added,true);
 });
}
