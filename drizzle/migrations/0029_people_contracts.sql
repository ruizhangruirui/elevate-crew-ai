ALTER TABLE public.people ADD COLUMN IF NOT EXISTS fixed_term boolean NOT NULL DEFAULT false;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS contract_end_on date;
CREATE TABLE IF NOT EXISTS public.person_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes integer NOT NULL DEFAULT 0,
  file_data text NOT NULL,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS person_contracts_person_idx ON public.person_contracts(person_id);
GRANT ALL ON public.person_contracts TO service_role;
ALTER TABLE public.person_contracts ENABLE ROW LEVEL SECURITY;