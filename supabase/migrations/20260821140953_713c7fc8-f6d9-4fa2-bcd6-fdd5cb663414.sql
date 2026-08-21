ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS importance text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;