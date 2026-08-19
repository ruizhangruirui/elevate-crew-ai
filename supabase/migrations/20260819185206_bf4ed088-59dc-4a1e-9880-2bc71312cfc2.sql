CREATE TABLE public.org_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'tech_share',
  title text NOT NULL,
  happened_on date NOT NULL DEFAULT current_date,
  host text,
  duration_minutes integer,
  direction_id uuid REFERENCES public.directions(id) ON DELETE SET NULL,
  capability_tags text[] NOT NULL DEFAULT '{}'::text[],
  link text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_activities TO authenticated;
GRANT ALL ON public.org_activities TO service_role;
ALTER TABLE public.org_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_activities_all_authenticated" ON public.org_activities
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER org_activities_touch BEFORE UPDATE ON public.org_activities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.org_activity_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES public.org_activities(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (activity_id, person_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_activity_participants TO authenticated;
GRANT ALL ON public.org_activity_participants TO service_role;
ALTER TABLE public.org_activity_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_activity_participants_all_authenticated" ON public.org_activity_participants
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX org_activities_happened_on_idx ON public.org_activities (happened_on DESC);
CREATE INDEX org_activity_participants_person_idx ON public.org_activity_participants (person_id);