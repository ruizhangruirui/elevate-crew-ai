ALTER TABLE public.people ADD COLUMN IF NOT EXISTS offer_title text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
GRANT ALL ON public.people TO service_role;
GRANT ALL ON public.candidates TO service_role;