ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS datalink_stage text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS datalink_updated_at timestamptz;