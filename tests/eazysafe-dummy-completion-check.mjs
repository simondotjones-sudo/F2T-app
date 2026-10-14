import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const pg=new PGlite();
const migration='20261011160000_eazysafe-dummy-learner-completion';
const sql=readFileSync(`netlify/database/migrations/${migration}/migration.sql`,'utf8');
const q=async(sql,...args)=>(await pg.query(sql,args)).rows;
try {
 for(const name of readdirSync('netlify/database/migrations').sort().filter(n=>n!==migration))
  await pg.exec(readFileSync(`netlify/database/migrations/${name}/migration.sql`,'utf8'));
 await pg.exec(sql); // A fresh installation has no target and is left unchanged.
 await pg.exec(`
 INSERT INTO organisation_stores(id,name,country,active,updated_by,updated_at)
 VALUES('dummy-store','Test store','Ireland',true,'test','2026-10-11');
 SELECT ensure_store_credits('dummy-store','Test store','Ireland');
 INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at) VALUES
 ('other','Similar address','markpenney@eazysafe.com','unused','dummy-store','Ireland','2026-10-11');
 `);
 await pg.exec(sql); // The similar eazysafe.com address must not match easysafe.com.
 assert.equal((await q('SELECT * FROM scorm_progress')).length,0);
 await pg.exec(`
 INSERT INTO learners(id,name,email,code_hash,store_id,country,entered_at)
 VALUES('dummy','Mark test','MarkPenney@EasySAFE.com','unused','dummy-store','Ireland','2026-10-11');
 INSERT INTO courses(id,title,category,status,audience_json,created_at,updated_at,catalogue_scope,validity_months) VALUES
 ('dummy-course','Uploaded course','Safety','published','{}','2026-10-11','2026-10-11','global',12),
 ('unrelated-course','Other course','Safety','published','{}','2026-10-11','2026-10-11','global',NULL);
 INSERT INTO course_packages(id,course_id,filename,status,scos_json,file_count,total_bytes,created_at) VALUES
 ('dummy-package','dummy-course','course.zip','ready','[{"id":"one"},{"id":"two"}]',1,10,'2026-10-11'),
 ('unrelated-package','unrelated-course','other.zip','ready','[{"id":"one"}]',1,10,'2026-10-11');
 UPDATE courses SET package_id='dummy-package' WHERE id='dummy-course';
 UPDATE courses SET package_id='unrelated-package' WHERE id='unrelated-course';
 `);
 await assert.rejects(pg.exec(sql),/exactly one active published course/);
 await pg.exec(`
 SELECT assign_credit_course('dummy','dummy-course','test');
 SELECT assign_credit_course('dummy','unrelated-course','test');
 SELECT assign_credit_course('other','dummy-course','test');
 `);
 await assert.rejects(pg.exec(sql),/exactly one active published course/);
 assert.equal((await q('SELECT * FROM scorm_progress')).length,0);
 await q("UPDATE courses SET status='draft' WHERE id='unrelated-course'");
 await q("UPDATE learners SET archived_at='2026-10-11' WHERE id='dummy'");
 await assert.rejects(pg.exec(sql),/active learner/);
 await q("UPDATE learners SET archived_at=NULL WHERE id='dummy'");
 await q("INSERT INTO assessor_accounts(learner_id,assessor_only) VALUES('dummy',true)");
 await assert.rejects(pg.exec(sql),/active learner/);
 await q("DELETE FROM assessor_accounts WHERE learner_id='dummy'");
 await q("UPDATE course_packages SET status='staged' WHERE id='dummy-package'");
 await assert.rejects(pg.exec(sql),/original ready published package/);
 await q("UPDATE course_packages SET status='ready' WHERE id='dummy-package'");
 const [{history_id:assignmentId}]=await q("SELECT history_id FROM course_assignments WHERE learner_id='dummy' AND course_id='dummy-course'");
 await q('UPDATE assignment_history SET cancelled_at=now() WHERE id=$1',assignmentId);
 await assert.rejects(pg.exec(sql),/exactly one active published course/);
 await q('UPDATE assignment_history SET cancelled_at=NULL,quiz_json=$2 WHERE id=$1',assignmentId,'{}');
 await assert.rejects(pg.exec(sql),/platform quiz pass/);
 await q('UPDATE assignment_history SET quiz_json=NULL,assessor_required=true WHERE id=$1',assignmentId);
 await assert.rejects(pg.exec(sql),/assessor sign-off/);
 await q('UPDATE assignment_history SET assessor_required=false WHERE id=$1',assignmentId);
 await q("UPDATE course_packages SET scos_json='[{\"id\":\"one\"},{\"id\":\"one\"}]' WHERE id='dummy-package'");
 await assert.rejects(pg.exec(sql),/uniquely identified lessons/);
 await q("UPDATE course_packages SET scos_json='[{\"id\":\"one\"},{\"id\":\"two\"}]' WHERE id='dummy-package'");
 assert.equal((await q('SELECT * FROM scorm_progress')).length,0);
 assert.equal((await q('SELECT * FROM certificates')).length,0);
 await pg.exec(`
 INSERT INTO scorm_progress(learner_id,package_id,sco_id,status,score,total_centiseconds,completed_at,updated_at,data_json) VALUES
 ('dummy','dummy-package','one','passed','85',4000,'2026-10-11T12:00:00.000Z','2026-10-11T12:00:00.000Z','{"cmi.suspend_data":"keep-original-resume","cmi.comments":"Existing comment","cmi.core.score.raw":"85"}'),
 ('dummy','unrelated-package','one','incomplete',NULL,500,NULL,'2026-10-11','{}'),
 ('other','dummy-package','one','incomplete',NULL,600,NULL,'2026-10-11','{}');
 INSERT INTO scorm_launches(token,course_id,package_id,learner_id,sco_id,preview,seed_json,base_time,expires_at,assignment_id)
 SELECT 'dummy-launch','dummy-course','dummy-package','dummy','two',0,'{}',0,'2099-01-01',history_id
 FROM course_assignments WHERE learner_id='dummy' AND course_id='dummy-course';
 `);
 await q("UPDATE assignment_history SET started_at='2026-10-11T11:00:00Z' WHERE id=$1",assignmentId);
 const credits=await q('SELECT * FROM credit_ledger ORDER BY id');
 const balances=await q('SELECT * FROM store_credit_accounts ORDER BY store_id');
 const learners=await q('SELECT * FROM learners ORDER BY id');
 const courses=await q('SELECT * FROM courses ORDER BY id');
 const unrelated=await q("SELECT * FROM scorm_progress WHERE learner_id='other' OR package_id='unrelated-package' ORDER BY learner_id,package_id,sco_id");
 const otherAssignments=await q('SELECT * FROM assignment_history WHERE id<>$1 ORDER BY id',assignmentId);
 await pg.exec(sql);
 const progress=await q("SELECT * FROM scorm_progress WHERE learner_id='dummy' AND package_id='dummy-package' ORDER BY sco_id");
 assert.deepEqual(progress.map(r=>r.status),['passed','completed']);
 assert(progress.every(r=>r.completed_at&&r.active_launch===null));
 assert.equal(progress[0].score,'85');
 assert.equal(progress[0].total_centiseconds,4000);
 assert.equal(progress[0].completed_at,'2026-10-11T12:00:00.000Z');
 assert.equal(JSON.parse(progress[0].data_json)['cmi.suspend_data'],'keep-original-resume');
 assert.match(JSON.parse(progress[0].data_json)['cmi.comments'],/^Existing comment\nDummy learner certificate test/);
 assert.equal(progress[1].score,null);
 assert.equal(progress[1].total_centiseconds,0);
 const certificates=await q('SELECT * FROM certificates');
 assert.equal(certificates.length,1);
 const [cert]=certificates;
 assert.equal(cert.learner_id,'dummy');
 assert.equal(cert.course_id,'dummy-course');
 assert.equal(cert.assignment_id,assignmentId);
 assert.equal(cert.learning_version,1);
 assert.equal(cert.course_title,'Uploaded course');
 assert(cert.expires_at);
 assert.equal(cert.assessor_name,null);
 const history=await q('SELECT * FROM assignment_history WHERE id=$1',assignmentId);
 assert(history[0].theory_completed_at);
 assert(history[0].completed_at);
 assert.equal(history[0].started_at.toISOString(),'2026-10-11T11:00:00.000Z');
 assert.equal(history[0].completed_at.toISOString(),cert.completed_at);
 assert.equal((await q("SELECT * FROM scorm_launches WHERE learner_id='dummy'")).length,0);
 assert.deepEqual(await q('SELECT * FROM credit_ledger ORDER BY id'),credits);
 assert.deepEqual(await q('SELECT * FROM store_credit_accounts ORDER BY store_id'),balances);
 assert.deepEqual(await q('SELECT * FROM learners ORDER BY id'),learners);
 assert.deepEqual(await q('SELECT * FROM courses ORDER BY id'),courses);
 assert.deepEqual(await q("SELECT * FROM scorm_progress WHERE learner_id='other' OR package_id='unrelated-package' ORDER BY learner_id,package_id,sco_id"),unrelated);
 assert.deepEqual(await q('SELECT * FROM assignment_history WHERE id<>$1 ORDER BY id',assignmentId),otherAssignments);
 const audit=await q("SELECT * FROM audit_events WHERE actor='Codex migration at Simon''s request' ORDER BY id");
 assert(audit.length>=2);
 assert(audit.every(r=>r.learner_id==='dummy'&&r.reason.includes('not evidence of actual training')));
 assert(audit.some(r=>r.entity==='certificates'&&r.action==='insert'));
 await pg.exec(sql);
 assert.deepEqual(await q("SELECT * FROM scorm_progress WHERE learner_id='dummy' AND package_id='dummy-package' ORDER BY sco_id"),progress);
 assert.deepEqual(await q('SELECT * FROM certificates'),certificates);
 assert.deepEqual(await q('SELECT * FROM assignment_history WHERE id=$1',assignmentId),history);
 assert.deepEqual(await q("SELECT * FROM audit_events WHERE actor='Codex migration at Simon''s request' ORDER BY id"),audit);
 console.log('PASS EazySAFE dummy completion: exact email; unique active assignment; quiz/assessor guards; all lessons complete; one versioned certificate; existing progress, scores and time preserved; test audit reason; no unrelated changes; idempotent replay.');
} finally { await pg.close(); }
