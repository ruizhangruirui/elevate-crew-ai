CREATE TABLE public.person_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  event_type text NOT NULL DEFAULT 'join',
  reason text,
  detail text,
  effective_on date NOT NULL DEFAULT CURRENT_DATE,
  recorded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.person_lifecycle_events TO authenticated;
GRANT ALL ON public.person_lifecycle_events TO service_role;

ALTER TABLE public.person_lifecycle_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_lifecycle_events_all_authenticated"
ON public.person_lifecycle_events FOR ALL TO authenticated
USING (true) WITH CHECK (true);

CREATE TRIGGER person_lifecycle_events_touch
BEFORE UPDATE ON public.person_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX person_lifecycle_events_person_idx ON public.person_lifecycle_events(person_id);
CREATE INDEX person_lifecycle_events_date_idx ON public.person_lifecycle_events(effective_on);

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

INSERT INTO public.person_lifecycle_events (person_id, event_type, reason, detail, effective_on, recorded_by)
SELECT id, 'join', 'initial_import', 'Backfilled from existing onboard record', created_at::date, 'System'
FROM public.people WHERE status = 'onboard';
