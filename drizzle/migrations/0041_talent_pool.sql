CREATE TABLE public.talent_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  location text,
  linkedin_url text,
  cv_url text,
  cv_text text,
  headline text,
  notes text,
  tags text[] NOT NULL DEFAULT '{}',
  source text NOT NULL DEFAULT 'Manual',
  teamtailor_candidate_id text UNIQUE,
  ai_score integer,
  ai_summary text,
  ai_directions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_role_matches jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_analyzed_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.talent_pool TO service_role;
ALTER TABLE public.talent_pool ENABLE ROW LEVEL SECURITY;