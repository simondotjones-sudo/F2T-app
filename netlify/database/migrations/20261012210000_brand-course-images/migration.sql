-- Images are compact, validated raster data attached to existing records.
SELECT pg_advisory_xact_lock(62111700);
ALTER TABLE public.lms_clients ADD COLUMN login_background text;
ALTER TABLE public.lms_clients ADD CONSTRAINT client_background_size CHECK(login_background IS NULL OR length(login_background)<=500000);
DO $$ DECLARE target text; BEGIN
 FOR target IN SELECT DISTINCT name FROM (SELECT 'public' AS name UNION ALL SELECT 'lms_template' UNION ALL SELECT schema_name FROM public.lms_clients) schemas LOOP
  EXECUTE format('ALTER TABLE %I.courses ADD COLUMN cover_image text CHECK(cover_image IS NULL OR length(cover_image)<=500000)',target);
 END LOOP;
END $$;
