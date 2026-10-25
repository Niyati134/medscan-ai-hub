
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blood_group text,
  ADD COLUMN IF NOT EXISTS allergies text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text;

CREATE TABLE IF NOT EXISTS public.medicine_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scan_id uuid NOT NULL,
  medicine_id text NOT NULL,
  medicine_name text NOT NULL,
  slot text NOT NULL,
  taken_on date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  taken_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scan_id, medicine_id, slot, taken_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicine_logs TO authenticated;
GRANT ALL ON public.medicine_logs TO service_role;

ALTER TABLE public.medicine_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own medicine logs all" ON public.medicine_logs
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS medicine_logs_user_date_idx ON public.medicine_logs(user_id, taken_on DESC);
