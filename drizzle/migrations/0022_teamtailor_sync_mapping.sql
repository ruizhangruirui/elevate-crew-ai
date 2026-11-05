CREATE TABLE public.teamtailor_job_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tt_job_id text NOT NULL UNIQUE,
  tt_job_title text,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.teamtailor_job_mappings ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.teamtailor_job_mappings TO service_role;

ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS teamtailor_application_id text;
CREATE INDEX IF NOT EXISTS candidates_tt_app_id_idx ON public.candidates (teamtailor_application_id) WHERE teamtailor_application_id IS NOT NULL;
COMMENT ON COLUMN public.candidates.teamtailor_application_id IS 'Stable TeamTailor job-application ID used for dedupe and status updates on re-sync.';