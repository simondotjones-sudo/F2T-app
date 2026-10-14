import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
export async function liveTrainingChecks({m,check,q,query,run,call,req,operator,primaryCookie}){
 const cookie='primark_session=live-admin-token',countryCookie='primark_session=live-country-token',learnerCookie='primark_session=live-person-token';
 for(const [id,name,country,token] of [['live-admin','Live admin','Ireland','live-admin-token'],['live-country','Country admin','Ireland','live-country-token'],['live-person','Live person','Ireland','live-person-token'],['live-other','Other country','France','live-other-token']]){
  await q("INSERT INTO public.learners(id,name,email,code_hash,store_id,country,entered_at) VALUES($1,$2,$1||'@test.invalid','unused',$3,$4,now()::text)",[id,name,country==='Ireland'?'live-site':'other-site',country]);
  await q("INSERT INTO public.sessions(token_hash,learner_id,expires_at) VALUES($1,$2,'2099-01-01')",[createHash('sha256').update(token).digest('hex'),id]);
 }
 await q("INSERT INTO public.reporting_access(learner_id,scope,country,assigned_by,updated_at) VALUES('live-admin','organisation',NULL,'test',now()::text),('live-country','country','Ireland','test',now()::text)");
 const post=(b,c=cookie,client='primark')=>call(m.live,'POST','/api/live-training',b,client,c);
 const good={action:'training',title:'Emergency webinar',description:'Live training test',trainer:'Qualified trainer',award_certificate:true,validity_months:12};
 const local=d=>new Date(Date.now()+d*86400000).toISOString().slice(0,16);
 let training,session,enrolment,certificate;
 await check('Live Training is platform-controlled, organisation-managed and tenant-isolated',async()=>{
  assert.equal((await post(good)).status,403);assert.equal((await post(good,countryCookie)).status,403);assert.equal((await post(good,primaryCookie)).status,403);
  await q(`UPDATE public.organisation_settings SET features=jsonb_set(features,'{live_training}','{"policy":"optional","enabled":true}')`);
  const r=await post(good);assert.equal(r.status,200,await r.clone().text());training=(await r.json()).id;
  assert.equal((await post(good,cookie,'eazysafe-internal')).status,403);
  const unsafe=req('/api/live-training','POST',good,cookie);unsafe.headers.set('origin','https://other.invalid');assert.equal((await run('primark',()=>m.live.POST(unsafe),cookie)).status,403);
  assert.equal((await query('eazysafe-internal','SELECT * FROM live_trainings')).length,0);
 });
 await check('Session dates reject DST gaps/ambiguity, invalid timezone and insecure webinar links',async()=>{
  assert.equal(m.liveTypes.liveInstant('2027-07-01T10:00','Europe/Dublin'),'2027-07-01T09:00:00.000Z');
  assert.throws(()=>m.liveTypes.liveInstant('2027-03-28T01:30','Europe/Dublin'));
  assert.throws(()=>m.liveTypes.liveInstant('2027-10-31T01:30','Europe/Dublin'));
  assert.throws(()=>m.liveTypes.liveInstant('2027-02-30T10:00','UTC'));
  const b={action:'session',training_id:training,starts_at:local(3),ends_at:local(3.05),time_zone:'UTC',format:'webinar',location:'https://meet.google.com/test-session'};
  for(const patch of [{time_zone:'Fake/Zone'},{location:'javascript:alert(1)'},{location:'https://user:password@example.com'},{ends_at:local(2)}])assert.equal((await post({...b,...patch})).status,400);
  const r=await post(b);assert.equal(r.status,200,await r.clone().text());session=(await r.json()).id;
 });
 await check('Explicit, department and role assignment excludes admins, is idempotent and uses no credits',async()=>{
  const before=(await q('SELECT count(*)::int AS n FROM public.credit_ledger'))[0].n;
  await q("INSERT INTO public.organisation_departments(id,name) VALUES('live-dept','Live department')");
  await q("UPDATE public.learners SET department_id='live-dept' WHERE id IN ('live-person','live-other','live-admin')");
  await q("UPDATE public.learners SET job_role_id=(SELECT id FROM public.job_roles WHERE name='Staff') WHERE id='live-person'");
  const r=await post({action:'assign',session_id:session,scope:'departments',ids:['live-dept']});assert.equal(r.status,200,await r.clone().text());assert.equal((await r.json()).assigned,2);
  const repeat=await post({action:'assign',session_id:session,scope:'users',ids:['live-person','live-other']});assert.equal((await repeat.json()).assigned,0);
  assert.equal((await post({action:'assign',session_id:session,scope:'users',ids:['live-admin']})).status,400);
  const role=(await q("SELECT job_role_id FROM public.learners WHERE id='live-person'"))[0].job_role_id;
  assert.equal((await (await post({action:'assign',session_id:session,scope:'roles',ids:[role]})).json()).assigned,0);
  const adminView=await call(m.live,'GET','/api/live-training?learnerSearch=Live',null,'primark',cookie);assert.equal(adminView.status,200,await adminView.clone().text());assert((await adminView.json()).manage);
  assert.equal((await q('SELECT count(*)::int AS n FROM public.credit_ledger'))[0].n,before);
  enrolment=(await q("SELECT * FROM public.live_enrolments WHERE learner_id='live-person' AND session_id=$1",[session]))[0];
 });
 await check('Learner cards, calendar ownership and joining never record completion',async()=>{
  const mine=await call(m.live,'GET','/api/live-training?view=mine',null,'primark',learnerCookie);assert.equal(mine.status,200);const row=(await mine.json()).rows.find(r=>r.id===enrolment.id);assert.equal(row.attendance,'assigned');assert.equal(row.location,'');assert.equal(row.can_join,false);
  const calendar=await call(m.liveCalendar,'GET','/api/live-training/calendar?id='+enrolment.id,null,'primark',learnerCookie);assert.equal(calendar.status,200);const ics=await calendar.text();assert(ics.includes('BEGIN:VEVENT'));assert(ics.includes('client=primark'));assert(!ics.includes('meet.google.com'));
  assert.equal((await call(m.liveCalendar,'GET','/api/live-training/calendar?id='+enrolment.id,null,'primark',primaryCookie)).status,404);
  assert.equal((await call(m.liveJoin,'GET','/api/live-training/join?id='+enrolment.id,null,'primark',learnerCookie)).status,409);
  await q("UPDATE public.live_sessions SET starts_at=now()-interval '10 minutes',ends_at=now()+interval '50 minutes' WHERE id=$1",[session]);
  const joined=await call(m.liveJoin,'GET','/api/live-training/join?id='+enrolment.id,null,'primark',learnerCookie);assert.equal(joined.status,302);assert.equal(joined.headers.get('location'),'https://meet.google.com/test-session');
  assert.equal((await q('SELECT attendance FROM public.live_enrolments WHERE id=$1',[enrolment.id]))[0].attendance,'assigned');
  assert.equal((await post({action:'attendance',session_id:session,attendance:'attended',rows:[{id:enrolment.id,revision:1}],reason:''})).status,400);
 });
 await check('Attendance issues snapshot certificates; corrections revoke rather than overwrite evidence',async()=>{
  await q("UPDATE public.live_sessions SET starts_at=now()-interval '2 hours',ends_at=now()-interval '1 hour' WHERE id=$1",[session]);
  const body={action:'attendance',session_id:session,attendance:'attended',rows:[{id:enrolment.id,revision:1}],reason:''};
  assert.equal((await post(body)).status,200);certificate=(await q('SELECT * FROM public.live_certificates WHERE enrolment_id=$1',[enrolment.id]))[0];assert(certificate.expires_at);assert.equal(certificate.snapshot.title,good.title);assert.equal(certificate.snapshot.duration_minutes,60);
  await assert.rejects(q("UPDATE public.live_certificates SET snapshot='{}' WHERE token=$1",[certificate.token]),/immutable/);
  await assert.rejects(q("UPDATE public.live_enrolments SET snapshot='{}' WHERE id=$1",[enrolment.id]),/immutable/);
  assert.equal((await post(body)).status,409);
  assert.equal((await post({...body,attendance:'absent',rows:[{id:enrolment.id,revision:2}]})).status,400);
  assert.equal((await post({...body,attendance:'absent',rows:[{id:enrolment.id,revision:2}],reason:'Incorrect attendance selected'})).status,200);
  const revoked=(await q('SELECT * FROM public.live_certificates WHERE token=$1',[certificate.token]))[0];assert(revoked.revoked_at);assert.deepEqual(revoked.snapshot,certificate.snapshot);
  assert.equal((await post({...body,rows:[{id:enrolment.id,revision:3}],reason:'Attendance register confirmed'})).status,200);
  assert.equal((await q('SELECT * FROM public.live_certificates WHERE enrolment_id=$1',[enrolment.id])).length,2);
  assert((await q("SELECT * FROM public.audit_events WHERE entity='live_training' AND action='attendance_recorded' AND entity_id=$1",[enrolment.id])).length===3);
 });
 await check('Reports enforce country scope and attendance batches roll back on stale rows',async()=>{
  const report=await call(m.live,'GET','/api/live-training',null,'primark',countryCookie);assert.equal(report.status,200,await report.clone().text());const d=await report.json();assert.equal(d.manage,false);assert(d.rows.every(r=>r.country==='Ireland'));assert(d.rows.some(r=>r.id===enrolment.id));
  const other=(await q("SELECT * FROM public.live_enrolments WHERE session_id=$1 AND learner_id='live-other'",[session]))[0];
  const before=(await q('SELECT attendance,revision FROM public.live_enrolments WHERE id=$1',[other.id]))[0];
  const bad=await post({action:'attendance',session_id:session,attendance:'absent',reason:'Testing atomic correction',rows:[{id:other.id,revision:other.revision},{id:enrolment.id,revision:1}]});assert.equal(bad.status,409);
  assert.deepEqual((await q('SELECT attendance,revision FROM public.live_enrolments WHERE id=$1',[other.id]))[0],before);
  await q(`UPDATE public.organisation_settings SET features=jsonb_set(features,'{live_training}','{"policy":"disabled","enabled":false}')`);
  assert.equal((await post(good)).status,403);
  const still=await post({action:'attendance',session_id:session,attendance:'absent',reason:'Attendance retained when feature disabled',rows:[{id:other.id,revision:other.revision}]});assert.equal(still.status,200);
  await q(`UPDATE public.organisation_settings SET features=jsonb_set(features,'{live_training}','{"policy":"optional","enabled":true}')`);
 });
 await check('Reminders honour email mode, feature settings, schedule changes and cancellations',async()=>{
  const r=await post({action:'session',training_id:training,starts_at:local(.5),ends_at:local(.55),time_zone:'UTC',format:'classroom',location:'Training room'});assert.equal(r.status,200);const id=(await r.json()).id;
  await post({action:'assign',session_id:id,scope:'users',ids:['live-person']});
  assert.equal((await query('primark',"SELECT * FROM learning_email_candidates() WHERE kind LIKE 'live_%'")).length,0);
  await q("UPDATE public.email_settings SET mode='preview',active_since=now()-interval '1 day',enabled_since='{}'");
  let candidates=await query('primark',"SELECT * FROM learning_email_candidates() WHERE kind LIKE 'live_%'");assert(candidates.some(c=>c.kind==='live_reminder'));assert(candidates.some(c=>c.kind==='live_assigned'));
  const cancel=await post({action:'cancel_session',session_id:id,revision:1,reason:'Trainer unavailable'});assert.equal(cancel.status,200);
  candidates=await query('primark',"SELECT * FROM learning_email_candidates() WHERE kind LIKE 'live_%'");assert(candidates.some(c=>c.kind==='live_cancelled'));assert(!candidates.some(c=>c.kind==='live_reminder'));
  const cancelled=(await q('SELECT id FROM public.live_enrolments WHERE session_id=$1',[id]))[0];assert.equal((await call(m.liveCalendar,'GET','/api/live-training/calendar?id='+cancelled.id,null,'primark',learnerCookie)).status,409);
  const another=await post({action:'session',training_id:training,starts_at:local(2),ends_at:local(2.05),time_zone:'UTC',format:'webinar',location:'https://example.com/webinar'});const anotherId=(await another.json()).id;
  await post({action:'assign',session_id:anotherId,scope:'users',ids:['live-person']});
  const assigned=(await q('SELECT id FROM public.live_enrolments WHERE session_id=$1',[anotherId]))[0];
  assert.equal((await post({action:'attendance',session_id:anotherId,attendance:'cancelled',reason:'Temporary cancellation',rows:[{id:assigned.id,revision:1}]})).status,200);
  assert.equal((await post({action:'attendance',session_id:anotherId,attendance:'assigned',reason:'Reinstated before training',rows:[{id:assigned.id,revision:2}]})).status,200);
  assert.equal((await q('SELECT attendance FROM public.live_enrolments WHERE id=$1',[assigned.id]))[0].attendance,'assigned');
  await q("UPDATE public.email_settings SET mode='off'");
 });
 await check('Attendance evidence requires organisation access and remains tenant-bound',async()=>{
  const form=new FormData();form.set('session',session);form.set('file',new File(['%PDF-1.4\nattendance'],'register.pdf',{type:'application/pdf'}));
  const request=new Request('https://test.invalid/api/live-training/evidence',{method:'POST',headers:{origin:'https://test.invalid'},body:form});
  request.nextUrl=new URL(request.url);
  const r=await run('primark',()=>m.liveEvidence.POST(request),cookie);assert.equal(r.status,200,await r.clone().text());const id=(await r.json()).id;
  const read=c=>run('primark',()=>m.liveEvidenceFile.GET(req('/api/live-training/evidence/'+id),{params:Promise.resolve({id})}),c);
  assert.equal((await read(cookie)).status,200);assert.equal((await read(countryCookie)).status,403);assert.equal((await read(learnerCookie)).status,403);
  assert.equal((await run('eazysafe-internal',()=>m.liveEvidenceFile.GET(req('/api/live-training/evidence/'+id),{params:Promise.resolve({id})}),operator)).status,404);
 });
}
