-- Preserve site identities and Primark's Global > Country > Store hierarchy.
SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text; c record;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
  EXECUTE format('CREATE TABLE %I.organisation_hierarchy (id integer PRIMARY KEY CHECK(id=1),labels text[] NOT NULL DEFAULT ARRAY[''Organisation'',''Site''] CHECK(cardinality(labels)>=2),country_level integer,revision integer NOT NULL DEFAULT 1,primark_locked boolean NOT NULL DEFAULT false,CHECK(country_level IS NULL OR country_level BETWEEN 1 AND cardinality(labels)-2))',target);
  EXECUTE format('CREATE TABLE %I.organisation_units (id text PRIMARY KEY DEFAULT gen_random_uuid()::text,name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 100),code text NOT NULL UNIQUE CHECK(length(code) BETWEEN 1 AND 80),level integer NOT NULL CHECK(level>0),parent_id text REFERENCES %I.organisation_units(id),country text,revision integer NOT NULL DEFAULT 1)',target,target);
  EXECUTE format('CREATE UNIQUE INDEX ON %I.organisation_units(COALESCE(parent_id,''''),level,lower(name))',target);
  EXECUTE format('CREATE INDEX ON %I.organisation_units(parent_id)',target);
  EXECUTE format('ALTER TABLE %I.organisation_stores ADD COLUMN parent_unit_id text REFERENCES %I.organisation_units(id)',target,target);
  EXECUTE format('CREATE INDEX ON %I.organisation_stores(parent_unit_id)',target);
  EXECUTE format('ALTER TABLE %I.reporting_access ADD COLUMN unit_ids text[] NOT NULL DEFAULT ARRAY[]::text[]',target);
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid=format('%I.reporting_access',target)::regclass AND contype='c' LOOP
   EXECUTE format('ALTER TABLE %I.reporting_access DROP CONSTRAINT %I',target,c.conname);
  END LOOP;
  EXECUTE format('ALTER TABLE %I.reporting_access ADD CONSTRAINT reporting_scope_valid CHECK((scope=''organisation'' AND country IS NULL AND site_id IS NULL AND cardinality(unit_ids)=0) OR (scope=''country'' AND country IS NOT NULL AND site_id IS NULL AND cardinality(unit_ids)=0) OR (scope=''site'' AND country IS NOT NULL AND site_id IS NOT NULL AND cardinality(unit_ids)=0) OR (scope=''unit'' AND country IS NULL AND site_id IS NULL AND cardinality(unit_ids)>0))',target);
  IF target='public' THEN
   INSERT INTO public.organisation_hierarchy(id,labels,country_level,primark_locked) VALUES(1,ARRAY['Global','Country','Store'],1,true);
   INSERT INTO public.organisation_units(id,name,code,level,country) SELECT 'country-'||md5(country),country,'country-'||md5(country),1,country FROM public.organisation_stores GROUP BY country;
   UPDATE public.organisation_stores SET parent_unit_id='country-'||md5(country);
  ELSE
   EXECUTE format('INSERT INTO %I.organisation_hierarchy(id) VALUES(1)',target);
  END IF;
  EXECUTE format('REVOKE ALL ON %I.organisation_hierarchy,%I.organisation_units FROM PUBLIC',target,target);
  SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
  IF runtime_role IS NOT NULL THEN EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I.organisation_hierarchy,%I.organisation_units TO %I',target,target,runtime_role); END IF;
 END LOOP;
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('organisation_hierarchy'),('organisation_units');

CREATE FUNCTION public.hierarchy_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE config organisation_hierarchy%ROWTYPE; parent organisation_units%ROWTYPE; old_parent text; chosen text;
BEGIN
 -- Lock a per-client row before any mutation: concurrent moves cannot create cycles.
 SELECT * INTO config FROM organisation_hierarchy WHERE id=1 FOR UPDATE;
 IF TG_TABLE_NAME='organisation_hierarchy' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'The organisation structure cannot be deleted'; END IF;
  IF OLD.primark_locked AND (NEW.labels IS DISTINCT FROM OLD.labels OR NEW.country_level IS DISTINCT FROM OLD.country_level OR NOT NEW.primark_locked) THEN RAISE EXCEPTION 'Primark keeps Global > Country > Store'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(NEW.labels) label WHERE length(btrim(label)) NOT BETWEEN 1 AND 40) OR EXISTS(SELECT 1 FROM organisation_units WHERE level>=cardinality(NEW.labels)-1) THEN RAISE EXCEPTION 'Remove populated levels only after moving their groups'; END IF;
  IF NEW.country_level IS DISTINCT FROM OLD.country_level AND EXISTS(SELECT 1 FROM organisation_units) THEN RAISE EXCEPTION 'Country level cannot change while groups exist'; END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='organisation_units' THEN
  IF TG_OP='DELETE' THEN
   IF EXISTS(SELECT 1 FROM reporting_access WHERE OLD.id=ANY(unit_ids)) OR EXISTS(SELECT 1 FROM courses WHERE jsonb_exists(audience_json::jsonb->'units',OLD.id)) THEN RAISE EXCEPTION 'Remove group access before deleting this group'; END IF;
   RETURN OLD;
  END IF;
  IF NEW.level>=cardinality(config.labels)-1 OR (TG_OP='UPDATE' AND NEW.level<>OLD.level) THEN RAISE EXCEPTION 'Choose an available group level'; END IF;
  IF NEW.parent_id IS NOT NULL THEN
   SELECT * INTO parent FROM organisation_units WHERE id=NEW.parent_id;
   IF NOT FOUND OR parent.level>=NEW.level THEN RAISE EXCEPTION 'Choose a parent from an earlier level'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
   old_parent:=NEW.parent_id;
   WHILE old_parent IS NOT NULL LOOP
    SELECT * INTO parent FROM organisation_units WHERE id=old_parent;
    IF parent.country IS NOT NULL AND EXISTS(SELECT 1 FROM organisation_stores s WHERE s.parent_unit_id=ANY(hierarchy_descendants(ARRAY[NEW.id])) AND s.country<>parent.country) THEN RAISE EXCEPTION 'Store country must match its country group'; END IF;
    old_parent:=parent.parent_id;
   END LOOP;
  END IF;
  IF NEW.level=config.country_level THEN
   IF NEW.country IS NULL OR NEW.country<>NEW.name THEN RAISE EXCEPTION 'Country groups must use their geographic country name'; END IF;
   IF TG_OP='UPDATE' AND NEW.country IS DISTINCT FROM OLD.country THEN RAISE EXCEPTION 'Create a new country group to change country'; END IF;
  END IF;
  RETURN NEW;
 ELSIF TG_TABLE_NAME='reporting_access' THEN
  IF NEW.scope='unit' AND (EXISTS(SELECT 1 FROM unnest(NEW.unit_ids) selected(id) WHERE selected.id IS NULL OR NOT EXISTS(SELECT 1 FROM organisation_units u WHERE u.id=selected.id)) OR cardinality(NEW.unit_ids)<>(SELECT count(DISTINCT id) FROM unnest(NEW.unit_ids) id)) THEN RAISE EXCEPTION 'Choose valid unique organisation groups'; END IF;
  RETURN NEW;
 ELSE
  IF NEW.parent_unit_id IS NULL AND config.country_level=1 THEN
   chosen:='country-'||md5(NEW.country);
   INSERT INTO organisation_units(id,name,code,level,country) VALUES(chosen,NEW.country,chosen,1,NEW.country) ON CONFLICT DO NOTHING;
   SELECT id INTO NEW.parent_unit_id FROM organisation_units WHERE level=1 AND country=NEW.country AND parent_id IS NULL;
  END IF;
  -- Legacy clients may edit the country without sending the new parent field.
  IF TG_OP='UPDATE' AND config.primark_locked AND NEW.country IS DISTINCT FROM OLD.country AND NEW.parent_unit_id IS NOT DISTINCT FROM OLD.parent_unit_id THEN
   chosen:='country-'||md5(NEW.country);
   INSERT INTO organisation_units(id,name,code,level,country) VALUES(chosen,NEW.country,chosen,1,NEW.country) ON CONFLICT DO NOTHING;
   SELECT id INTO NEW.parent_unit_id FROM organisation_units WHERE level=1 AND country=NEW.country AND parent_id IS NULL;
  END IF;
  old_parent:=NEW.parent_unit_id;
  WHILE old_parent IS NOT NULL LOOP
   SELECT * INTO parent FROM organisation_units WHERE id=old_parent;
   IF NOT FOUND THEN RAISE EXCEPTION 'Choose an existing parent group'; END IF;
   IF parent.level=config.country_level AND parent.country IS DISTINCT FROM NEW.country THEN RAISE EXCEPTION 'Store country must match its country group'; END IF;
   old_parent:=parent.parent_id;
  END LOOP;
  RETURN NEW;
 END IF;
END $fn$;

CREATE FUNCTION public.hierarchy_audit() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE before_value jsonb; after_value jsonb;
BEGIN
 before_value:=CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END;
 after_value:=CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END;
 IF TG_TABLE_NAME='reporting_access' AND before_value->'unit_ids' IS NOT DISTINCT FROM after_value->'unit_ids' THEN RETURN NULL; END IF;
 IF before_value IS NOT DISTINCT FROM after_value THEN RETURN NULL; END IF;
 INSERT INTO audit_events(actor,entity,entity_id,action,store_id,previous_state,next_state,reason)
 VALUES(COALESCE(NULLIF(current_setting('app.audit_actor',true),''),'system'),TG_TABLE_NAME,COALESCE(after_value->>'id',before_value->>'id',after_value->>'learner_id',before_value->>'learner_id','1'),lower(TG_OP),CASE WHEN TG_TABLE_NAME='organisation_stores' THEN COALESCE(after_value->>'id',before_value->>'id') END,before_value,after_value,NULLIF(current_setting('app.audit_reason',true),''));
 RETURN NULL;
END $fn$;

-- Resolve a setup/import path inside the current client's transaction.
CREATE FUNCTION public.hierarchy_ensure_path(names text[],site_country text) RETURNS text LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $fn$
DECLARE config organisation_hierarchy%ROWTYPE; parent text; chosen text; value text; i integer;
BEGIN
 SELECT * INTO config FROM organisation_hierarchy WHERE id=1 FOR UPDATE;
 IF cardinality(names)>cardinality(config.labels)-2 THEN RAISE EXCEPTION 'Too many group levels'; END IF;
 FOR i IN 1..COALESCE(cardinality(names),0) LOOP
  value:=btrim(names[i]);
  IF value='' THEN CONTINUE; END IF;
  IF length(value)>100 THEN RAISE EXCEPTION 'Group names must be 1 to 100 characters'; END IF;
  IF i=config.country_level AND value<>site_country THEN RAISE EXCEPTION 'Store country must match its country group'; END IF;
  SELECT id INTO chosen FROM organisation_units WHERE parent_id IS NOT DISTINCT FROM parent AND level=i AND lower(name)=lower(value);
  IF NOT FOUND THEN
   chosen:=gen_random_uuid()::text;
   INSERT INTO organisation_units(id,name,code,level,parent_id,country) VALUES(chosen,value,chosen,i,parent,CASE WHEN i=config.country_level THEN site_country END);
  END IF;
  parent:=chosen;
 END LOOP;
 RETURN parent;
END $fn$;

CREATE FUNCTION public.hierarchy_descendants(roots text[]) RETURNS text[] LANGUAGE sql STABLE SET search_path=pg_catalog,public,pg_temp AS $fn$
 WITH RECURSIVE descendants AS (SELECT id FROM organisation_units WHERE id=ANY(roots)
 UNION SELECT u.id FROM organisation_units u JOIN descendants d ON u.parent_id=d.id)
 SELECT COALESCE(array_agg(id),ARRAY[]::text[]) FROM descendants;
$fn$;

DO $migration$
DECLARE target text; runtime_role text; f record; tab text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
  IF target<>'public' THEN
   FOR f IN SELECT p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('hierarchy_guard','hierarchy_audit','hierarchy_ensure_path','hierarchy_descendants') LOOP
    EXECUTE replace(pg_get_functiondef(f.oid),'public.',target||'.');
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path=pg_catalog,%I,pg_temp',target,f.proname,f.args,target);
   END LOOP;
  END IF;
  FOREACH tab IN ARRAY ARRAY['organisation_hierarchy','organisation_units','organisation_stores','reporting_access'] LOOP
   EXECUTE format('CREATE TRIGGER hierarchy_guard BEFORE %s ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.hierarchy_guard()',CASE WHEN tab IN ('organisation_hierarchy','organisation_units') THEN 'UPDATE OR DELETE'||CASE WHEN tab='organisation_units' THEN ' OR INSERT' ELSE '' END ELSE 'INSERT OR UPDATE' END,target,tab,target);
   EXECUTE format('CREATE TRIGGER hierarchy_history AFTER INSERT OR UPDATE OR DELETE ON %I.%I FOR EACH ROW EXECUTE FUNCTION %I.hierarchy_audit()',target,tab,target);
  END LOOP;
  SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
  FOR f IN SELECT p.proname,pg_get_function_identity_arguments(p.oid) args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target AND p.proname IN ('hierarchy_guard','hierarchy_audit','hierarchy_ensure_path','hierarchy_descendants') LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC',target,f.proname,f.args);
   IF runtime_role IS NOT NULL THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO %I',target,f.proname,f.args,runtime_role); END IF;
  END LOOP;
 END LOOP;
END $migration$;

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
 FOR r IN SELECT unnest(ARRAY['organisation_hierarchy','help_settings','organisation_settings','registration_settings','email_settings','scheduled_report_settings','job_roles','accounting_periods','credit_rates']) AS name LOOP
  EXECUTE format('INSERT INTO %I.%I SELECT * FROM lms_template.%I',target,r.name,r.name);
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
 UPDATE public.lms_clients SET schema_name=target,role_name=public.lms_grant_client(client_id,target) WHERE id=client_id;
 INSERT INTO public.lms_client_audit(client_id,actor,action) VALUES(client_id,actor_email,'created');
 RETURN client_id;
END $create$;
REVOKE ALL ON FUNCTION public.lms_create_client(text,text,text,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.lms_setup_client(config jsonb, actor_email text, request_id uuid, payload_hash text, admin_id text, code_hash text, reset_hash text, credential_hash text) RETURNS jsonb
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
 IF config ? 'hierarchy' THEN
  EXECUTE format('UPDATE %I.organisation_hierarchy SET labels=$1,country_level=$2,revision=revision+1 WHERE id=1',target)
  USING ARRAY(SELECT jsonb_array_elements_text(config->'hierarchy'->'labels')),(config->'hierarchy'->>'countryLevel')::integer;
 END IF;
 FOR row IN SELECT value FROM jsonb_array_elements(config->'sites') LOOP
  EXECUTE format('INSERT INTO %I.organisation_stores(id,name,country,store_code,active,updated_by,updated_at,parent_unit_id) VALUES($1,$2,$3,$4,true,$5,now()::text,hierarchy_ensure_path($6,$3))',target)
  USING row->>'id',row->>'name',row->>'country',NULLIF(row->>'code',''),actor_email,ARRAY(SELECT jsonb_array_elements_text(COALESCE(row->'groups','[]'::jsonb)));
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

-- Extend the existing automatic assignment function; retain credits, exclusions,
-- version pinning and pathway behaviour instead of introducing another engine.
DO $migration$
DECLARE target text; definition text; old_match text:='jsonb_exists(c.audience_json::jsonb->''users'',person.id)'; new_match text;
BEGIN
 new_match:=old_match||' OR EXISTS(SELECT 1 FROM organisation_stores hs WHERE hs.id=person.store_id AND hs.parent_unit_id=ANY(hierarchy_descendants(ARRAY(SELECT jsonb_array_elements_text(COALESCE(c.audience_json::jsonb->''units'',''[]''::jsonb))))))';
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
  SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=target AND p.proname='sync_course_credit_assignments';
  IF position(old_match IN definition)=0 THEN RAISE EXCEPTION 'Automatic assignment definition changed'; END IF;
  EXECUTE replace(definition,old_match,new_match);
 END LOOP;
END $migration$;
