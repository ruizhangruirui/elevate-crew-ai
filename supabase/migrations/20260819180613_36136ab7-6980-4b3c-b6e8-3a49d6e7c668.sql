ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS assessed_skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS performance text,
  ADD COLUMN IF NOT EXISTS tenure_months integer,
  ADD COLUMN IF NOT EXISTS prior_experience text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS readiness text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS attrition_risk text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS assessed_by text,
  ADD COLUMN IF NOT EXISTS assessed_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.person_role_fit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  fit_score integer NOT NULL DEFAULT 0,
  summary text,
  strengths text[] NOT NULL DEFAULT '{}'::text[],
  gaps text[] NOT NULL DEFAULT '{}'::text[],
  recommendation text,
  source text NOT NULL DEFAULT 'ai',
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (person_id, role_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_role_fit TO authenticated;
GRANT ALL ON public.person_role_fit TO service_role;

ALTER TABLE public.person_role_fit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_role_fit_all_authenticated"
  ON public.person_role_fit FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE TRIGGER person_role_fit_touch
  BEFORE UPDATE ON public.person_role_fit
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();