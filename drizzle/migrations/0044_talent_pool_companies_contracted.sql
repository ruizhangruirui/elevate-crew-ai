ALTER TABLE public.talent_pool ADD COLUMN IF NOT EXISTS current_company text;
ALTER TABLE public.talent_pool ADD COLUMN IF NOT EXISTS previous_companies text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.talent_pool ADD COLUMN IF NOT EXISTS contracted boolean;COMMENT ON COLUMN public.talent_pool.contracted IS 'Recruiter has contacted this talent (manual flag).';
