-- Additive rollout: preserve existing clients and their registration behaviour.
SELECT pg_advisory_xact_lock(62111700);
ALTER TABLE public.lms_clients ADD COLUMN setup_completed_at timestamptz;
ALTER TABLE public.lms_clients ADD COLUMN setup_admin_id text;
ALTER TABLE public.lms_clients ADD COLUMN setup_request_id uuid UNIQUE;
ALTER TABLE public.lms_clients ADD COLUMN setup_payload_hash text;
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'lms_template' LOOP
  EXECUTE format('CREATE TABLE %I.registration_settings (id integer PRIMARY KEY CHECK(id=1),self_registration_enabled boolean NOT NULL DEFAULT false,employee_id_label text NOT NULL DEFAULT ''Employee ID'' CHECK(length(btrim(employee_id_label)) BETWEEN 2 AND 40),employee_id_required boolean NOT NULL DEFAULT false,registration_code text NOT NULL DEFAULT '''',revision integer NOT NULL DEFAULT 1)',target);
  EXECUTE format('CREATE TABLE %I.organisation_departments (id text PRIMARY KEY DEFAULT gen_random_uuid()::text,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100),archived boolean NOT NULL DEFAULT false)',target);
  EXECUTE format('CREATE UNIQUE INDEX ON %I.organisation_departments(lower(name))',target);
  EXECUTE format('ALTER TABLE %I.learners ADD COLUMN department_id text REFERENCES %I.organisation_departments(id)',target,target);
  IF target='lms_template' THEN
   INSERT INTO lms_template.registration_settings(id) VALUES(1);
  ELSE
   EXECUTE format('INSERT INTO %I.registration_settings(id,self_registration_enabled,employee_id_label,employee_id_required,registration_code) SELECT 1,true,CASE WHEN id=1 THEN ''Workday ID'' ELSE ''Employee ID'' END,true,registration_code FROM public.lms_clients WHERE schema_name=$1',target) USING target;
   SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.registration_settings,%I.organisation_departments TO %I',target,target,runtime_role);
  END IF;
  EXECUTE format('REVOKE ALL ON %I.registration_settings,%I.organisation_departments FROM PUBLIC',target,target);
 END LOOP;
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('registration_settings'),('organisation_departments');

-- New clients also inherit the clean registration defaults. No client records are copied.
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
 FOR r IN SELECT unnest(ARRAY['organisation_settings','registration_settings','email_settings','scheduled_report_settings','job_roles','accounting_periods','credit_rates']) AS name LOOP
  EXECUTE format('INSERT INTO %I.%I SELECT * FROM lms_template.%I',target,r.name,r.name);
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
 UPDATE public.lms_clients SET schema_name=target,role_name=public.lms_grant_client(client_id,target) WHERE id=client_id;
 INSERT INTO public.lms_client_audit(client_id,actor,action) VALUES(client_id,actor_email,'created');
 RETURN client_id;
END $create$;
REVOKE ALL ON FUNCTION public.lms_create_client(text,text,text,text,text) FROM PUBLIC;

-- Invoker-only control-plane function: the API authorises the global operator.
-- One atomic statement provisions schema, sites, departments, settings and first admin.
CREATE FUNCTION public.lms_setup_client(config jsonb, actor_email text, request_id uuid, payload_hash text, admin_id text, code_hash text, reset_hash text, credential_hash text) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $setup$
DECLARE client_id bigint; target text; row jsonb; existing public.lms_clients%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(62111700);
 SELECT * INTO existing FROM public.lms_clients WHERE setup_request_id=request_id;
 IF FOUND THEN
  IF existing.setup_payload_hash IS DISTINCT FROM payload_hash THEN RAISE EXCEPTION 'Setup request changed' USING ERRCODE='22023'; END IF;
  RETURN jsonb_build_object('id',existing.id,'created',false);
 END IF;
 client_id:=public.lms_create_client(config->>'name',config->>'slug',config->>'logo_url',config->>'theme_color',actor_email);
 target:='lms_tenant_'||client_id;
 PERFORM set_config('search_path',format('pg_catalog,%I,pg_temp',target),true);
 PERFORM set_config('app.audit_actor',actor_email,true);
 FOR row IN SELECT value FROM jsonb_array_elements(config->'sites') LOOP
  EXECUTE format('INSERT INTO %I.organisation_stores(id,name,country,store_code,active,updated_by,updated_at) VALUES($1,$2,$3,$4,true,$5,now()::text)',target)
  USING row->>'id',row->>'name',row->>'country',NULLIF(row->>'code',''),actor_email;
  IF (config->'features'->'credits'->>'enabled')::boolean THEN
   EXECUTE format('INSERT INTO %I.store_credit_accounts(store_id,store_name,country,store_code,balance,target,created_at) VALUES($1,$2,$3,$4,$5,$5,now())',target)
   USING row->>'id',row->>'name',row->>'country',NULLIF(row->>'code',''),(config->>'creditsPerSite')::integer;
   EXECUTE format('INSERT INTO %I.credit_ledger(id,store_id,kind,credits,recorded_at,actor) VALUES(gen_random_uuid()::text,$1,''opening'',$2,now(),$3)',target)
   USING row->>'id',(config->>'creditsPerSite')::integer,actor_email;
  END IF;
 END LOOP;
 FOR row IN SELECT value FROM jsonb_array_elements(config->'departments') LOOP
  EXECUTE format('INSERT INTO %I.organisation_departments(name) VALUES($1)',target) USING row#>>'{}';
 END LOOP;
 EXECUTE format('UPDATE %I.registration_settings SET self_registration_enabled=$1,employee_id_label=$2,employee_id_required=$3,registration_code=$4 WHERE id=1',target)
 USING (config->'registration'->>'self_registration_enabled')::boolean,config->'registration'->>'employee_id_label',(config->'registration'->>'employee_id_required')::boolean,config->'registration'->>'registration_code';
 EXECUTE format('UPDATE %I.organisation_settings SET features=$1,updated_by=$2,updated_at=now() WHERE id=1',target) USING config->'features',actor_email;
 EXECUTE format('INSERT INTO %I.learners(id,name,email,code_hash,store_id,country,entered_at,induction_enrolled) VALUES($1,$2,$3,$4,'''','''',now()::text,false)',target)
 USING admin_id,config->'administrator'->>'name',config->'administrator'->>'email',code_hash;
 EXECUTE format('INSERT INTO %I.reporting_access(learner_id,scope,assigned_by,updated_at) VALUES($1,''organisation'',$2,now()::text)',target) USING admin_id,actor_email;
 EXECUTE format('INSERT INTO %I.password_resets(token_hash,account_type,account_id,credential_hash,expires_at) VALUES($1,''learner'',$2,$3,now()+interval ''7 days'')',target) USING reset_hash,admin_id,credential_hash;
 EXECUTE format('INSERT INTO %I.audit_events(actor,entity,entity_id,action,next_state) VALUES($1,''client_setup'',$2,''completed'',$3)',target)
 USING actor_email,client_id::text,jsonb_build_object('sites',jsonb_array_length(config->'sites'),'departments',jsonb_array_length(config->'departments'),'administrator',config->'administrator'->>'email');
 UPDATE public.lms_clients SET setup_completed_at=now(),setup_admin_id=admin_id,setup_request_id=request_id,setup_payload_hash=payload_hash WHERE id=client_id;
 INSERT INTO public.lms_client_audit(client_id,actor,action,details) VALUES(client_id,actor_email,'setup_completed',jsonb_build_object('sites',jsonb_array_length(config->'sites'),'departments',jsonb_array_length(config->'departments')));
 RETURN jsonb_build_object('id',client_id,'created',true);
END $setup$;
REVOKE ALL ON FUNCTION public.lms_setup_client(jsonb,text,uuid,text,text,text,text,text) FROM PUBLIC;
