-- Simon requested this dummy learner's course completion to test the certificate.
-- This is test data, not evidence of actual training. EazySAFE destination only.
-- Use the normal certificate/version/audit pipeline; do not invent marks or sign-off.
DO $$
DECLARE
 person_id text; course_id_value text; matches integer; target record;
 completed_time text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
 sample_note text := 'Dummy learner certificate test requested by Simon on 11 October 2026; not evidence of actual training.';
BEGIN
 SELECT count(*),min(id) INTO matches,person_id FROM learners
 WHERE lower(trim(email))='markpenney@easysafe.com';
 -- Empty installations and test databases do not have this dummy account.
 IF matches=0 THEN
  RAISE NOTICE 'EazySAFE dummy completion skipped: target learner absent.';
  RETURN;
 END IF;
 IF matches<>1 THEN RAISE EXCEPTION 'Expected exactly one EazySAFE dummy learner.'; END IF;
 -- SCORM saves and assignment changes acquire this same learner lock.
 PERFORM 1 FROM learners l WHERE l.id=person_id AND l.archived_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM platform_admins WHERE learner_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM reporting_access WHERE learner_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM store_managers WHERE learner_id=l.id)
  AND NOT EXISTS(SELECT 1 FROM assessor_accounts WHERE learner_id=l.id AND assessor_only)
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'The EazySAFE dummy account must be an active learner.'; END IF;

 SELECT count(*),min(c.id) INTO matches,course_id_value
 FROM course_assignments a JOIN courses c ON c.id=a.course_id
 JOIN assignment_history h ON h.id=a.history_id AND h.learner_id=a.learner_id AND h.course_id=a.course_id
 WHERE a.learner_id=person_id AND c.status='published' AND h.cancelled_at IS NULL AND h.superseded_at IS NULL;
 IF matches<>1 THEN RAISE EXCEPTION 'Expected exactly one active published course assigned to the EazySAFE dummy learner.'; END IF;
 SELECT a.history_id,h.package_id,p.scos_json,h.quiz_json,h.assessor_required,h.passed_assessment_id
 INTO target FROM course_assignments a JOIN courses c ON c.id=a.course_id
 JOIN assignment_history h ON h.id=a.history_id AND h.learner_id=a.learner_id AND h.course_id=a.course_id
 JOIN course_packages p ON p.id=h.package_id AND p.course_id=c.id
 WHERE a.learner_id=person_id AND c.id=course_id_value AND c.status='published' AND p.status='ready'
  AND h.cancelled_at IS NULL AND h.superseded_at IS NULL AND h.package_id=c.package_id
 FOR UPDATE OF a,h,c,p;
 IF NOT FOUND THEN RAISE EXCEPTION 'The dummy assignment must use its original ready published package.'; END IF;
 IF NOT pathway_course_unlocked(person_id,course_id_value)
 THEN RAISE EXCEPTION 'The dummy course must be unlocked in its learning pathway.'; END IF;
 IF target.quiz_json IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM course_quiz_attempts WHERE assignment_id=target.history_id AND passed)
 THEN RAISE EXCEPTION 'The dummy course requires a platform quiz pass before a certificate can be issued.'; END IF;
 IF target.assessor_required AND NOT EXISTS(
  SELECT 1 FROM practical_assessments WHERE id=target.passed_assessment_id AND assignment_id=target.history_id AND outcome='pass' AND revoked_at IS NULL)
 THEN RAISE EXCEPTION 'The dummy course requires assessor sign-off before a certificate can be issued.'; END IF;
 IF jsonb_typeof(target.scos_json::jsonb)<>'array' THEN RAISE EXCEPTION 'The dummy package lessons must be an array.'; END IF;
 IF jsonb_array_length(target.scos_json::jsonb)=0 OR EXISTS(
  SELECT 1 FROM jsonb_array_elements(target.scos_json::jsonb) sco
  GROUP BY sco->>'id' HAVING NULLIF(trim(sco->>'id'),'') IS NULL OR count(*)>1)
 THEN RAISE EXCEPTION 'The dummy package must contain uniquely identified lessons.'; END IF;

 PERFORM set_config('app.audit_actor','Codex migration at Simon''s request',true);
 PERFORM set_config('app.audit_reason',sample_note,true);
 -- Retain existing resume data, scores, learning time and completion timestamps.
 INSERT INTO scorm_progress(learner_id,package_id,sco_id,data_json,status,completed_at,updated_at)
 SELECT person_id,target.package_id,sco->>'id',jsonb_build_object('cmi.core.lesson_status','completed','cmi.comments',sample_note)::text,
  'completed',completed_time,completed_time FROM jsonb_array_elements(target.scos_json::jsonb) sco
 ON CONFLICT(learner_id,package_id,sco_id) DO UPDATE SET
  status=CASE WHEN scorm_progress.status='passed' THEN 'passed' ELSE 'completed' END,
  data_json=(scorm_progress.data_json::jsonb||jsonb_build_object(
   'cmi.core.lesson_status',CASE WHEN scorm_progress.status='passed' THEN 'passed' ELSE 'completed' END,
   'cmi.comments',CASE WHEN strpos(COALESCE(scorm_progress.data_json::jsonb->>'cmi.comments',''),sample_note)>0
    THEN scorm_progress.data_json::jsonb->>'cmi.comments'
    ELSE concat_ws(E'\n',NULLIF(scorm_progress.data_json::jsonb->>'cmi.comments',''),sample_note) END))::text,
  completed_at=COALESCE(scorm_progress.completed_at,EXCLUDED.completed_at),
  updated_at=CASE WHEN scorm_progress.status IN ('completed','passed') AND scorm_progress.completed_at IS NOT NULL THEN scorm_progress.updated_at ELSE EXCLUDED.updated_at END,
  active_launch=NULL;
 -- Prevent a previously opened lesson from overwriting the requested test state.
 DELETE FROM scorm_launches WHERE learner_id=person_id AND course_id=course_id_value;
 UPDATE assignment_history SET started_at=COALESCE(started_at,completed_time::timestamptz)
 WHERE id=target.history_id AND started_at IS NULL;
 PERFORM issue_course_certificate(person_id,target.package_id);
 IF NOT EXISTS(SELECT 1 FROM assignment_history WHERE id=target.history_id AND theory_completed_at IS NOT NULL AND completed_at IS NOT NULL)
  OR (SELECT count(*) FROM certificates WHERE assignment_id=target.history_id AND learner_id=person_id AND package_id=target.package_id AND archived_at IS NULL AND cancelled_at IS NULL)<>1
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(target.scos_json::jsonb) sco LEFT JOIN scorm_progress s
   ON s.learner_id=person_id AND s.package_id=target.package_id AND s.sco_id=sco->>'id'
   WHERE s.status IS NULL OR s.status NOT IN ('completed','passed') OR s.completed_at IS NULL)
 THEN RAISE EXCEPTION 'EazySAFE dummy completion/certificate verification failed; no changes committed.'; END IF;
 RAISE NOTICE 'EazySAFE dummy completion verified: one learner, one course assignment, all lessons complete, one active certificate.';
END $$;
