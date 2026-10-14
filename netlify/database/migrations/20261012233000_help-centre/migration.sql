SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
 PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
 EXECUTE $payload$
CREATE TABLE help_articles(id text PRIMARY KEY,content jsonb NOT NULL,revision integer NOT NULL DEFAULT 1,updated_by text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE help_settings(id integer PRIMARY KEY CHECK(id=1),support_email text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1);
INSERT INTO help_settings(id) VALUES(1);
CREATE TABLE help_requests(id text PRIMARY KEY,requester_key text NOT NULL,requester_name text NOT NULL,requester_email text NOT NULL,topic text NOT NULL,subject text NOT NULL,message text NOT NULL,screenshot text CHECK(length(screenshot)<=500000),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),reply text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,destination text NOT NULL,notification text NOT NULL DEFAULT 'not_sent',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON help_requests(requester_key,created_at DESC);
CREATE INDEX ON help_requests(status,created_at DESC);
$payload$;
 REVOKE ALL ON help_articles,help_settings,help_requests FROM PUBLIC;
 IF target<>'lms_template' THEN
 SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON help_articles,help_settings,help_requests TO %I',runtime_role);
 END IF;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('help_articles'),('help_settings'),('help_requests');

-- New clients inherit only blank support settings, never tickets or article overrides.
CREATE OR REPLACE FUNCTION public.lms_create_client(client_name text, client_slug text, logo text, colour text, actor_email text) RETURNS bigint
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $create$
DECLARE client_id bigint; target text; r record;
BEGIN
 PERFORM pg_advisory_xact_lock(62111700);
 INSERT INTO public.lms_clients(name,slug,schema_name,role_name,logo_url,theme_color)
 VALUES(client_name,client_slug,'pending_'||client_slug,'pending_'||client_slug,logo,colour) RETURNING id INTO client_id;
 target:='lms_tenant_'||client_id;
 PERFORM public.lms_clone_schema('lms_template',target);
 PERFORM set_config('search_path',format('pg_catalog,%I,pg_temp',target),true);
 FOR r IN SELECT unnest(ARRAY['help_settings','organisation_settings','registration_settings','email_settings','scheduled_report_settings','job_roles','accounting_periods','credit_rates']) AS name LOOP
  EXECUTE format('INSERT INTO %I.%I SELECT * FROM lms_template.%I',target,r.name,r.name);
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
 UPDATE public.lms_clients SET schema_name=target,role_name=public.lms_grant_client(client_id,target) WHERE id=client_id;
 INSERT INTO public.lms_client_audit(client_id,actor,action) VALUES(client_id,actor_email,'created');
 RETURN client_id;
END $create$;
REVOKE ALL ON FUNCTION public.lms_create_client(text,text,text,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.lms_grant_client(client_id bigint, client_schema text) RETURNS text
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $grant$
DECLARE runtime_role text:='lms_client_'||client_id; r record;
BEGIN
 IF client_schema <> (CASE WHEN client_id=1 THEN 'public' ELSE 'lms_tenant_'||client_id END) THEN RAISE EXCEPTION 'Invalid client schema'; END IF;
 EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',runtime_role);
 EXECUTE format('GRANT %I TO %I',runtime_role,current_user);
 EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',client_schema,runtime_role);
 FOR r IN SELECT name FROM public.lms_schema_tables WHERE name NOT IN ('admin_passwords','admin_sessions','auth_limits') LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.%I TO %I',client_schema,r.name,runtime_role);
 END LOOP;
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=client_schema AND c.relkind='S' AND c.relname NOT LIKE 'lms_%' LOOP
  EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE %I.%I TO %I',client_schema,r.relname,runtime_role);
 END LOOP;
 FOR r IN SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname=client_schema AND p.proname NOT LIKE 'lms_%' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',client_schema,r.proname,r.args);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I',client_schema,r.proname,r.args,runtime_role);
 END LOOP;
 EXECUTE format('REVOKE DELETE ON %I.help_articles,%I.help_settings,%I.help_requests FROM %I',client_schema,client_schema,client_schema,runtime_role);
 RETURN runtime_role;
END $grant$;
REVOKE ALL ON FUNCTION public.lms_grant_client(bigint,text) FROM PUBLIC;
