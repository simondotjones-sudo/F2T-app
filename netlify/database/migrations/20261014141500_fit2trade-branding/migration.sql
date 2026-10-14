-- Rename this installation's internal client without changing its identity, schema or records.
SELECT pg_advisory_xact_lock(62111700);

ALTER TABLE public.lms_clients ALTER COLUMN logo_url SET DEFAULT '/branding/fit2trade-logo.svg';
ALTER TABLE public.lms_clients ALTER COLUMN theme_color SET DEFAULT '#2E6052';

DO $branding$
DECLARE client record; fit2trade_id bigint;
BEGIN
 SELECT id INTO fit2trade_id FROM public.lms_clients WHERE slug='fit2trade' AND active FOR UPDATE;
 IF fit2trade_id IS NOT NULL AND fit2trade_id<>2 THEN
  -- The owner already created Fit2Trade. Remove the old default from the active list,
  -- retaining its schema and all records instead of creating a duplicate client.
  UPDATE public.lms_clients SET active=false,revision=revision+1,updated_at=now()
   WHERE id=2 AND slug='eazysafe-internal' AND active;
  IF FOUND THEN
   INSERT INTO public.lms_client_audit(client_id,actor,action,details)
    VALUES(2,'migration:fit2trade-branding','archived',jsonb_build_object('reason','Replaced in the active client list by existing Fit2Trade client','fit2tradeClientId',fit2trade_id));
  END IF;
 END IF;
 FOR client IN SELECT * FROM public.lms_clients
  WHERE active AND ((id=2 AND slug='eazysafe-internal' AND (name<>'Fit2Trade' OR theme_color<>'#2E6052')) OR logo_url='/branding/eazysafe-logo.png' OR (id=fit2trade_id AND theme_color<>'#2E6052'))
  FOR UPDATE
 LOOP
  UPDATE public.lms_clients SET
   name=CASE WHEN client.id=2 AND client.slug='eazysafe-internal' THEN 'Fit2Trade' ELSE name END,
   logo_url=CASE WHEN logo_url='/branding/eazysafe-logo.png' OR (client.id=2 AND client.slug='eazysafe-internal') THEN '/branding/fit2trade-logo.svg' ELSE logo_url END,
   theme_color=CASE WHEN (client.id=2 AND client.slug='eazysafe-internal') OR client.id=fit2trade_id THEN '#2E6052' ELSE theme_color END,
   revision=revision+1,updated_at=now()
  WHERE id=client.id;
  INSERT INTO public.lms_client_audit(client_id,actor,action,details)
   VALUES(client.id,'migration:fit2trade-branding','settings_updated',jsonb_build_object('previousName',client.name,'previousSlug',client.slug,'previousLogo',client.logo_url,'previousColour',client.theme_color,'reason','Fit2Trade platform branding'));
  IF client.id=2 AND client.slug='eazysafe-internal' THEN
   -- Keep the site ID stable because learner and reporting records reference it.
   EXECUTE format('UPDATE %I.organisation_stores SET name=''Fit2Trade'',updated_by=''migration:fit2trade-branding'',updated_at=now()::text WHERE id=''eazysafe-internal'' AND name=''EazySafe Internal''',client.schema_name);
  END IF;
 END LOOP;
END $branding$;
