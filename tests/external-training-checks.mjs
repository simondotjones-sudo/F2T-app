import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function externalTrainingChecks({m,check,q,query,run,call,req,operator}){
 const today=new Date().toISOString().slice(0,10),org='primark_session=ext-org',learner='primark_session=ext-learner',other='primark_session=ext-other',site='primark_session=ext-site',assessor='primark_session=ext-assessor';
 for(const id of ['ext-org','ext-learner','ext-other','ext-site','ext-assessor']){
  await q("INSERT INTO public.learners(id,name,email,code_hash,store_id,country,entered_at,induction_enrolled) VALUES($1,$1,$1||'@test.invalid','unused',$2,'Ireland',now()::text,false)",[id,id==='ext-other'?'other-site':'ext-store']);
  await q("INSERT INTO public.sessions(token_hash,learner_id,expires_at) VALUES($1,$2,'2099-01-01')",[createHash('sha256').update(id).digest('hex'),id]);
 }
 await q("INSERT INTO public.organisation_stores(id,name,country,active,updated_by,updated_at) VALUES('ext-store','External Store','Ireland',true,'fixture',now()::text)");
 await q("INSERT INTO public.reporting_access(learner_id,scope,country,site_id,assigned_by,updated_at) VALUES('ext-org','organisation',NULL,NULL,'test',now()::text),('ext-site','site','Ireland','ext-store','test',now()::text)");
 const base={action:'create',title:'External safety qualification',provider:'Training provider',completedOn:today,expiresOn:'2098-01-01',reference:'EXT-123',hours:4,notes:'External evidence'};
 const post=(b,c=learner,admin=false,tenant='primark')=>call(m.external,'POST','/api/external-training?admin='+(admin?'1':'0'),b,tenant,c);
 const record=async id=>(await q('SELECT * FROM public.external_training WHERE id=$1',[id]))[0];
 const decide=async(id,action='approve',patch={},c=org)=>post({id,action,revision:(await record(id)).revision,reason:'Verified original qualification',...patch},c,true);
 const upload=async(id,c=learner,admin=false,content='%PDF-1.4\nExternal certificate\n%%EOF',tenant='primark')=>run(tenant,async()=>{const form=new FormData();form.append('file',new File([content],'external.pdf',{type:'application/pdf'}));const r=new Request('https://test.invalid/api/external-training/evidence?record='+id+'&admin='+(admin?'1':'0'),{method:'POST',headers:{Origin:'https://test.invalid'},body:form});r.nextUrl=new URL(r.url);r.cookies=req('/','GET',null,c).cookies;return m.externalUpload.POST(r);},c);
 const download=(id,c=learner,params='',tenant='primark')=>run(tenant,()=>m.externalFile.GET(req('/api/external-training/evidence/'+id+params,'GET',null,c),{params:Promise.resolve({id})}),c);
 let id,file,aid,practicalId;
 await check('External learner submissions are toggled, pending, scoped and cannot self-approve',async()=>{
  assert.equal((await post(base)).status,403);
  await q(`UPDATE public.organisation_settings SET features=jsonb_set(jsonb_set(features,'{external_submissions,enabled}','true'),'{training_recognition,enabled}','true'),credits_enabled=false`);
  const r=await post(base);assert.equal(r.status,200,await r.clone().text());id=(await r.json()).id;assert.equal((await record(id)).status,'pending');
  assert.equal((await post({...base,completedOn:'2025-02-30'})).status,400);
  assert.equal((await decide(id,'approve',{},learner)).status,403);
  const self=await post({...base,learnerId:'ext-org'},org,true);const selfId=(await self.json()).id;assert.equal((await decide(selfId)).status,403);
  const foreign=await post({...base,learnerId:'ext-other'},site,true);assert.equal(foreign.status,404);
  const list=await (await call(m.external,'GET','/api/external-training',null,'primark',other)).json();assert.equal(list.rows.length,0);
 });
 await check('External evidence checks signatures and size, protects downloads, tenant and learner boundaries',async()=>{
  assert.equal((await decide(id)).status,400);
  assert.equal((await upload(id,learner,false,'<script>bad</script>')).status,400);
  assert.equal((await upload(id,learner,false,new Uint8Array(3*1024*1024+1))).status,413);
  assert.equal((await upload(id,other)).status,404);
  const up=await upload(id);assert.equal(up.status,201,await up.clone().text());file=(await up.json()).id;
  const good=await download(file);assert.equal(good.status,200);assert.equal(good.headers.get('cache-control'),'private, no-store');assert.equal(good.headers.get('x-content-type-options'),'nosniff');assert((await good.text()).startsWith('%PDF-'));
  assert.equal((await download(file,other)).status,404);assert.equal((await download(file,org,'?admin=1')).status,200);
  for(const tenant of ['eazysafe-internal','third-client']){assert.equal((await download(file,operator,'?admin=1',tenant)).status,404);assert.equal((await post({id,action:'approve',revision:2,reason:'No cross tenant'},operator,true,tenant)).status,404);await assert.rejects(query(tenant,'SELECT * FROM public.external_training'),/permission denied/);}
 });
 await check('Record-only approval, edits, rejected history, CSV escaping and immutable decisions',async()=>{
  const edit=await post({...base,action:'edit',id,revision:(await record(id)).revision,title:'=dangerous CSV title'});assert.equal(edit.status,200,await edit.clone().text());
  assert.equal((await decide(id)).status,200);assert.equal((await record(id)).status,'approved');
  assert.equal((await q('SELECT * FROM public.training_recognitions WHERE external_record_id=$1',[id])).length,0);
  assert.equal((await post({...base,action:'edit',id,revision:(await record(id)).revision})).status,409);
  assert.equal((await upload(id)).status,409);
  const csv=await call(m.external,'GET','/api/external-training?admin=1&export=csv',null,'primark',org);assert.equal(csv.status,200);assert((await csv.text()).includes("'=dangerous"));
  const r=await post(base);const rejected=(await r.json()).id;assert.equal((await decide(rejected,'reject')).status,200);assert.equal((await decide(rejected)).status,409);
  const audit=await q("SELECT * FROM public.audit_events WHERE entity='external_training' AND record_id=$1",[id]).catch(()=>q("SELECT * FROM public.audit_events WHERE entity='external_training'"));assert(audit.length>=3);
 });
 async function course(cid,practical=false){await q("INSERT INTO public.courses(id,title,status,audience_json,created_at,updated_at,catalogue_scope,assessor_required,validity_months) VALUES($1,$1,'published','{}',now()::text,now()::text,'global',$2,1)",[cid,practical]);await q("INSERT INTO public.course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES($1,$2,'fixture.zip','ready','[{\"id\":\"sco\",\"title\":\"Lesson\",\"href\":\"index.html\",\"mastery\":\"\",\"launchData\":\"\"}]',1,10,now()::text)",[cid+'-pack',cid]);await q('UPDATE public.courses SET package_id=$2 WHERE id=$1',[cid,cid+'-pack']);await query('primark',"SELECT assign_credit_course('ext-learner',?,'fixture')",cid);return (await q('SELECT history_id FROM public.course_assignments WHERE learner_id=$1 AND course_id=$2',['ext-learner',cid]))[0].history_id;}
 await check('Approved equivalence uses existing recognition, advances pathways and does not invent LMS evidence or charges',async()=>{
  aid=await course('ext-course');const next=await course('ext-next');
  await q("UPDATE public.organisation_settings SET pathways_enabled=true");
  await q(`INSERT INTO public.learning_pathways(id,name,items,updated_by) VALUES('ext-path','External pathway','[{"courseId":"ext-course","stage":1},{"courseId":"ext-next","stage":2}]','fixture')`);
  await q("INSERT INTO public.pathway_enrolments(id,pathway_id,learner_id,pathway_revision,name,description,learner_name,award_certificate,assigned_by) VALUES('ext-enrol','ext-path','ext-learner',1,'External pathway','','External learner',true,'fixture')");
  await q("INSERT INTO public.pathway_enrolment_courses(enrolment_id,course_id,assignment_id,title,stage,position) VALUES('ext-enrol','ext-course',$1,'External course',1,1),('ext-enrol','ext-next',$2,'Next',2,2)",[aid,next]);
  assert.equal((await query('primark',"SELECT pathway_course_unlocked('ext-learner','ext-next') v"))[0].v,false);
  const before=(await q('SELECT count(*)::int n FROM public.credit_ledger'))[0].n;
  const result=await decide(id,'recognise',{assignmentId:aid,validUntil:'2098-01-01'});assert.equal(result.status,200,await result.clone().text());
  assert.equal((await query('primark',"SELECT pathway_course_unlocked('ext-learner','ext-next') v"))[0].v,true);
  assert.equal((await query('primark','SELECT assignment_satisfied(?) v',aid))[0].v,true);
  assert.equal((await query('primark',"SELECT assign_credit_course('ext-learner','ext-course','fixture',now(),true,true,'self-renewal') v"))[0].v,false);
  const recognition=(await q('SELECT id FROM public.training_recognitions WHERE external_record_id=$1',[id]))[0].id;
  assert.equal((await query('primark',"SELECT recognition_valid(?,'2099-01-01') v",recognition))[0].v,false);
  assert.equal((await q('SELECT completed_at,theory_completed_at FROM public.assignment_history WHERE id=$1',[aid]))[0].completed_at,null);
  assert.equal((await q("SELECT * FROM public.certificates WHERE learner_id='ext-learner'")).length,0);
  assert.equal((await q("SELECT * FROM public.scorm_progress WHERE learner_id='ext-learner'")).length,0);
  assert.equal((await q('SELECT count(*)::int n FROM public.credit_ledger'))[0].n,before);
  const report=await run('primark',()=>m.externalReport.trainingReport(null));assert.equal(report.records.find(r=>r.learnerId==='ext-learner'&&r.courseId==='ext-course').status,'recognised');
  const newRecord=await post({...base,expiresOn:null});const secondId=(await newRecord.json()).id;await upload(secondId);assert.equal((await decide(secondId,'approve',{assignmentId:next,validUntil:null})).status,200);
  const e=(await q("SELECT * FROM public.pathway_enrolments WHERE id='ext-enrol'"))[0];assert(e.completed_at);assert(e.certificate_token);assert((await q("SELECT achievement_basis FROM public.pathway_enrolment_courses WHERE enrolment_id='ext-enrol'")).every(r=>r.achievement_basis.outcome==='recognised'));
 });
 await check('Revocation immediately restores requirements while retaining external evidence and historic pathway awards',async()=>{
  assert.equal((await decide(id,'revoke')).status,200);assert.equal((await record(id)).status,'revoked');assert.equal((await query('primark','SELECT assignment_satisfied(?) v',aid))[0].v,false);
  assert.equal((await query('primark',"SELECT pathway_course_unlocked('ext-learner','ext-next') v"))[0].v,true); // Already satisfied next course remains reviewable.
  assert((await q("SELECT certificate_token FROM public.pathway_enrolments WHERE id='ext-enrol'"))[0].certificate_token);
  assert.equal((await download(file)).status,200);
 });
 await check('RPL requires the existing practical assessor grant, evidence review and sign-off; revocation removes validity',async()=>{
  practicalId=await course('ext-practical',true);const r=await post(base);const rid=(await r.json()).id;const up=await upload(rid);const fid=(await up.json()).id;
  assert.equal((await decide(rid,'approve',{assignmentId:practicalId,validUntil:'2098-01-01'})).status,200);
  assert.equal((await query('primark','SELECT assignment_satisfied(?) v',practicalId))[0].v,false);
  await q("INSERT INTO public.assessor_accounts VALUES('ext-assessor',false)");await q("INSERT INTO public.assessor_grants(id,learner_id,course_id,site_id,qualification,assigned_by) VALUES('ext-grant','ext-assessor','ext-practical','ext-store','Qualified assessor','fixture')");
  const body={action:'assess',id:practicalId,date:today,outcome:'pass',declaration:true,notes:'Reviewed external theory and completed practical assessment',evidenceIds:[]};
  assert.equal((await call(m.externalAssessor,'POST','/api/assessor',body,'primark',org)).status,400);
  const queue=await call(m.externalAssessor,'GET','/api/assessor',null,'primark',assessor);assert.equal(queue.status,200);assert((await queue.json()).pending.some(r=>r.id===practicalId&&r.external_theory));
  assert.equal((await download(fid,assessor,'?assessor=1')).status,200);
  const passed=await call(m.externalAssessor,'POST','/api/assessor',body,'primark',assessor);assert.equal(passed.status,200,await passed.clone().text());
  assert.equal((await query('primark','SELECT assignment_satisfied(?) v',practicalId))[0].v,true);
  assert.equal((await q("SELECT * FROM public.certificates WHERE learner_id='ext-learner'")).length,0);
  const assessment=(await q('SELECT passed_assessment_id FROM public.assignment_history WHERE id=$1',[practicalId]))[0].passed_assessment_id;
  assert.equal((await call(m.externalAssessor,'POST','/api/assessor',{action:'revoke',id:assessment,reason:'Practical sign-off withdrawn'},'primark',operator)).status,200);
  assert.equal((await query('primark','SELECT assignment_satisfied(?) v',practicalId))[0].v,false);
 });
 await check('Past expiry is a retained state and expiry reminders reuse configured candidate deduplication',async()=>{
  const past=await post({...base,completedOn:'2020-01-01',expiresOn:'2020-12-31'});const rid=(await past.json()).id;await upload(rid);assert.equal((await decide(rid,'approve')).status,200);
  const list=await (await call(m.external,'GET','/api/external-training?state=expired',null,'primark',learner)).json();assert(list.rows.some(r=>r.id===rid&&r.display_status==='expired'));
  assert.equal((await decide(rid,'recognise',{assignmentId:aid,validUntil:'2098-01-01'})).status,400);
  await q("UPDATE public.email_settings SET active_since='2000-01-01',enabled_since='{}'");
  const rows=await query('primark',"SELECT * FROM learning_email_candidates_unfiltered('2021-01-01T01:00:00Z') WHERE event_key=?",'external:'+rid+':0');assert.equal(rows.length,1);assert.equal(rows[0].kind,'expired');
 });
 await check('Recognition preserves earlier LMS certificates, overrides expired compliance, suppresses refreshers and sends shorter-validity reminders',async()=>{
  const hid=await course('ext-historic');
  await q("UPDATE public.courses SET validity_months=1 WHERE id='ext-historic'");
  await q("INSERT INTO public.scorm_progress(learner_id,package_id,sco_id,status,completed_at,updated_at) VALUES('ext-learner','ext-historic-pack','sco','passed','2020-01-01T00:00:00Z','2020-01-01T00:00:00Z')");
  await query('primark',"SELECT issue_course_certificate('ext-learner','ext-historic-pack')");
  const cert=(await q('SELECT * FROM public.certificates WHERE assignment_id=$1',[hid]))[0];assert(cert);
  const r=await post(base);const rid=(await r.json()).id;await upload(rid);
  const approved=await decide(rid,'approve',{assignmentId:hid,validUntil:'2097-01-01'});assert.equal(approved.status,200,await approved.clone().text());
  const report=await run('primark',()=>m.externalReport.trainingReport(null));assert.equal(report.records.find(r=>r.learnerId==='ext-learner'&&r.courseId==='ext-historic').status,'recognised');
  assert.deepEqual((await q('SELECT * FROM public.certificates WHERE assignment_id=$1',[hid]))[0],cert);
  const before=(await q('SELECT count(*)::int n FROM public.credit_ledger'))[0].n;
  assert.equal((await query('primark','SELECT assign_course_refresher(?) v',cert.token))[0].v,'recognised');
  assert.equal((await q('SELECT count(*)::int n FROM public.credit_ledger'))[0].n,before);
  const recognition=(await q('SELECT id FROM public.training_recognitions WHERE external_record_id=$1',[rid]))[0].id;
  const notices=await query('primark',"SELECT * FROM learning_email_candidates_unfiltered('2097-01-02T01:00:00Z') WHERE event_key=?",'recognition:'+recognition+':0');assert.equal(notices.length,1);
  assert.equal((await decide(rid,'revoke')).status,200);assert.deepEqual((await q('SELECT * FROM public.certificates WHERE assignment_id=$1',[hid]))[0],cert);
 });

}
