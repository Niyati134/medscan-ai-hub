CREATE TABLE public.shared_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  share_type text NOT NULL DEFAULT 'scan',
  scan_id uuid REFERENCES public.scans(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.family_members(id) ON DELETE CASCADE,
  title text,
  password_hash text,
  expires_at timestamptz,
  revoked boolean NOT NULL DEFAULT false,
  view_count integer NOT NULL DEFAULT 0,
  last_viewed_at timestamptz,
  include_emergency boolean NOT NULL DEFAULT true,
  include_adherence boolean NOT NULL DEFAULT true,
  include_ai boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shared_links_user_idx ON public.shared_links(user_id);
CREATE INDEX shared_links_token_idx ON public.shared_links(token);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shared_links TO authenticated;
GRANT ALL ON public.shared_links TO service_role;

ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own shared links all" ON public.shared_links
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER touch_shared_links_updated_at
  BEFORE UPDATE ON public.shared_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();