ALTER TABLE public.people ADD COLUMN IF NOT EXISTS supervisor_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS workload_pct integer DEFAULT 100;

CREATE TABLE IF NOT EXISTS public.reference_letters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  supervisor_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested',
  facts jsonb NOT NULL DEFAULT '{}'::jsonb,
  intro_text text NOT NULL DEFAULT '',
  supervisor_text text,
  closing_text text,
  hr_note text,
  requested_by text,
  submitted_by text,
  approved_by text,
  submitted_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.reference_letters TO service_role;
ALTER TABLE public.reference_letters ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER reference_letters_touch BEFORE UPDATE ON public.reference_letters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();