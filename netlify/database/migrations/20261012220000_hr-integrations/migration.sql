SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
 PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
 EXECUTE $payload$
CREATE TABLE hr_credentials (
 id text PRIMARY KEY, name text NOT NULL, token_hash text NOT NULL UNIQUE,
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz, last_used_at timestamptz,
 window_start timestamptz NOT NULL DEFAULT now(), requests integer NOT NULL DEFAULT 0
);
CREATE TABLE hr_events (
 id text PRIMARY KEY, credential_id text NOT NULL REFERENCES hr_credentials(id), employee_id text NOT NULL,
 payload jsonb NOT NULL, payload_hash text NOT NULL, effective_on date NOT NULL,
 status text NOT NULL CHECK(status IN ('scheduled','applied','failed','cancelled')),
 result jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), applied_at timestamptz
);
CREATE INDEX ON hr_events(status,effective_on,created_at);
ALTER TABLE learners ADD COLUMN hr_managed boolean NOT NULL DEFAULT false;
CREATE FUNCTION protect_hr_fields() RETURNS trigger LANGUAGE plpgsql AS $body$
BEGIN
 IF OLD.hr_managed AND current_setting('app.hr_sync',true) IS DISTINCT FROM 'on'
 AND ROW(NEW.name,NEW.email,NEW.workday_id,NEW.store_id,NEW.country,NEW.job_role_id,NEW.department_id,NEW.employment_started_on,NEW.employment_ended_on)
 IS DISTINCT FROM ROW(OLD.name,OLD.email,OLD.workday_id,OLD.store_id,OLD.country,OLD.job_role_id,OLD.department_id,OLD.employment_started_on,OLD.employment_ended_on)
 THEN RAISE EXCEPTION 'Payroll manages these fields. Release payroll control in Integrations before editing.'; END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER protect_hr_fields BEFORE UPDATE ON learners FOR EACH ROW EXECUTE FUNCTION protect_hr_fields();
UPDATE organisation_settings SET features=features||'{"hr_integration":{"policy":"optional","enabled":false}}'::jsonb;
$payload$;
 REVOKE ALL ON hr_credentials,hr_events FROM PUBLIC;
 EXECUTE format('REVOKE ALL ON FUNCTION %I.protect_hr_fields() FROM PUBLIC',target);
 IF target<>'lms_template' THEN
 SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON hr_credentials,hr_events TO %I',runtime_role);
 EXECUTE format('GRANT EXECUTE ON FUNCTION %I.protect_hr_fields() TO %I',target,runtime_role);
 END IF;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('hr_credentials'),('hr_events');
