ALTER TABLE public.people ADD COLUMN IF NOT EXISTS org_node_id text REFERENCES public.org_nodes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS people_org_node_id_idx ON public.people(org_node_id);