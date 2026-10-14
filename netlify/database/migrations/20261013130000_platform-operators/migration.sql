-- Global authentication only: deliberately excluded from lms_schema_tables,
-- lms_template and client schemas. Client runtime roles receive no grants.
SELECT pg_advisory_xact_lock(62111700);
CREATE TABLE public.lms_platform_operators (
 email text PRIMARY KEY CHECK(email=lower(btrim(email))),
 name text NOT NULL CHECK(length(btrim(name)) BETWEEN 2 AND 100),
 password_hash text,
 code_hash text UNIQUE,
 code_expires_at timestamptz,
 created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 activated_at timestamptz,
 disabled_at timestamptz,
 CHECK ((code_hash IS NULL) = (code_expires_at IS NULL))
);
CREATE TABLE public.lms_platform_operator_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor text NOT NULL,
 email text NOT NULL,
 action text NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.lms_platform_operators,public.lms_platform_operator_audit FROM PUBLIC;
REVOKE ALL ON SEQUENCE public.lms_platform_operator_audit_id_seq FROM PUBLIC;
