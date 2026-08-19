ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS domains text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS knowledge text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS leadership text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS experience text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kpa text,
  ADD COLUMN IF NOT EXISTS recommended_action text[] NOT NULL DEFAULT '{}'::text[];