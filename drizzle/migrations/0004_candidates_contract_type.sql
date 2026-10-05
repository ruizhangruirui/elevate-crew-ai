-- Recruiting candidates: contract type (Employee / Leased Employee)
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS contract_type text;
GRANT ALL ON public.candidates TO service_role;
