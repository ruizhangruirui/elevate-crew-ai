CREATE TABLE public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  current_company text,
  current_title text,
  location text,
  source text,
  cv_url text,
  linkedin_url text,
  stage text,
  outcome text NOT NULL DEFAULT 'active',
  rating integer,
  recruiter text,
  next_step text,
  next_step_on date,
  notes text,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidates_role_idx ON public.candidates(role_id);
GRANT ALL ON public.candidates TO service_role;
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER candidates_touch BEFORE UPDATE ON public.candidates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.candidate_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'note',
  stage text,
  outcome text,
  interviewer text,
  note text,
  happened_on date NOT NULL DEFAULT CURRENT_DATE,
  actor text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidate_events_candidate_idx ON public.candidate_events(candidate_id);
GRANT ALL ON public.candidate_events TO service_role;
ALTER TABLE public.candidate_events ENABLE ROW LEVEL SECURITY;