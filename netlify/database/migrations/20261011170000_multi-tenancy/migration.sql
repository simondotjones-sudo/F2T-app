-- One application, separate client schemas and least-privilege runtime roles.
-- Existing data stays in public (client 1); no records or files are copied.
CREATE TABLE public.lms_clients (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100),
 slug text UNIQUE NOT NULL CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 60),
 schema_name text UNIQUE NOT NULL, role_name text UNIQUE NOT NULL,
 logo_url text NOT NULL DEFAULT '/branding/eazysafe-logo.png',
 theme_color text NOT NULL DEFAULT '#e8002a' CHECK(theme_color ~ '^#[0-9a-fA-F]{6}$'),
 active boolean NOT NULL DEFAULT true, revision integer NOT NULL DEFAULT 1,
 registration_code text NOT NULL DEFAULT 'safety',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lms_client_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, client_id bigint NOT NULL REFERENCES public.lms_clients(id),
 actor text NOT NULL, action text NOT NULL, details jsonb NOT NULL DEFAULT '{}', recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.lms_schema_tables (name text PRIMARY KEY);
INSERT INTO public.lms_schema_tables(name)
 SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname NOT LIKE 'lms_%'
 AND c.relname NOT LIKE '%migration%';
CREATE TABLE public.lms_schema_functions (signature text PRIMARY KEY);
INSERT INTO public.lms_schema_functions
 SELECT p.oid::regprocedure::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e');

-- Used only by the owner connection after platform-operator authorisation.
-- Everything cloned is schema structure; seed data comes from a clean template.
CREATE FUNCTION public.lms_clone_schema(source_schema text, destination text) RETURNS void
LANGUAGE plpgsql SET search_path=pg_catalog AS $clone$
DECLARE r record; definition text; old_path text:=current_setting('search_path');
BEGIN
 IF destination !~ '^lms_(template|tenant_[0-9]+)$' OR source_schema NOT IN ('public','lms_template') THEN
  RAISE EXCEPTION 'Invalid client schema';
 END IF;
 PERFORM set_config('check_function_bodies','off',true);
 EXECUTE format('CREATE SCHEMA %I',destination);
 FOR r IN SELECT name FROM public.lms_schema_tables ORDER BY name LOOP
  EXECUTE format('CREATE TABLE %I.%I (LIKE %I.%I INCLUDING ALL)',destination,r.name,source_schema,r.name);
 END LOOP;
 FOR r IN SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) AS args
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname=source_schema AND p.proname NOT LIKE 'lms_%'
   AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') ORDER BY p.oid LOOP
  definition:=replace(pg_get_functiondef(r.oid),source_schema||'.',destination||'.');
  -- SQL bodies and %ROWTYPE declarations resolve within the destination.
  PERFORM set_config('search_path',format('pg_catalog,%I,pg_temp',destination),true);
  EXECUTE definition;
  EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path=pg_catalog,%I,pg_temp',destination,r.proname,r.args,destination);
  PERFORM set_config('search_path','pg_catalog',true);
 END LOOP;
 FOR r IN SELECT c.conname,t.relname,pg_get_constraintdef(c.oid) AS definition
   FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
   WHERE n.nspname=source_schema AND c.contype='f' AND t.relname IN (SELECT name FROM public.lms_schema_tables) LOOP
  EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',destination,r.relname,r.conname,replace(r.definition,source_schema||'.',destination||'.'));
 END LOOP;
 FOR r IN SELECT pg_get_triggerdef(t.oid) AS definition
   FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname=source_schema AND NOT t.tgisinternal AND c.relname IN (SELECT name FROM public.lms_schema_tables) LOOP
  EXECUTE replace(r.definition,source_schema||'.',destination||'.');
 END LOOP;
 EXECUTE format('REVOKE ALL ON SCHEMA %I FROM PUBLIC',destination);
 EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM PUBLIC',destination);
 EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM PUBLIC',destination);
 EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA %I FROM PUBLIC',destination);
 PERFORM set_config('search_path',old_path,true);
 PERFORM set_config('check_function_bodies','on',true);
END $clone$;
REVOKE ALL ON FUNCTION public.lms_clone_schema(text,text) FROM PUBLIC;

SELECT public.lms_clone_schema('public','lms_template');
-- Fresh clients receive defaults only: no Primark stores, users, courses or audit data.
INSERT INTO lms_template.organisation_settings(id,features) VALUES(1,'{
 "pathways":{"policy":"optional","enabled":false},"pathway_rules":{"policy":"optional","enabled":true},
 "renewals":{"policy":"optional","enabled":true},"refreshers":{"policy":"optional","enabled":true},
 "quizzes":{"policy":"optional","enabled":true},"assessor":{"policy":"optional","enabled":true},
 "assessment_evidence":{"policy":"optional","enabled":true},"pathway_certificates":{"policy":"optional","enabled":true},
 "bulk_import":{"policy":"optional","enabled":true},"lifecycle":{"policy":"optional","enabled":true},
 "auto_archive":{"policy":"optional","enabled":false},"email_notifications":{"policy":"optional","enabled":true},
 "assignment_emails":{"policy":"optional","enabled":true},"registration_reminders":{"policy":"optional","enabled":true},
 "expiry_reminders":{"policy":"optional","enabled":true},"learning_time":{"policy":"optional","enabled":true},
 "site_matrix":{"policy":"optional","enabled":true},"credit_reporting":{"policy":"optional","enabled":true},
 "credits":{"policy":"optional","enabled":false},"exclude_within_deadline":{"policy":"optional","enabled":true},
 "scheduled_reports":{"policy":"optional","enabled":true},"weekly_store_reports":{"policy":"optional","enabled":true},"monthly_country_reports":{"policy":"optional","enabled":false},"job_roles":{"policy":"optional","enabled":true},
 "training_recognition":{"policy":"optional","enabled":true}}');
UPDATE lms_template.organisation_settings SET credits_enabled=false;
INSERT INTO lms_template.email_settings(id) VALUES(1);
INSERT INTO lms_template.scheduled_report_settings(kind) VALUES('manager_digest'),('country_digest');
INSERT INTO lms_template.job_roles(name) VALUES('Staff'),('Supervisor'),('Manager'),('Night Worker');
INSERT INTO lms_template.accounting_periods SELECT * FROM public.accounting_periods;
INSERT INTO lms_template.credit_rates(id,effective_at,cents,actor) VALUES('initial','2026-09-13 00:00 Europe/London',325,'initial configuration');

CREATE FUNCTION public.lms_grant_client(client_id bigint, client_schema text) RETURNS text
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
 RETURN runtime_role;
END $grant$;
REVOKE ALL ON FUNCTION public.lms_grant_client(bigint,text) FROM PUBLIC;

INSERT INTO public.lms_clients(name,slug,schema_name,role_name,logo_url,theme_color)
 VALUES('Primark','primark','public','lms_client_1','/branding/primark-logo.svg','#008bc9');
SELECT public.lms_grant_client(1,'public');

CREATE FUNCTION public.lms_create_client(client_name text, client_slug text, logo text, colour text, actor_email text) RETURNS bigint
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $create$
DECLARE client_id bigint; target text; r record;
BEGIN
 -- Serialize provisioning with migrations and other client creation.
 PERFORM pg_advisory_xact_lock(62111700);
 INSERT INTO public.lms_clients(name,slug,schema_name,role_name,logo_url,theme_color)
 VALUES(client_name,client_slug,'pending_'||client_slug,'pending_'||client_slug,logo,colour) RETURNING id INTO client_id;
 target:='lms_tenant_'||client_id;
 PERFORM public.lms_clone_schema('lms_template',target);
 PERFORM set_config('search_path',format('pg_catalog,%I,pg_temp',target),true);
 FOR r IN SELECT unnest(ARRAY['organisation_settings','email_settings','scheduled_report_settings','job_roles','accounting_periods','credit_rates']) AS name LOOP
  EXECUTE format('INSERT INTO %I.%I SELECT * FROM lms_template.%I',target,r.name,r.name);
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
 UPDATE public.lms_clients SET schema_name=target,role_name=public.lms_grant_client(client_id,target) WHERE id=client_id;
 INSERT INTO public.lms_client_audit(client_id,actor,action) VALUES(client_id,actor_email,'created');
 RETURN client_id;
END $create$;
REVOKE ALL ON FUNCTION public.lms_create_client(text,text,text,text,text) FROM PUBLIC;
SELECT public.lms_create_client('EazySafe Internal','eazysafe-internal','/branding/eazysafe-logo.png','#e8002a','migration');
REVOKE ALL ON public.lms_clients,public.lms_client_audit,public.lms_schema_tables,public.lms_schema_functions FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

INSERT INTO lms_tenant_2.organisation_stores(id,name,country,active,updated_by,updated_at) VALUES('eazysafe-internal','EazySafe Internal','Ireland',true,'migration',now()::text);

CREATE TABLE public.lms_platform_resets (token_hash text PRIMARY KEY,account_id text NOT NULL,credential_hash text NOT NULL,expires_at timestamptz NOT NULL);
REVOKE ALL ON public.lms_platform_resets FROM PUBLIC;
