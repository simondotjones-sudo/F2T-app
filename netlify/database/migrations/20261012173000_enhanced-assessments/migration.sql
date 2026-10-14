SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
  PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
  EXECUTE $statement$CREATE TABLE question_banks(id text PRIMARY KEY,name text NOT NULL,shared boolean NOT NULL DEFAULT false,
   questions jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),updated_by text NOT NULL)$statement$;
  EXECUTE $statement$CREATE TABLE course_quiz_sessions(id text PRIMARY KEY,assignment_id text NOT NULL REFERENCES assignment_history(id),
   snapshot jsonb NOT NULL,assessment_version integer,answers jsonb NOT NULL DEFAULT '[]',
   started_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),submitted_at timestamptz)$statement$;
  EXECUTE $statement$CREATE UNIQUE INDEX ON course_quiz_sessions(assignment_id) WHERE submitted_at IS NULL$statement$;
  EXECUTE $statement$CREATE TABLE course_quiz_grants(id text PRIMARY KEY,assignment_id text NOT NULL REFERENCES assignment_history(id),
   granted_by text NOT NULL,reason text NOT NULL,granted_at timestamptz NOT NULL DEFAULT now())$statement$;
  EXECUTE $statement$ALTER TABLE course_quiz_attempts ADD COLUMN snapshot jsonb$statement$;
  EXECUTE $statement$ALTER TABLE course_quiz_attempts ADD COLUMN assessment_version integer$statement$;
  EXECUTE $statement$ALTER TABLE course_quiz_attempts ADD COLUMN started_at timestamptz$statement$;
  EXECUTE $statement$UPDATE course_quiz_attempts q SET snapshot=h.quiz_json,assessment_version=h.learning_version
   FROM assignment_history h WHERE h.id=q.assignment_id$statement$;
  EXECUTE $statement$CREATE TRIGGER quiz_attempt_immutable BEFORE UPDATE OR DELETE ON course_quiz_attempts FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence()$statement$;
  EXECUTE $statement$CREATE TRIGGER quiz_grant_immutable BEFORE UPDATE OR DELETE ON course_quiz_grants FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence()$statement$;
  EXECUTE $statement$CREATE TRIGGER question_bank_audit AFTER INSERT OR UPDATE ON question_banks FOR EACH ROW EXECUTE FUNCTION capture_lms_audit()$statement$;
  EXECUTE $statement$UPDATE organisation_settings SET features=features||'{"advanced_assessments":{"policy":"optional","enabled":true}}'::jsonb,revision=revision+1$statement$;
  EXECUTE $statement$CREATE FUNCTION guard_quiz_session() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
   IF TG_OP='DELETE' OR OLD.submitted_at IS NOT NULL THEN RAISE EXCEPTION 'Submitted assessment evidence is immutable.'; END IF;
   IF NEW.id IS DISTINCT FROM OLD.id OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id OR NEW.snapshot IS DISTINCT FROM OLD.snapshot
    OR NEW.assessment_version IS DISTINCT FROM OLD.assessment_version OR NEW.started_at IS DISTINCT FROM OLD.started_at
    THEN RAISE EXCEPTION 'Assessment selection is immutable.'; END IF;
   RETURN NEW;
  END $body$$statement$;
  EXECUTE $statement$CREATE TRIGGER quiz_session_guard BEFORE UPDATE OR DELETE ON course_quiz_sessions FOR EACH ROW EXECUTE FUNCTION guard_quiz_session()$statement$;
  EXECUTE $statement$REVOKE ALL ON FUNCTION guard_quiz_session() FROM PUBLIC$statement$;
  IF target<>'lms_template' THEN
   SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON question_banks,course_quiz_sessions TO %I',runtime_role);
   EXECUTE format('GRANT EXECUTE ON FUNCTION guard_quiz_session() TO %I',runtime_role);
   EXECUTE format('GRANT SELECT,INSERT ON course_quiz_grants TO %I',runtime_role);
  END IF;
  REVOKE ALL ON question_banks,course_quiz_sessions,course_quiz_grants FROM PUBLIC;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('question_banks'),('course_quiz_sessions'),('course_quiz_grants');
