CREATE TABLE public.pilot_nonces (
  username text NOT NULL PRIMARY KEY,
  nonce text NOT NULL,
  resolved_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pilot_nonces TO anon, authenticated;
GRANT ALL ON public.pilot_nonces TO service_role;

ALTER TABLE public.pilot_nonces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pilot_nonces public read" ON public.pilot_nonces FOR SELECT USING (true);