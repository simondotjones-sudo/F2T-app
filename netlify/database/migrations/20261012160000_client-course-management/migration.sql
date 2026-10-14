SELECT pg_advisory_xact_lock(62111700);
DO $migration$
DECLARE target text;
BEGIN
 FOR target IN SELECT schema_name FROM public.lms_clients UNION SELECT 'public' UNION SELECT 'lms_template' LOOP
  EXECUTE format($sql$UPDATE %I.organisation_settings
   SET features=features||'{"client_course_management":{"policy":"disabled","enabled":false}}'::jsonb,
       revision=revision+1
   WHERE NOT features ? 'client_course_management'$sql$,target);
 END LOOP;
END $migration$;
