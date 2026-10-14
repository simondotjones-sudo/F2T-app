-- Tenant-local releases and entitlements; no learner data crosses client boundaries.
SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text; definition text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'lms_template' LOOP
  EXECUTE format('CREATE TABLE %I.catalogue_releases (
   id text PRIMARY KEY, course_id text NOT NULL REFERENCES %I.courses(id), version integer NOT NULL,
   snapshot jsonb NOT NULL, package jsonb NOT NULL, files jsonb NOT NULL,
   published_by text NOT NULL, published_at timestamptz NOT NULL DEFAULT now(), UNIQUE(course_id,version))',target,target);
  EXECUTE format('CREATE TABLE %I.catalogue_subscriptions (
   course_id text PRIMARY KEY REFERENCES %I.courses(id), source_client_id bigint NOT NULL,
   source_course_id text NOT NULL, release_id text NOT NULL, version integer NOT NULL,
   active boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(),
   UNIQUE(source_client_id,source_course_id))',target,target);
  EXECUTE format('CREATE TABLE %I.catalogue_package_sources (
   package_id text PRIMARY KEY REFERENCES %I.course_packages(id), source_client_id bigint NOT NULL CHECK(source_client_id>0),
   source_package_id text NOT NULL, release_id text NOT NULL)',target,target);
  EXECUTE format('CREATE TRIGGER catalogue_release_immutable BEFORE UPDATE OR DELETE ON %I.catalogue_releases FOR EACH ROW EXECUTE FUNCTION %I.immutable_lms_evidence()',target,target);
  EXECUTE format('CREATE TRIGGER catalogue_source_immutable BEFORE UPDATE OR DELETE ON %I.catalogue_package_sources FOR EACH ROW EXECUTE FUNCTION %I.immutable_lms_evidence()',target,target);
  EXECUTE format('CREATE TRIGGER catalogue_subscription_audit AFTER INSERT OR UPDATE OR DELETE ON %I.catalogue_subscriptions FOR EACH ROW EXECUTE FUNCTION %I.capture_lms_audit()',target,target);
  -- Guard every assignment path, including automatic rules and renewals.
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target AND p.proname='assign_credit_course';
  IF definition IS NULL THEN RAISE EXCEPTION 'Missing assignment function in %',target; END IF;
  definition:=regexp_replace(definition,'BEGIN','BEGIN'||chr(10)||' PERFORM 1 FROM catalogue_subscriptions WHERE course_id=cid FOR SHARE; IF EXISTS(SELECT 1 FROM catalogue_subscriptions WHERE course_id=cid AND NOT active) THEN RETURN false; END IF;');
  EXECUTE definition;
  IF target<>'lms_template' THEN
   SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
   EXECUTE format('GRANT SELECT,INSERT ON %I.catalogue_releases,%I.catalogue_package_sources TO %I',target,target,runtime_role);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I.catalogue_subscriptions TO %I',target,runtime_role);
  END IF;
  EXECUTE format('REVOKE ALL ON %I.catalogue_releases,%I.catalogue_subscriptions,%I.catalogue_package_sources FROM PUBLIC',target,target,target);
 END LOOP;
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('catalogue_releases'),('catalogue_subscriptions'),('catalogue_package_sources');
