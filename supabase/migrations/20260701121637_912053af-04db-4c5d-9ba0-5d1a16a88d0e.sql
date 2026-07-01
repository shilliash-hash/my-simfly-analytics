
CREATE TABLE public.airport_upgrade_cache (
  icao text NOT NULL,
  tier integer NOT NULL,
  level integer NOT NULL,
  window_days integer NOT NULL,
  row jsonb NOT NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  refresh_after timestamptz NOT NULL,
  last_manual_refresh_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (icao, tier, level, window_days)
);
GRANT SELECT ON public.airport_upgrade_cache TO anon, authenticated;
GRANT ALL ON public.airport_upgrade_cache TO service_role;
ALTER TABLE public.airport_upgrade_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "airport_upgrade_cache public read" ON public.airport_upgrade_cache FOR SELECT USING (true);

CREATE TABLE public.app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.app_settings TO anon, authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "app_settings public read" ON public.app_settings FOR SELECT USING (true);

INSERT INTO public.app_settings (key, value) VALUES ('airport_upgrade_ttl_days', '30'::jsonb)
ON CONFLICT (key) DO NOTHING;
