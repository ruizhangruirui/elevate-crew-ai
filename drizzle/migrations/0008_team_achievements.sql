CREATE TABLE public.team_achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_type text NOT NULL,
  title text NOT NULL,
  achieved_on date NOT NULL,
  org_node_id text REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  link text,
  note text,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.team_achievements TO service_role;
ALTER TABLE public.team_achievements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.team_achievement_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id uuid NOT NULL REFERENCES public.team_achievements(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (achievement_id, person_id)
);
GRANT ALL ON public.team_achievement_contributors TO service_role;
ALTER TABLE public.team_achievement_contributors ENABLE ROW LEVEL SECURITY;

CREATE INDEX team_achievements_org_node_idx ON public.team_achievements(org_node_id);
CREATE INDEX team_achievements_date_idx ON public.team_achievements(achieved_on DESC);
CREATE INDEX team_achievement_contributors_person_idx ON public.team_achievement_contributors(person_id);

CREATE TRIGGER touch_team_achievements_updated_at
BEFORE UPDATE ON public.team_achievements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();