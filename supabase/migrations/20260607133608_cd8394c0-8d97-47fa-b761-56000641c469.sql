
CREATE TABLE public.reminders (
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
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT ALL ON public.reminders TO service_role;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reminders all" ON public.reminders
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER reminders_touch_updated_at
BEFORE UPDATE ON public.reminders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX reminders_user_active_idx ON public.reminders(user_id, active);
