SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text; runtime_role text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'lms_template' LOOP
  PERFORM set_config('search_path',format('%I,pg_catalog,pg_temp',target),true);
  EXECUTE $statement$CREATE TABLE live_trainings(id text PRIMARY KEY,title text NOT NULL,description text NOT NULL DEFAULT '',trainer text NOT NULL,
 award_certificate boolean NOT NULL DEFAULT false,validity_months integer CHECK(validity_months BETWEEN 1 AND 120),
 revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL)$statement$;
  EXECUTE $statement$CREATE TABLE live_sessions(id text PRIMARY KEY,training_id text NOT NULL REFERENCES live_trainings(id),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,time_zone text NOT NULL,
 format text NOT NULL CHECK(format IN ('webinar','classroom')),location text NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled')),
 revision integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),created_by text NOT NULL,
 CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '7 days'))$statement$;
  EXECUTE $statement$CREATE TABLE live_enrolments(id text PRIMARY KEY,session_id text NOT NULL REFERENCES live_sessions(id),learner_id text NOT NULL REFERENCES learners(id),
 snapshot jsonb NOT NULL,assigned_at timestamptz NOT NULL DEFAULT now(),assigned_by text NOT NULL,
 attendance text NOT NULL DEFAULT 'assigned' CHECK(attendance IN ('assigned','attended','absent','cancelled')),
 recorded_at timestamptz,recorded_by text,reason text NOT NULL DEFAULT '',revision integer NOT NULL DEFAULT 1,
 UNIQUE(session_id,learner_id))$statement$;
  EXECUTE $statement$CREATE TABLE live_certificates(token text PRIMARY KEY,enrolment_id text NOT NULL REFERENCES live_enrolments(id),
 snapshot jsonb NOT NULL,issued_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz NOT NULL,expires_at timestamptz,
 revoked_at timestamptz,revoked_by text,revocation_reason text)$statement$;
  EXECUTE $statement$CREATE UNIQUE INDEX ON live_certificates(enrolment_id) WHERE revoked_at IS NULL$statement$;
  EXECUTE $statement$CREATE INDEX ON live_enrolments(learner_id,session_id)$statement$;
  EXECUTE $statement$CREATE TABLE live_evidence(id text PRIMARY KEY,session_id text NOT NULL REFERENCES live_sessions(id),filename text NOT NULL,
 mime_type text NOT NULL,size integer NOT NULL CHECK(size BETWEEN 1 AND 3145728),sha256 text NOT NULL,
 storage_context text NOT NULL,uploaded_by text NOT NULL,uploaded_at timestamptz NOT NULL DEFAULT now())$statement$;
  EXECUTE $statement$UPDATE organisation_settings SET features=features||'{"live_training":{"policy":"disabled","enabled":false}}'::jsonb$statement$;
  EXECUTE $statement$UPDATE email_settings SET enabled=enabled||'["live_assigned","live_reminder","live_cancelled"]'::jsonb,
 enabled_since=enabled_since||jsonb_build_object('live_assigned',now(),'live_reminder',now(),'live_cancelled',now())$statement$;
  EXECUTE $statement$ALTER FUNCTION learning_email_candidates(timestamptz) RENAME TO learning_email_candidates_before_live$statement$;
  EXECUTE $statement$CREATE FUNCTION learning_email_candidates(at_time timestamptz DEFAULT now())
RETURNS TABLE(event_key text,kind text,recipient_id text,invitation_id text,email text,payload jsonb,occurred_at timestamptz,ends_at timestamptz)
LANGUAGE sql STABLE AS $body$
 SELECT * FROM learning_email_candidates_before_live(at_time)
 UNION ALL
 SELECT 'live:'||e.id||':'||s.revision||':'||e.revision||':'||k.kind,k.kind,l.id,NULL,l.email,
 jsonb_build_object('name',l.name,'title',e.snapshot->>'title','date',s.starts_at,'timeZone',s.time_zone,'path','/?courses=1'),
 k.occurred_at,CASE WHEN k.kind='live_cancelled' THEN e.recorded_at+interval '7 days' ELSE s.starts_at END
 FROM live_enrolments e JOIN live_sessions s ON s.id=e.session_id JOIN learners l ON l.id=e.learner_id
 CROSS JOIN email_settings settings
 CROSS JOIN LATERAL (VALUES
 ('live_assigned',greatest(e.assigned_at,s.updated_at,CASE WHEN e.attendance='assigned' THEN e.recorded_at END)),
 ('live_reminder',greatest(e.assigned_at,s.starts_at-interval '24 hours')),
 ('live_cancelled',e.recorded_at)) k(kind,occurred_at)
 WHERE settings.id=1 AND settings.mode<>'off' AND feature_enabled('email_notifications') AND feature_enabled('live_training')
 AND jsonb_exists(settings.enabled,k.kind) AND l.archived_at IS NULL AND NULLIF(btrim(l.email),'') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM platform_admins WHERE learner_id=l.id)
 AND NOT EXISTS(SELECT 1 FROM reporting_access WHERE learner_id=l.id)
 AND NOT EXISTS(SELECT 1 FROM store_managers WHERE learner_id=l.id)
 AND NOT EXISTS(SELECT 1 FROM assessor_accounts WHERE learner_id=l.id AND assessor_only)
 AND NOT EXISTS(SELECT 1 FROM organisation_stores WHERE id=l.store_id AND NOT active)
 AND k.occurred_at>=greatest(settings.active_since,COALESCE((settings.enabled_since->>k.kind)::timestamptz,settings.active_since))
 AND k.occurred_at<=at_time AND
 ((k.kind IN ('live_assigned','live_reminder') AND s.status='scheduled' AND e.attendance='assigned' AND s.starts_at>at_time)
 OR (k.kind='live_cancelled' AND e.attendance='cancelled' AND e.recorded_at>at_time-interval '7 days'))
$body$$statement$;
  EXECUTE $statement$CREATE FUNCTION guard_live_evidence() RETURNS trigger LANGUAGE plpgsql AS $body$
  BEGIN
   IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Live training evidence cannot be deleted.'; END IF;
   IF TG_TABLE_NAME='live_certificates' THEN
    IF (to_jsonb(NEW)-ARRAY['revoked_at','revoked_by','revocation_reason']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['revoked_at','revoked_by','revocation_reason'])
     OR OLD.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'Issued certificate evidence is immutable.'; END IF;
   ELSE
    IF (to_jsonb(NEW)-ARRAY['attendance','recorded_at','recorded_by','reason','revision']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['attendance','recorded_at','recorded_by','reason','revision']) THEN RAISE EXCEPTION 'Assigned training evidence is immutable.'; END IF;
   END IF;
   RETURN NEW;
  END $body$$statement$;
  EXECUTE $statement$CREATE TRIGGER live_certificate_guard BEFORE UPDATE OR DELETE ON live_certificates FOR EACH ROW EXECUTE FUNCTION guard_live_evidence()$statement$;
  EXECUTE $statement$CREATE TRIGGER live_enrolment_guard BEFORE UPDATE OR DELETE ON live_enrolments FOR EACH ROW EXECUTE FUNCTION guard_live_evidence()$statement$;
  EXECUTE $statement$CREATE TRIGGER live_evidence_guard BEFORE UPDATE OR DELETE ON live_evidence FOR EACH ROW EXECUTE FUNCTION immutable_lms_evidence()$statement$;
  REVOKE ALL ON FUNCTION guard_live_evidence() FROM PUBLIC;
  IF target<>'lms_template' THEN
   SELECT role_name INTO runtime_role FROM public.lms_clients WHERE schema_name=target;
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON live_trainings,live_sessions,live_enrolments,live_certificates TO %I',runtime_role);
   EXECUTE format('GRANT SELECT,INSERT ON live_evidence TO %I',runtime_role);
   EXECUTE format('GRANT EXECUTE ON FUNCTION guard_live_evidence() TO %I',runtime_role);
   EXECUTE format('GRANT EXECUTE ON FUNCTION learning_email_candidates(timestamptz),learning_email_candidates_before_live(timestamptz) TO %I',runtime_role);
  END IF;
  REVOKE ALL ON live_trainings,live_sessions,live_enrolments,live_certificates,live_evidence FROM PUBLIC;
  REVOKE ALL ON FUNCTION learning_email_candidates(timestamptz),learning_email_candidates_before_live(timestamptz) FROM PUBLIC;
 END LOOP;
 PERFORM set_config('search_path','pg_catalog,public',true);
END $migration$;
INSERT INTO public.lms_schema_tables(name) VALUES('live_trainings'),('live_sessions'),('live_enrolments'),('live_certificates'),('live_evidence');
