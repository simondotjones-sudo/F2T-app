SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
 PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
 EXECUTE $payload$
ALTER TABLE courses ADD COLUMN delivery_type text NOT NULL DEFAULT 'scorm' CHECK(delivery_type IN ('scorm','native'));
ALTER TABLE course_packages ADD COLUMN native_json jsonb;
CREATE TABLE native_drafts(course_id text PRIMARY KEY REFERENCES courses(id),revision integer NOT NULL DEFAULT 1,
 content jsonb NOT NULL DEFAULT '{"schemaVersion":1,"sequential":false,"lessons":[]}',updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE native_media(id text PRIMARY KEY,course_id text NOT NULL REFERENCES courses(id),filename text NOT NULL,mime_type text NOT NULL,
 size integer NOT NULL CHECK(size>0 AND size<=3145728),sha256 text NOT NULL,storage_context text NOT NULL,created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE native_events(id text PRIMARY KEY,assignment_id text NOT NULL REFERENCES assignment_history(id),package_id text NOT NULL REFERENCES course_packages(id),
 lesson_id text,block_id text,kind text NOT NULL CHECK(kind IN ('start','resume','acknowledgement','practice','lesson_complete','content_complete')),detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON native_events(assignment_id,kind,lesson_id);
CREATE UNIQUE INDEX native_once ON native_events(assignment_id,kind,COALESCE(lesson_id,''),COALESCE(block_id,'')) WHERE kind IN ('start','acknowledgement','lesson_complete','content_complete');
CREATE TABLE native_sessions(assignment_id text PRIMARY KEY REFERENCES assignment_history(id),lesson_id text NOT NULL,token text NOT NULL,last_seen timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION guard_native_package() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 IF OLD.native_json IS NOT NULL THEN RAISE EXCEPTION 'Published native content is immutable.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER native_package_immutable BEFORE UPDATE OR DELETE ON course_packages FOR EACH ROW EXECUTE FUNCTION guard_native_package();
CREATE TRIGGER native_event_immutable BEFORE UPDATE OR DELETE ON native_events FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence();
CREATE TRIGGER native_media_immutable BEFORE UPDATE OR DELETE ON native_media FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence();
CREATE FUNCTION capture_native_draft() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 INSERT INTO audit_events(actor,entity,entity_id,action,previous_state,next_state)
 VALUES(NEW.updated_by,'native_drafts',NEW.course_id,lower(TG_OP),CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD)-'content' END,to_jsonb(NEW)-'content');
 RETURN NULL;
END $body$;
CREATE TRIGGER native_draft_audit AFTER INSERT OR UPDATE ON native_drafts FOR EACH ROW EXECUTE FUNCTION capture_native_draft();
UPDATE organisation_settings SET features=features||'{"course_authoring":{"policy":"optional","enabled":true}}'::jsonb,revision=revision+1;
$payload$;
 REVOKE ALL ON native_drafts,native_media,native_events,native_sessions FROM PUBLIC;
 REVOKE ALL ON FUNCTION guard_native_package(),capture_native_draft() FROM PUBLIC;
 IF target<>'lms_template' THEN
 SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON native_drafts,native_sessions TO %I',runtime_role);
 EXECUTE format('GRANT SELECT,INSERT ON native_media,native_events TO %I',runtime_role);
 EXECUTE format('GRANT EXECUTE ON FUNCTION guard_native_package(),capture_native_draft() TO %I',runtime_role);
 END IF;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('native_drafts'),('native_media'),('native_events'),('native_sessions');
