CREATE TABLE public.person_milestones (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'award',
  title text NOT NULL,
  detail text,
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  issuer text,
  from_level integer,
  to_level integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_milestones TO authenticated;
GRANT ALL ON public.person_milestones TO service_role;

ALTER TABLE public.person_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_milestones_all_authenticated" ON public.person_milestones
FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER person_milestones_touch_updated_at
BEFORE UPDATE ON public.person_milestones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX person_milestones_person_id_idx ON public.person_milestones(person_id);