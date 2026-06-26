
CREATE TABLE public.backfill_progress (
  username text PRIMARY KEY,
  status text NOT NULL DEFAULT 'idle',
  total_pages integer NOT NULL DEFAULT 0,
  current_page integer NOT NULL DEFAULT 0,
  flights_imported integer NOT NULL DEFAULT 0,
  flights_total_est integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz,
  last_page_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.backfill_progress TO anon, authenticated;
GRANT ALL ON public.backfill_progress TO service_role;
ALTER TABLE public.backfill_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "backfill_progress public read" ON public.backfill_progress FOR SELECT USING (true);

CREATE TABLE public.simfly_flights (
  username text NOT NULL,
  flight_id text NOT NULL,
  mission_start_ts timestamptz,
  aircraft text,
  aircraft_icao text,
  aircraft_id text,
  aircraft_tail_number text,
  departure_icao text,
  destination_icao text,
  landing_rate numeric,
  total_distance numeric,
  flight_time text,
  total_reward numeric,
  pax numeric,
  xp numeric,
  licence text,
  licence_rank integer,
  licence_rank_name text,
  origin_name text,
  destination_name text,
  raw jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (username, flight_id)
);
GRANT SELECT ON public.simfly_flights TO anon, authenticated;
GRANT ALL ON public.simfly_flights TO service_role;
ALTER TABLE public.simfly_flights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "simfly_flights public read" ON public.simfly_flights FOR SELECT USING (true);
CREATE INDEX simfly_flights_user_ts_idx ON public.simfly_flights (username, mission_start_ts DESC);
