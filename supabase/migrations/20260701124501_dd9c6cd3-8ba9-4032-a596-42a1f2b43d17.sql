
DROP POLICY IF EXISTS "airport_upgrade_cache public read" ON public.airport_upgrade_cache;
DROP POLICY IF EXISTS "app_settings public read" ON public.app_settings;
DROP POLICY IF EXISTS "backfill_progress public read" ON public.backfill_progress;
DROP POLICY IF EXISTS "pilot_nonces public read" ON public.pilot_nonces;
DROP POLICY IF EXISTS "simfly_flights public read" ON public.simfly_flights;

REVOKE SELECT ON public.airport_upgrade_cache FROM anon, authenticated;
REVOKE SELECT ON public.app_settings FROM anon, authenticated;
REVOKE SELECT ON public.backfill_progress FROM anon, authenticated;
REVOKE SELECT ON public.pilot_nonces FROM anon, authenticated;
REVOKE SELECT ON public.simfly_flights FROM anon, authenticated;

GRANT ALL ON public.airport_upgrade_cache TO service_role;
GRANT ALL ON public.app_settings TO service_role;
GRANT ALL ON public.backfill_progress TO service_role;
GRANT ALL ON public.pilot_nonces TO service_role;
GRANT ALL ON public.simfly_flights TO service_role;
