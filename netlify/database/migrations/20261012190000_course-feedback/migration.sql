SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
  PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
  EXECUTE $sql$CREATE TABLE feedback_surveys(id text PRIMARY KEY,name text NOT NULL,mode text NOT NULL CHECK(mode IN ('anonymous','named')),
   shared boolean NOT NULL DEFAULT false,revision integer NOT NULL DEFAULT 1,updated_by text NOT NULL)$sql$;
  EXECUTE $sql$CREATE TABLE feedback_versions(survey_id text NOT NULL REFERENCES feedback_surveys(id),version integer NOT NULL,
   name text NOT NULL,questions jsonb NOT NULL,PRIMARY KEY(survey_id,version))$sql$;
  EXECUTE $sql$CREATE TABLE feedback_bindings(kind text NOT NULL CHECK(kind IN ('course','live')),target_id text NOT NULL,
   survey_id text NOT NULL REFERENCES feedback_surveys(id),PRIMARY KEY(kind,target_id))$sql$;
  EXECUTE $sql$CREATE TABLE feedback_eligibility(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,kind text NOT NULL CHECK(kind IN ('course','live')),
   occurrence_id text NOT NULL,learner_id text NOT NULL REFERENCES learners(id),target_id text NOT NULL,title text NOT NULL,
   survey_id text NOT NULL,version integer NOT NULL,completion_month text NOT NULL CHECK(completion_month ~ '^[0-9]{4}-[0-9]{2}$'),
   submitted boolean NOT NULL DEFAULT false,UNIQUE(kind,occurrence_id),FOREIGN KEY(survey_id,version) REFERENCES feedback_versions(survey_id,version))$sql$;
  -- Deliberately no eligibility/assignment/enrolment/session ID, timestamp or audit trigger on answers.
  EXECUTE $sql$CREATE TABLE feedback_responses(id text PRIMARY KEY DEFAULT gen_random_uuid()::text,survey_id text NOT NULL,version integer NOT NULL,
   kind text NOT NULL,target_id text NOT NULL,completion_month text NOT NULL,mode text NOT NULL CHECK(mode IN ('anonymous','named')),
   respondent_id text REFERENCES learners(id),answers jsonb NOT NULL,
   CHECK((mode='anonymous' AND respondent_id IS NULL) OR (mode='named' AND respondent_id IS NOT NULL)),
   FOREIGN KEY(survey_id,version) REFERENCES feedback_versions(survey_id,version))$sql$;
  EXECUTE $sql$CREATE INDEX ON feedback_eligibility(learner_id,submitted)$sql$;
  EXECUTE $sql$CREATE INDEX ON feedback_responses(survey_id,version,kind,target_id,completion_month)$sql$;
  EXECUTE $sql$CREATE FUNCTION capture_feedback_eligibility() RETURNS trigger LANGUAGE plpgsql AS $body$
  DECLARE target_id_value text; person text; stamp timestamptz; title_value text; kind_value text;
  BEGIN
   IF NOT feature_enabled('course_feedback') THEN RETURN NEW; END IF;
   IF TG_TABLE_NAME='assignment_history' THEN
    IF NEW.completed_at IS NULL OR NEW.cancelled_at IS NOT NULL THEN RETURN NEW; END IF;
    kind_value:='course';target_id_value:=NEW.course_id;person:=NEW.learner_id;stamp:=NEW.completed_at;
    SELECT title INTO title_value FROM courses WHERE id=target_id_value;
   ELSE
    IF NEW.attendance<>'attended' THEN RETURN NEW; END IF;
    SELECT training_id,ends_at INTO target_id_value,stamp FROM live_sessions WHERE id=NEW.session_id AND status='scheduled';
    IF target_id_value IS NULL THEN RETURN NEW; END IF;
    kind_value:='live';person:=NEW.learner_id;title_value:=NEW.snapshot->>'title';
   END IF;
   INSERT INTO feedback_eligibility(kind,occurrence_id,learner_id,target_id,title,survey_id,version,completion_month)
    SELECT kind_value,NEW.id,person,target_id_value,COALESCE(title_value,''),s.id,s.revision,to_char(stamp AT TIME ZONE 'UTC','YYYY-MM')
    FROM feedback_bindings b JOIN feedback_surveys s ON s.id=b.survey_id WHERE b.kind=kind_value AND b.target_id=target_id_value
    ON CONFLICT(kind,occurrence_id) DO NOTHING;
   RETURN NEW;
  END $body$$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_course_completed AFTER INSERT OR UPDATE OF completed_at ON assignment_history FOR EACH ROW EXECUTE FUNCTION capture_feedback_eligibility()$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_live_completed AFTER INSERT OR UPDATE OF attendance ON live_enrolments FOR EACH ROW EXECUTE FUNCTION capture_feedback_eligibility()$sql$;
  EXECUTE $sql$CREATE FUNCTION guard_feedback_survey() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
   IF NEW.mode<>OLD.mode AND EXISTS(SELECT 1 FROM feedback_responses WHERE survey_id=OLD.id) THEN RAISE EXCEPTION 'Feedback response mode is locked.'; END IF;
   RETURN NEW;
  END $body$$sql$;
  EXECUTE $sql$CREATE FUNCTION guard_feedback_eligibility() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
   IF TG_OP='DELETE' OR OLD.submitted OR NOT NEW.submitted OR (to_jsonb(NEW)-'submitted') IS DISTINCT FROM (to_jsonb(OLD)-'submitted')
    THEN RAISE EXCEPTION 'Feedback submission tracking is immutable.'; END IF;
   RETURN NEW;
  END $body$$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_tracking_guard BEFORE UPDATE OR DELETE ON feedback_eligibility FOR EACH ROW EXECUTE FUNCTION guard_feedback_eligibility()$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_mode_guard BEFORE UPDATE ON feedback_surveys FOR EACH ROW EXECUTE FUNCTION guard_feedback_survey()$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_version_immutable BEFORE UPDATE OR DELETE ON feedback_versions FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence()$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_response_immutable BEFORE UPDATE OR DELETE ON feedback_responses FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence()$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_survey_audit AFTER INSERT OR UPDATE ON feedback_surveys FOR EACH ROW EXECUTE FUNCTION capture_lms_audit()$sql$;
  EXECUTE $sql$CREATE TRIGGER feedback_binding_audit AFTER INSERT OR UPDATE OR DELETE ON feedback_bindings FOR EACH ROW EXECUTE FUNCTION capture_lms_audit()$sql$;
  EXECUTE $sql$UPDATE organisation_settings SET features=features||'{"course_feedback":{"policy":"optional","enabled":true}}'::jsonb,revision=revision+1$sql$;
  REVOKE ALL ON feedback_surveys,feedback_versions,feedback_bindings,feedback_eligibility,feedback_responses FROM PUBLIC;
  REVOKE ALL ON FUNCTION capture_feedback_eligibility(),guard_feedback_survey(),guard_feedback_eligibility() FROM PUBLIC;
  IF target<>'lms_template' THEN
   SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON feedback_surveys,feedback_eligibility TO %I',runtime_role);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON feedback_bindings TO %I',runtime_role);
   EXECUTE format('GRANT SELECT,INSERT ON feedback_versions,feedback_responses TO %I',runtime_role);
   EXECUTE format('GRANT EXECUTE ON FUNCTION capture_feedback_eligibility(),guard_feedback_survey(),guard_feedback_eligibility() TO %I',runtime_role);
  END IF;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('feedback_surveys'),('feedback_versions'),('feedback_bindings'),('feedback_eligibility'),('feedback_responses');
