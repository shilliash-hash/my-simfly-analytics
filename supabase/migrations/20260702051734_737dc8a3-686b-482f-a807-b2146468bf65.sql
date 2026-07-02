-- Weekly Hub Support: one row per pilot per SimFly week.
-- Service-role only. RLS enabled with NO policies for anon/authenticated —
-- all access goes through server functions using supabaseAdmin.

CREATE TABLE IF NOT EXISTS public.hub_support (
  username text NOT NULL,
  week_start_utc timestamptz NOT NULL,
  support_source text NOT NULL CHECK (support_source IN ('airport','donation','admin')),
  qualifying_icao text,
  qualifying_flight_id text,
  qualifying_arrival_at timestamptz,
  activated_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (username, week_start_utc)
);

CREATE INDEX IF NOT EXISTS hub_support_week_idx
  ON public.hub_support (week_start_utc);

GRANT ALL ON public.hub_support TO service_role;

ALTER TABLE public.hub_support ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: table is only accessible via service_role
-- (server functions). This matches backfill_progress / airport_upgrade_cache.
