SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text; fn record;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
 PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
 EXECUTE $payload$CREATE TABLE external_training (
 id text PRIMARY KEY DEFAULT gen_random_uuid()::text, learner_id text NOT NULL REFERENCES learners(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 300), provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 300),
 completed_on date NOT NULL, expires_on date, reference text NOT NULL DEFAULT '', hours numeric CHECK(hours>=0 AND hours<=100000), notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','revoked')),
 submitted_by text NOT NULL, submitted_at timestamptz NOT NULL DEFAULT now(), reviewed_by text, reviewed_at timestamptz, decision_reason text,
 revision integer NOT NULL DEFAULT 1, CHECK(expires_on IS NULL OR expires_on>=completed_on)
);
CREATE INDEX ON external_training(learner_id,status,expires_on);
CREATE TABLE external_training_evidence (
 id text PRIMARY KEY, record_id text NOT NULL REFERENCES external_training(id), filename text NOT NULL,
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')), size integer NOT NULL CHECK(size BETWEEN 1 AND 3145728),
 sha256 text NOT NULL, storage_context text NOT NULL, uploaded_by text NOT NULL, uploaded_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'uploading' CHECK(state IN ('uploading','ready'))
);
ALTER TABLE training_recognitions ADD COLUMN external_record_id text REFERENCES external_training(id);
ALTER TABLE training_recognitions ALTER COLUMN valid_until DROP NOT NULL;
ALTER TABLE training_recognitions ADD CONSTRAINT recognition_no_expiry CHECK(valid_until IS NOT NULL OR (kind='recognised' AND external_record_id IS NOT NULL));
ALTER TABLE pathway_enrolment_courses ADD COLUMN achievement_basis jsonb;
CREATE FUNCTION external_theory_recognised(aid text,at_time timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE AS $body$
 SELECT EXISTS(SELECT 1 FROM training_recognitions r JOIN external_training e ON e.id=r.external_record_id
 WHERE r.assignment_id=aid AND r.kind='recognised' AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>at_time)
 AND e.status='approved' AND (e.expires_on IS NULL OR e.expires_on>=(at_time AT TIME ZONE 'UTC')::date));
$body$;
CREATE FUNCTION recognition_valid(rid text,at_time timestamptz DEFAULT now()) RETURNS boolean LANGUAGE sql STABLE AS $body$
 SELECT EXISTS(SELECT 1 FROM training_recognitions r JOIN assignment_history h ON h.id=r.assignment_id
 LEFT JOIN external_training e ON e.id=r.external_record_id
 WHERE r.id=rid AND r.revoked_at IS NULL AND (r.valid_until IS NULL OR r.valid_until>at_time)
 AND h.cancelled_at IS NULL AND h.superseded_at IS NULL
 AND (r.external_record_id IS NULL OR (e.status='approved' AND (e.expires_on IS NULL OR e.expires_on>=(at_time AT TIME ZONE 'UTC')::date)))
 AND (r.kind='extension' OR NOT h.assessor_required OR EXISTS(SELECT 1 FROM practical_assessments p WHERE p.id=h.passed_assessment_id AND p.outcome='pass' AND p.revoked_at IS NULL)));
$body$;
CREATE FUNCTION assignment_satisfied(aid text) RETURNS boolean LANGUAGE sql STABLE AS $body$
 SELECT EXISTS(SELECT 1 FROM assignment_history h WHERE h.id=aid AND h.cancelled_at IS NULL AND (
 (h.completed_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM certificates c WHERE c.assignment_id=h.id AND (c.cancelled_at IS NOT NULL OR c.expires_at::timestamptz<=now())))
 OR EXISTS(SELECT 1 FROM training_recognitions r WHERE r.assignment_id=h.id AND r.kind='recognised' AND recognition_valid(r.id))));
$body$;
CREATE OR REPLACE FUNCTION finish_learning_pathway(eid text) RETURNS void LANGUAGE plpgsql AS $body$
BEGIN
 UPDATE pathway_enrolment_courses i SET completed_at=COALESCE(i.completed_at,now()),achievement_basis=COALESCE(i.achievement_basis,
 (SELECT jsonb_build_object('outcome','recognised','recognition_id',r.id,'external_record_id',r.external_record_id,'valid_until',r.valid_until,'approved_by',r.approved_by,'practical_assessment_id',(SELECT passed_assessment_id FROM assignment_history WHERE id=i.assignment_id))
 FROM training_recognitions r WHERE r.assignment_id=i.assignment_id AND r.kind='recognised' AND recognition_valid(r.id) LIMIT 1))
 WHERE i.enrolment_id=eid AND assignment_satisfied(i.assignment_id);
 UPDATE pathway_enrolments e SET completed_at=GREATEST(e.assigned_at,(SELECT max(completed_at) FROM pathway_enrolment_courses WHERE enrolment_id=eid)),
 certificate_token=CASE WHEN e.award_certificate THEN COALESCE(e.certificate_token,gen_random_uuid()::text) END
 WHERE e.id=eid AND e.completed_at IS NULL AND EXISTS(SELECT 1 FROM pathway_enrolment_courses WHERE enrolment_id=eid)
 AND NOT EXISTS(SELECT 1 FROM pathway_enrolment_courses WHERE enrolment_id=eid AND NOT assignment_satisfied(assignment_id));
END $body$;
CREATE OR REPLACE FUNCTION pathway_course_unlocked(person_id text,cid text) RETURNS boolean LANGUAGE sql STABLE AS $body$
 SELECT NOT EXISTS(SELECT 1 FROM pathway_enrolments e JOIN pathway_enrolment_courses item ON item.enrolment_id=e.id
 WHERE e.learner_id=person_id AND item.course_id=cid AND NOT assignment_satisfied(item.assignment_id)
 AND EXISTS(SELECT 1 FROM pathway_enrolment_courses prior WHERE prior.enrolment_id=e.id AND prior.stage<item.stage AND NOT assignment_satisfied(prior.assignment_id)));
$body$;
CREATE FUNCTION refresh_recognition_pathways() RETURNS trigger LANGUAGE plpgsql AS $body$
DECLARE eid text; aid text;
BEGIN
 aid:=CASE WHEN TG_TABLE_NAME='training_recognitions' THEN to_jsonb(NEW)->>'assignment_id' ELSE NEW.id END;
 FOR eid IN SELECT enrolment_id FROM pathway_enrolment_courses WHERE assignment_id=aid LOOP PERFORM finish_learning_pathway(eid); END LOOP;
 RETURN NEW;
END $body$;
CREATE TRIGGER recognition_pathways AFTER INSERT OR UPDATE ON training_recognitions FOR EACH ROW EXECUTE FUNCTION refresh_recognition_pathways();
CREATE TRIGGER recognition_assessed AFTER UPDATE OF passed_assessment_id ON assignment_history FOR EACH ROW EXECUTE FUNCTION refresh_recognition_pathways();
CREATE FUNCTION protect_external_training() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'External training history cannot be deleted.'; END IF;
 IF OLD.status IN ('rejected','revoked') OR (OLD.status='approved' AND (NEW.status<>'revoked' OR (to_jsonb(NEW)-ARRAY['status','reviewed_by','reviewed_at','decision_reason','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','reviewed_by','reviewed_at','decision_reason','revision']))) THEN RAISE EXCEPTION 'Approved evidence is immutable; revoke and record a replacement.'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER external_training_guard BEFORE UPDATE OR DELETE ON external_training FOR EACH ROW EXECUTE FUNCTION protect_external_training();
CREATE TRIGGER external_training_audit AFTER INSERT OR UPDATE ON external_training FOR EACH ROW EXECUTE FUNCTION capture_lms_audit();
CREATE FUNCTION protect_external_evidence() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 IF TG_OP='DELETE' OR OLD.state<>'uploading' OR NEW.state<>'ready' OR (to_jsonb(NEW)-'state') IS DISTINCT FROM (to_jsonb(OLD)-'state') THEN RAISE EXCEPTION 'External evidence is immutable.'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER external_evidence_guard BEFORE UPDATE OR DELETE ON external_training_evidence FOR EACH ROW EXECUTE FUNCTION protect_external_evidence();
CREATE TRIGGER external_evidence_audit AFTER INSERT OR UPDATE ON external_training_evidence FOR EACH ROW EXECUTE FUNCTION capture_lms_audit();
UPDATE organisation_settings SET features=features||'{"external_training":{"policy":"optional","enabled":true},"external_submissions":{"policy":"optional","enabled":false}}'::jsonb,revision=revision+1;
CREATE OR REPLACE FUNCTION record_practical_assessment(aid text,actor_id text,result text,assessment_date date,accepted boolean,assessment_notes text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE h assignment_history%ROWTYPE; person learners%ROWTYPE; assessor learners%ROWTYPE; g assessor_grants%ROWTYPE; rid text:=gen_random_uuid()::text;
BEGIN
 SELECT * INTO h FROM assignment_history WHERE id=aid FOR UPDATE;
 IF NOT FOUND OR NOT h.assessor_required OR h.cancelled_at IS NOT NULL OR h.superseded_at IS NOT NULL OR h.passed_assessment_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM course_assignments WHERE history_id=aid) THEN RAISE EXCEPTION 'This assignment is not awaiting assessment.'; END IF;
 SELECT * INTO person FROM learners WHERE id=h.learner_id;
 SELECT * INTO assessor FROM learners WHERE id=actor_id AND archived_at IS NULL FOR UPDATE;
 IF assessor.id IS NULL OR person.archived_at IS NOT NULL OR actor_id=h.learner_id THEN RAISE EXCEPTION 'Assessment is not permitted.'; END IF;
 SELECT * INTO g FROM assessor_grants WHERE learner_id=actor_id AND course_id=h.course_id AND active AND (site_id='*' OR site_id=person.store_id)
 AND (expires_on IS NULL OR expires_on>=CURRENT_DATE) ORDER BY updated_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Your assessor authorisation is missing or expired.'; END IF;
 PERFORM issue_course_certificate(h.learner_id,h.package_id);
 SELECT * INTO h FROM assignment_history WHERE id=aid;
 IF h.theory_completed_at IS NULL AND NOT external_theory_recognised(aid) THEN RAISE EXCEPTION 'Online theory must be completed first.'; END IF;
 IF assessment_date IS NULL OR assessment_date>CURRENT_DATE OR assessment_date<COALESCE((h.theory_completed_at AT TIME ZONE 'UTC')::date,(SELECT e.completed_on FROM training_recognitions r JOIN external_training e ON e.id=r.external_record_id WHERE r.assignment_id=aid AND r.revoked_at IS NULL LIMIT 1)) OR (g.expires_on IS NOT NULL AND assessment_date>g.expires_on) THEN RAISE EXCEPTION 'Choose an assessment date between theory completion and today.'; END IF;
 IF result NOT IN ('pass','not_yet_competent') OR (result='pass' AND NOT COALESCE(accepted,false)) OR (result='not_yet_competent' AND length(trim(assessment_notes))=0) THEN RAISE EXCEPTION 'An outcome, declaration for a pass, and reason for an unsuccessful assessment are required.'; END IF;
 INSERT INTO practical_assessments(id,assignment_id,assessor_id,assessor_name,grant_snapshot,outcome,assessed_at,declaration,notes)
 VALUES(rid,aid,actor_id,assessor.name,to_jsonb(g),result,assessment_date::timestamp AT TIME ZONE 'UTC',CASE WHEN result='pass' THEN 'I confirm that I carried out the practical assessment for this learner and assessed them as competent against the course practical assessment criteria.' ELSE '' END,assessment_notes);
 IF result='pass' THEN UPDATE assignment_history SET passed_assessment_id=rid WHERE id=aid; PERFORM issue_course_certificate(h.learner_id,h.package_id); END IF;
 RETURN rid;
END $$;
CREATE OR REPLACE FUNCTION assign_course_refresher(cert_token text,at_time timestamptz DEFAULT now()) RETURNS text LANGUAGE plpgsql AS $$
DECLARE cert certificates%ROWTYPE; person learners%ROWTYPE; target_id text; target_assignment text;
 target_cert certificates%ROWTYPE; event course_refresher_assignments%ROWTYPE;
 outcome_value text:='assigned'; added boolean; needs_renewal boolean:=false;
BEGIN
 IF NOT feature_enabled('refreshers') THEN RETURN 'not_due'; END IF;
 SELECT * INTO cert FROM certificates WHERE token=cert_token;
 IF NOT FOUND THEN RETURN 'not_due'; END IF;
 SELECT * INTO person FROM learners WHERE id=cert.learner_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM certificates c JOIN course_assignments a ON a.learner_id=c.learner_id AND a.course_id=c.course_id JOIN training_recognitions r ON r.assignment_id=a.history_id WHERE c.token=cert_token AND r.kind='recognised' AND recognition_valid(r.id,at_time)) THEN RETURN 'recognised'; END IF;
 IF NOT FOUND OR person.archived_at IS NOT NULL OR EXISTS(SELECT 1 FROM platform_admins WHERE learner_id=person.id)
  OR EXISTS(SELECT 1 FROM reporting_access WHERE learner_id=person.id) OR EXISTS(SELECT 1 FROM store_managers WHERE learner_id=person.id) THEN RETURN 'not_due'; END IF;
 -- Re-read after locking: a reset, removal, transfer or another worker may have won.
 SELECT * INTO cert FROM certificates WHERE token=cert_token AND archived_at IS NULL AND cancelled_at IS NULL;
 IF NOT FOUND OR cert.expires_at IS NULL OR cert.expires_at::timestamptz>at_time+interval '720 hours'
  OR NOT EXISTS(SELECT 1 FROM course_assignments WHERE history_id=cert.assignment_id) THEN RETURN 'not_due'; END IF;
 SELECT * INTO event FROM course_refresher_assignments WHERE certificate_token=cert_token;
 IF event.assignment_id IS NOT NULL THEN RETURN 'already_assigned'; END IF;
 SELECT refresher_course_id INTO target_id FROM course_refresher_rules WHERE source_course_id=cert.course_id AND country=person.country;
 IF target_id IS NULL THEN RETURN 'not_due'; END IF;
 IF EXISTS(SELECT 1 FROM assignment_exclusions WHERE learner_id=person.id AND course_id=target_id) THEN
  outcome_value:='excluded';
 ELSIF NOT EXISTS(SELECT 1 FROM courses c JOIN course_packages p ON p.id=c.package_id AND p.status='ready' WHERE c.id=target_id AND c.status='published') THEN
  outcome_value:='unavailable';
 ELSE
  SELECT history_id INTO target_assignment FROM course_assignments WHERE learner_id=person.id AND course_id=target_id;
  SELECT * INTO target_cert FROM certificates WHERE assignment_id=target_assignment AND archived_at IS NULL AND cancelled_at IS NULL ORDER BY completed_at DESC LIMIT 1;
  needs_renewal:=target_cert.expires_at IS NOT NULL AND target_cert.expires_at::timestamptz<=at_time+interval '720 hours';
  IF target_assignment IS NULL OR needs_renewal THEN
   -- A failed charge rolls back its entire assignment, while recording a retryable
   -- outcome outside this subtransaction. Successful learners still proceed.
   BEGIN
    added:=assign_credit_course(person.id,target_id,'automatic refresher',at_time,needs_renewal,true,'refresher');
    IF added THEN
     SELECT history_id INTO target_assignment FROM course_assignments WHERE learner_id=person.id AND course_id=target_id;
    ELSE outcome_value:='unavailable';target_assignment:=NULL;
    END IF;
   EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM='This store has no credits available. Contact a platform admin for a top-up.' THEN outcome_value:='no_credits';
    ELSIF SQLERRM='No credit price is configured for this date.' THEN outcome_value:='no_price';
    ELSE RAISE;
    END IF;
    target_assignment:=NULL;
   END;
  END IF;
 END IF;
 INSERT INTO course_refresher_assignments(certificate_token,country,refresher_course_id,assignment_id,outcome,attempted_at)
 VALUES(cert_token,person.country,target_id,target_assignment,outcome_value,at_time)
 ON CONFLICT(certificate_token) DO UPDATE SET country=EXCLUDED.country,refresher_course_id=EXCLUDED.refresher_course_id,
  assignment_id=EXCLUDED.assignment_id,outcome=EXCLUDED.outcome,attempted_at=EXCLUDED.attempted_at;
 IF target_assignment IS NOT NULL THEN
  UPDATE assignment_history SET progress_snapshot=(SELECT COALESCE(jsonb_agg(to_jsonb(s)),'[]') FROM scorm_progress s
   JOIN course_packages p ON p.id=s.package_id WHERE s.learner_id=person.id AND p.course_id=cert.course_id)
  WHERE id=cert.assignment_id;
 END IF;
 RETURN outcome_value;
END $$;
ALTER FUNCTION learning_email_candidates_unfiltered(timestamptz) RENAME TO learning_email_candidates_before_external;
CREATE FUNCTION learning_email_candidates_unfiltered(at_time timestamptz DEFAULT now())
RETURNS TABLE(event_key text,kind text,recipient_id text,invitation_id text,email text,payload jsonb,occurred_at timestamptz,ends_at timestamptz)
LANGUAGE sql STABLE AS $body$
 SELECT * FROM learning_email_candidates_before_external(at_time)
 UNION ALL
 SELECT 'external:'||e.id||':'||d.days,CASE WHEN d.days=0 THEN 'expired' ELSE 'expiry_reminder' END,e.learner_id,NULL,l.email,
 jsonb_build_object('name',l.name,'title',e.title||' (External training)','date',e.expires_on,'days',d.days,'path','/external-training'),
 e.expires_on::timestamp AT TIME ZONE 'UTC'+interval '1 day'-make_interval(days=>d.days),
 e.expires_on::timestamp AT TIME ZONE 'UTC'+interval '2 days'-make_interval(days=>d.days)
 FROM external_training e JOIN learners l ON l.id=e.learner_id CROSS JOIN email_settings s
 CROSS JOIN LATERAL(SELECT value::int days FROM jsonb_array_elements_text(s.expiry_days) UNION SELECT 0) d
 WHERE e.status='approved' AND e.expires_on IS NOT NULL AND l.archived_at IS NULL AND NULLIF(l.email,'') IS NOT NULL
 AND s.enabled ? (CASE WHEN d.days=0 THEN 'expired' ELSE 'expiry_reminder' END)
 AND e.expires_on::timestamp AT TIME ZONE 'UTC'+interval '1 day'-make_interval(days=>d.days)>=GREATEST(s.active_since,COALESCE((s.enabled_since->>(CASE WHEN d.days=0 THEN 'expired' ELSE 'expiry_reminder' END))::timestamptz,s.active_since))
 AND at_time>=e.expires_on::timestamp AT TIME ZONE 'UTC'+interval '1 day'-make_interval(days=>d.days)
 AND at_time<e.expires_on::timestamp AT TIME ZONE 'UTC'+interval '2 days'-make_interval(days=>d.days)
 UNION ALL
 SELECT 'recognition:'||r.id||':'||d.days,CASE WHEN d.days=0 THEN 'expired' ELSE 'expiry_reminder' END,r.learner_id,NULL,l.email,
 jsonb_build_object('name',l.name,'title',h.course_title||' (Recognised prior learning)','date',r.valid_until,'days',d.days,'path','/external-training'),
 r.valid_until-make_interval(days=>d.days),r.valid_until-make_interval(days=>d.days)+interval '1 day'
 FROM training_recognitions r JOIN assignment_history h ON h.id=r.assignment_id JOIN learners l ON l.id=r.learner_id
 LEFT JOIN external_training e ON e.id=r.external_record_id CROSS JOIN email_settings s
 CROSS JOIN LATERAL(SELECT value::int days FROM jsonb_array_elements_text(s.expiry_days) UNION SELECT 0) d
 WHERE r.kind='recognised' AND r.revoked_at IS NULL AND r.valid_until IS NOT NULL AND l.archived_at IS NULL AND NULLIF(l.email,'') IS NOT NULL
 AND h.cancelled_at IS NULL AND h.superseded_at IS NULL
 AND (e.id IS NULL OR (e.status='approved' AND (e.expires_on IS NULL OR r.valid_until<(e.expires_on+1)::timestamp AT TIME ZONE 'UTC')))
 AND (NOT h.assessor_required OR EXISTS(SELECT 1 FROM practical_assessments p WHERE p.id=h.passed_assessment_id AND p.revoked_at IS NULL AND p.outcome='pass'))
 AND s.enabled ? (CASE WHEN d.days=0 THEN 'expired' ELSE 'expiry_reminder' END)
 AND r.valid_until-make_interval(days=>d.days)>=GREATEST(s.active_since,COALESCE((s.enabled_since->>(CASE WHEN d.days=0 THEN 'expired' ELSE 'expiry_reminder' END))::timestamptz,s.active_since))
 AND at_time>=r.valid_until-make_interval(days=>d.days) AND at_time<r.valid_until-make_interval(days=>d.days)+interval '1 day'
;
$body$;
DO $rewrite$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef('assign_credit_course(text,text,text,timestamptz,boolean,boolean,text)'::regprocedure) INTO def;
 def:=replace(def,'SELECT * INTO person FROM learners WHERE id=person_id FOR UPDATE;',
 'SELECT * INTO person FROM learners WHERE id=person_id FOR UPDATE;
 IF renew AND EXISTS(SELECT 1 FROM course_assignments a JOIN training_recognitions r ON r.assignment_id=a.history_id WHERE a.learner_id=person_id AND a.course_id=cid AND r.kind=''recognised'' AND recognition_valid(r.id,at_time)) THEN RETURN false; END IF;');
 EXECUTE def;
 SELECT pg_get_functiondef('learning_email_candidates_before_external(timestamptz)'::regprocedure) INTO def;
 def:=replace(def,'r.revoked_at IS NULL AND (r.valid_until>at_time OR r.kind=''extension'')','(recognition_valid(r.id,at_time) OR (r.revoked_at IS NULL AND r.kind=''extension''))');
 def:=replace(def,'r.revoked_at IS NULL AND r.kind IN (''exempt'',''recognised'') AND r.valid_until>at_time','r.kind IN (''exempt'',''recognised'') AND recognition_valid(r.id,at_time)');
 EXECUTE def;
END $rewrite$;
DO $backfill$
DECLARE eid text;
BEGIN
 FOR eid IN SELECT DISTINCT i.enrolment_id FROM pathway_enrolment_courses i JOIN training_recognitions r ON r.assignment_id=i.assignment_id WHERE r.kind='recognised' AND recognition_valid(r.id) LOOP
  PERFORM finish_learning_pathway(eid);
 END LOOP;
END $backfill$;
$payload$;
 REVOKE ALL ON external_training,external_training_evidence FROM PUBLIC;
 IF target<>'lms_template' THEN
 SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON external_training,external_training_evidence TO %I',runtime_role);
 END IF;
 FOR fn IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target AND p.proname IN ('external_theory_recognised','recognition_valid','assignment_satisfied','refresh_recognition_pathways','protect_external_training','protect_external_evidence','learning_email_candidates_unfiltered','learning_email_candidates_before_external') LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn.signature);
 IF target<>'lms_template' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I',fn.signature,runtime_role); END IF;
 END LOOP;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('external_training'),('external_training_evidence');
