
-- Family members table
CREATE TABLE public.family_members (
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.family_members TO authenticated;
GRANT ALL ON public.family_members TO service_role;

ALTER TABLE public.family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own family members all"
  ON public.family_members FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_family_members_updated_at
  BEFORE UPDATE ON public.family_members
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX family_members_user_idx ON public.family_members(user_id);

-- Link existing records to a family member (null = account owner / primary user)
ALTER TABLE public.scans ADD COLUMN member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
ALTER TABLE public.reminders ADD COLUMN member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;
ALTER TABLE public.medicine_logs ADD COLUMN member_id uuid REFERENCES public.family_members(id) ON DELETE SET NULL;

CREATE INDEX scans_member_idx ON public.scans(member_id);
CREATE INDEX reminders_member_idx ON public.reminders(member_id);
CREATE INDEX medicine_logs_member_idx ON public.medicine_logs(member_id);
