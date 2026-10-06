ALTER TABLE public.people ADD COLUMN IF NOT EXISTS offer_title text;
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium';
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS appointed_role_title text;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS employment_mode text;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS location text;
CREATE TABLE IF NOT EXISTS public.team_achievements (
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
CREATE TABLE IF NOT EXISTS public.team_achievement_contributors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  achievement_id uuid NOT NULL REFERENCES public.team_achievements(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (achievement_id, person_id)
);
GRANT ALL ON public.team_achievement_contributors TO service_role;
ALTER TABLE public.team_achievement_contributors ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS team_achievements_org_node_idx ON public.team_achievements(org_node_id);
CREATE INDEX IF NOT EXISTS team_achievements_date_idx ON public.team_achievements(achieved_on DESC);
CREATE INDEX IF NOT EXISTS team_achievement_contributors_person_idx ON public.team_achievement_contributors(person_id);
DROP TRIGGER IF EXISTS touch_team_achievements_updated_at ON public.team_achievements;
CREATE TRIGGER touch_team_achievements_updated_at
BEFORE UPDATE ON public.team_achievements
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
INSERT INTO public.config_items (category, name, active, sort_order)
SELECT 'achievementTypes', v.name, true, v.ord FROM (VALUES ('Patent', 1), ('Publication', 2), ('Team Contribution', 3)) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.config_items c WHERE c.category = 'achievementTypes' AND c.name = v.name);
INSERT INTO public.config_items (category, name, active, sort_order)
SELECT 'locations', v.name, true, v.ord FROM (VALUES ('Zurich', 1), ('Lausanne', 2)) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.config_items c WHERE c.category = 'locations' AND c.name = v.name);