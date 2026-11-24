ALTER TABLE public.talent_pool ADD COLUMN IF NOT EXISTS current_title text;
ALTER TABLE public.talent_pool ADD COLUMN IF NOT EXISTS education text[] NOT NULL DEFAULT '{}';