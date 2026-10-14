-- Registry-only preferences; no client application tables are added or changed.
SELECT pg_advisory_xact_lock(62111700);
ALTER TABLE public.lms_clients
 ADD COLUMN default_language text NOT NULL DEFAULT 'en'
 CHECK(default_language IN ('en','es','fr','de','it','nl','pt','pl','ro','cs','sk','sl','hu','ar')),
 ADD COLUMN location_term text CHECK(location_term IN ('site','store'));
-- NULL retains legacy wording for existing clients until explicitly selected.
