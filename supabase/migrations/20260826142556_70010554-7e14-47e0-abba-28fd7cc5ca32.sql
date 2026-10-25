
CREATE TABLE public.favorite_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  place_id text NOT NULL,
  kind text NOT NULL DEFAULT 'pharmacy',
  name text NOT NULL,
  address text,
  phone text,
  lat double precision,
  lng double precision,
  rating numeric,
  maps_uri text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, place_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_places TO authenticated;
GRANT ALL ON public.favorite_places TO service_role;
ALTER TABLE public.favorite_places ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own favorite places all" ON public.favorite_places FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.place_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'pharmacy',
  lat double precision,
  lng double precision,
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.place_searches TO authenticated;
GRANT ALL ON public.place_searches TO service_role;
ALTER TABLE public.place_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own place searches all" ON public.place_searches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX place_searches_user_created_idx ON public.place_searches (user_id, created_at DESC);
