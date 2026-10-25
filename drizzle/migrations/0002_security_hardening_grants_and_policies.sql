-- 1. Defence in depth: no anonymous Data API access to any healthcare table.
--    All policies are already scoped to `authenticated`; this removes the
--    default blanket grants so anon cannot even attempt a read.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t.relname);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t.relname);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t.relname);
  END LOOP;
END $$;

-- 2. profiles UPDATE had no WITH CHECK: a user could rewrite the row's id.
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Price cache holds no personal data, but keep it read-only for users.
REVOKE INSERT, UPDATE, DELETE ON public.price_comparisons FROM authenticated;

-- 4. Audit log and roles are read-only through the API (writes = service role).
REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.user_roles FROM authenticated;
