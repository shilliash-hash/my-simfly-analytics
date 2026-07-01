CREATE INDEX IF NOT EXISTS simfly_flights_dep_ts_idx ON public.simfly_flights (departure_icao, mission_start_ts DESC);
CREATE INDEX IF NOT EXISTS simfly_flights_dest_ts_idx ON public.simfly_flights (destination_icao, mission_start_ts DESC);
CREATE INDEX IF NOT EXISTS simfly_flights_aircraft_id_ts_idx ON public.simfly_flights (aircraft_id, mission_start_ts DESC);