
CREATE TABLE public.price_comparisons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medicine_key TEXT NOT NULL UNIQUE,
  brand_name TEXT NOT NULL,
  generic_name TEXT,
  manufacturer TEXT,
  market_price NUMERIC(10,2) DEFAULT 0,
  price_per_strip NUMERIC(10,2) DEFAULT 0,
  price_per_tablet NUMERIC(10,2) DEFAULT 0,
  pack_size INT DEFAULT 10,
  alternatives JSONB NOT NULL DEFAULT '[]'::jsonb,
  substitution_notes TEXT,
  warnings TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_comparisons TO authenticated;
GRANT ALL ON public.price_comparisons TO service_role;
ALTER TABLE public.price_comparisons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read price cache"
  ON public.price_comparisons FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_price_comparisons_updated
  BEFORE UPDATE ON public.price_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.alternative_selections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id UUID REFERENCES public.scans(id) ON DELETE CASCADE,
  member_id UUID REFERENCES public.family_members(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  original_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  alternative_name TEXT NOT NULL,
  alternative_manufacturer TEXT,
  alternative_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  savings NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alternative_selections TO authenticated;
GRANT ALL ON public.alternative_selections TO service_role;
ALTER TABLE public.alternative_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own selections"
  ON public.alternative_selections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_alt_selections_user ON public.alternative_selections(user_id, created_at DESC);
