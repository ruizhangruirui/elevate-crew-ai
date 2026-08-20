CREATE TABLE public.actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  detail text,
  source_kind text NOT NULL DEFAULT 'manual',
  source_key text,
  role_id uuid REFERENCES public.roles(id) ON DELETE SET NULL,
  person_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  org_node_id text REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  owner text,
  due_on date,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'todo',
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.actions TO authenticated;
GRANT ALL ON public.actions TO service_role;

ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "actions_all_authenticated" ON public.actions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER actions_touch BEFORE UPDATE ON public.actions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX actions_status_idx ON public.actions (status, due_on);
CREATE INDEX actions_source_idx ON public.actions (source_kind, source_key);