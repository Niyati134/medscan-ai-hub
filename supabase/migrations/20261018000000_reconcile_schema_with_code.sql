-- =============================================================================
-- MedScan AI Hub - reconcile the database schema with the application code.
--
-- WHY: the local Supabase project is not the original Lovable project, so some
-- objects the code relies on were missing or different (PGRST205 / PGRST202 /
-- PGRST204 / 42703 errors). This script makes the schema match what the source
-- actually reads and writes.
--
-- SAFE TO RE-RUN: every statement is idempotent. It runs the same on a brand-new
-- project, on the original Lovable schema, and on a partially repaired project.
-- It NEVER drops a table, a column or any data.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- (or `supabase db push` if you use the Supabase CLI.)
--
-- Tables the code uses (verified by auditing every .from()/.rpc()/storage call):
--   profiles, family_members, scans, chat_messages, medicine_logs, reminders,
--   shared_links, price_comparisons, alternative_selections, favorite_places,
--   place_searches, user_roles, admin_audit_log, function has_role(),
--   storage bucket "prescriptions".
-- NOTE: the code does NOT use tables called "places" or "shares" (it uses
--   favorite_places / place_searches / shared_links). If you created those by
--   hand they are unused; this script only locks them down (see section 12).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared helper: keep updated_at fresh
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles   (code reads/writes: display_name, avatar_url, blood_group,
--    allergies, emergency_contact_*, preferred_language, created_at, updated_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  -- Used by the chat assistant, the profile page and the admin console. This
  -- column was missing from the original migrations folder.
  ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Auto-create a profile row for every new signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Users who signed up before the trigger existed would have no profile row.
INSERT INTO public.profiles (id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'display_name', split_part(u.email, '@', 1))
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. family_members   (must exist before scans/reminders/... reference it)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text NOT NULL DEFAULT 'Other',
  gender text,
  date_of_birth date,
  age integer,
  blood_group text,
  allergies text,
  medical_conditions text,
  emergency_contact_name text,
  emergency_contact_phone text,
  avatar_url text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.family_members
  ADD COLUMN IF NOT EXISTS relationship text NOT NULL DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS medical_conditions text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS family_members_user_idx ON public.family_members(user_id);
DROP TRIGGER IF EXISTS trg_family_members_updated_at ON public.family_members;
CREATE TRIGGER trg_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 3. scans   (code inserts: user_id, member_id, file_name, image_path,
--    ocr_text, medicines, status; reads those + id, created_at)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  file_name text NOT NULL DEFAULT 'prescription',
  image_path text NOT NULL DEFAULT '',
  ocr_text text,
  medicines jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A scans table that pre-dates this code (id, user_id, image_url, extracted_text,
-- created_at, member_id) gets the missing columns added here.
ALTER TABLE public.scans
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS image_path text,
  ADD COLUMN IF NOT EXISTS ocr_text text,
  ADD COLUMN IF NOT EXISTS medicines jsonb,
  ADD COLUMN IF NOT EXISTS status text;

DO $$
BEGIN
  -- Legacy columns from the earlier schema: keep their data, but make sure they
  -- can never block an insert (the code does not write them).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'scans' AND column_name = 'image_url') THEN
    EXECUTE 'ALTER TABLE public.scans ALTER COLUMN image_url DROP NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'scans' AND column_name = 'extracted_text') THEN
    EXECUTE 'ALTER TABLE public.scans ALTER COLUMN extracted_text DROP NOT NULL';
    EXECUTE 'UPDATE public.scans SET ocr_text = extracted_text WHERE ocr_text IS NULL AND extracted_text IS NOT NULL';
  END IF;
END $$;

UPDATE public.scans SET file_name = 'prescription' WHERE file_name IS NULL;
UPDATE public.scans SET image_path = '' WHERE image_path IS NULL;
UPDATE public.scans SET medicines = '[]'::jsonb WHERE medicines IS NULL;
UPDATE public.scans SET status = 'completed' WHERE status IS NULL;

ALTER TABLE public.scans
  ALTER COLUMN file_name SET DEFAULT 'prescription',
  ALTER COLUMN file_name SET NOT NULL,
  ALTER COLUMN image_path SET DEFAULT '',
  ALTER COLUMN image_path SET NOT NULL,
  ALTER COLUMN medicines SET DEFAULT '[]'::jsonb,
  ALTER COLUMN medicines SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'completed',
  ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS scans_user_idx ON public.scans(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS scans_member_idx ON public.scans(member_id);

-- ---------------------------------------------------------------------------
-- 4. chat_messages   (code uses user_id, conversation_id, role, content, created_at)
--    conversation_id was added locally in the code but never made it into any
--    migration - that is what broke chat history / New Chat on a fresh database.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS conversation_id uuid;

-- Messages saved before conversations existed are grouped into ONE legacy
-- conversation per user (deterministic id, so re-running changes nothing).
UPDATE public.chat_messages
SET conversation_id = md5(user_id::text || ':legacy-conversation')::uuid
WHERE conversation_id IS NULL;

ALTER TABLE public.chat_messages ALTER COLUMN conversation_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS chat_user_idx ON public.chat_messages(user_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_user_conversation_idx
  ON public.chat_messages(user_id, conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- 5. medicine_logs, reminders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medicine_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scan_id uuid NOT NULL,
  medicine_id text NOT NULL,
  medicine_name text NOT NULL,
  slot text NOT NULL,
  taken_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  taken_at timestamptz NOT NULL DEFAULT now(),
  member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  UNIQUE (user_id, scan_id, medicine_id, slot, taken_on)
);
ALTER TABLE public.medicine_logs
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS medicine_logs_user_date_idx ON public.medicine_logs(user_id, taken_on DESC);
CREATE INDEX IF NOT EXISTS medicine_logs_member_idx ON public.medicine_logs(member_id);

CREATE TABLE IF NOT EXISTS public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scan_id uuid,
  medicine_name text NOT NULL,
  dosage text,
  notes text,
  times text[] NOT NULL DEFAULT ARRAY[]::text[],
  days_of_week int[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6]::int[],
  start_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  snooze_until timestamptz,
  member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS reminders_user_active_idx ON public.reminders(user_id, active);
CREATE INDEX IF NOT EXISTS reminders_member_idx ON public.reminders(member_id);
DROP TRIGGER IF EXISTS reminders_touch_updated_at ON public.reminders;
CREATE TRIGGER reminders_touch_updated_at
  BEFORE UPDATE ON public.reminders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 6. shared_links   (NOT "shares")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shared_links (
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
  failed_attempts integer NOT NULL DEFAULT 0,
  lock_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lock_until timestamptz;
CREATE INDEX IF NOT EXISTS shared_links_user_idx ON public.shared_links(user_id);
CREATE INDEX IF NOT EXISTS shared_links_token_idx ON public.shared_links(token);
DROP TRIGGER IF EXISTS touch_shared_links_updated_at ON public.shared_links;
CREATE TRIGGER touch_shared_links_updated_at
  BEFORE UPDATE ON public.shared_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 7. price_comparisons (shared AI price cache, written by the server with the
--    service role) and alternative_selections (per user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.price_comparisons (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medicine_key text NOT NULL UNIQUE,
  brand_name text NOT NULL,
  generic_name text,
  manufacturer text,
  market_price numeric(10,2) DEFAULT 0,
  price_per_strip numeric(10,2) DEFAULT 0,
  price_per_tablet numeric(10,2) DEFAULT 0,
  pack_size int DEFAULT 10,
  alternatives jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitution_notes text,
  warnings text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_price_comparisons_updated ON public.price_comparisons;
CREATE TRIGGER trg_price_comparisons_updated
  BEFORE UPDATE ON public.price_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.alternative_selections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_id uuid REFERENCES public.scans(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  original_price numeric(10,2) NOT NULL DEFAULT 0,
  alternative_name text NOT NULL,
  alternative_manufacturer text,
  alternative_price numeric(10,2) NOT NULL DEFAULT 0,
  savings numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alt_selections_user ON public.alternative_selections(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 8. favorite_places / place_searches (NOT "places")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.favorite_places (
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

CREATE TABLE IF NOT EXISTS public.place_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  query text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'pharmacy',
  lat double precision,
  lng double precision,
  result_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS place_searches_user_created_idx ON public.place_searches(user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 9. Admin: user_roles, has_role(), admin_audit_log
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. Row Level Security (never disabled) + policies
--     Every user-owned table: a signed-in user can only touch rows where
--     user_id = auth.uid(). Policies are dropped and re-created so re-running
--     this script always converges to the same state.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_members         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scans                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicine_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reminders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_links           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_comparisons      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alternative_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_places        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_searches         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_log        ENABLE ROW LEVEL SECURITY;

-- profiles (the row id IS the user id)
DROP POLICY IF EXISTS "own profile select" ON public.profiles;
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "own family members all" ON public.family_members;
CREATE POLICY "own family members all" ON public.family_members FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own scans all" ON public.scans;
CREATE POLICY "own scans all" ON public.scans FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own chat all" ON public.chat_messages;
CREATE POLICY "own chat all" ON public.chat_messages FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own medicine logs all" ON public.medicine_logs;
CREATE POLICY "own medicine logs all" ON public.medicine_logs FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own reminders all" ON public.reminders;
CREATE POLICY "own reminders all" ON public.reminders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own shared links all" ON public.shared_links;
CREATE POLICY "own shared links all" ON public.shared_links FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage their own selections" ON public.alternative_selections;
CREATE POLICY "Users manage their own selections" ON public.alternative_selections FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own favorite places all" ON public.favorite_places;
CREATE POLICY "own favorite places all" ON public.favorite_places FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own place searches all" ON public.place_searches;
CREATE POLICY "own place searches all" ON public.place_searches FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Price cache: shared, contains no personal data -> read-only for users
-- (the server fills it with the service-role key).
DROP POLICY IF EXISTS "Anyone signed in can read price cache" ON public.price_comparisons;
CREATE POLICY "Anyone signed in can read price cache" ON public.price_comparisons
  FOR SELECT TO authenticated USING (true);

-- Roles / audit log: read-only through the API (writes = service role only)
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "admins read all roles" ON public.user_roles;
CREATE POLICY "admins read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
DROP POLICY IF EXISTS "admins read audit log" ON public.admin_audit_log;
CREATE POLICY "admins read audit log" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 11. Table grants (defence in depth on top of RLS): no anonymous access to any
--     healthcare table; signed-in users get only what the app needs.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles','family_members','scans','chat_messages','medicine_logs','reminders',
    'shared_links','price_comparisons','alternative_selections','favorite_places',
    'place_searches','user_roles','admin_audit_log'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE INSERT, UPDATE, DELETE ON public.price_comparisons FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;

-- ---------------------------------------------------------------------------
-- 12. Any OTHER table in the public schema (for example hand-made "places" /
--     "shares" tables the code never uses) is locked down: RLS on and no anon
--     access. Nothing is dropped. Service-role access is unaffected.
-- ---------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname <> ALL (ARRAY[
        'profiles','family_members','scans','chat_messages','medicine_logs','reminders',
        'shared_links','price_comparisons','alternative_selections','favorite_places',
        'place_searches','user_roles','admin_audit_log'
      ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    RAISE NOTICE 'Table public.% is not used by MedScan AI; RLS enabled and anon access revoked. Drop it manually if you do not need it.', r.relname;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 13. Storage: PRIVATE "prescriptions" bucket. Files live under "<user_id>/..."
--     and only that user may read/write/delete them. The bucket stays private
--     (signed URLs only) and now also enforces a 10 MB limit and image/PDF types.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'prescriptions', 'prescriptions', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 10485760,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'];

DROP POLICY IF EXISTS "own prescriptions select" ON storage.objects;
DROP POLICY IF EXISTS "own prescriptions insert" ON storage.objects;
DROP POLICY IF EXISTS "own prescriptions delete" ON storage.objects;
CREATE POLICY "own prescriptions select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own prescriptions insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own prescriptions delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'prescriptions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Ask PostgREST to reload its schema cache so new columns/tables are visible
-- immediately (fixes PGRST204 / PGRST205 right after running this script).
NOTIFY pgrst, 'reload schema';
