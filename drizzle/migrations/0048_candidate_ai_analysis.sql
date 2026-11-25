ALTER TABLE public.candidates
  ADD COLUMN IF NOT EXISTS ai_score integer,
  ADD COLUMN IF NOT EXISTS ai_jd_fit integer,
  ADD COLUMN IF NOT EXISTS ai_education integer,
  ADD COLUMN IF NOT EXISTS ai_experience integer,
  ADD COLUMN IF NOT EXISTS ai_skills integer,
  ADD COLUMN IF NOT EXISTS ai_publications integer,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz;