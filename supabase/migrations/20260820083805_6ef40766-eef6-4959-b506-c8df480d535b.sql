ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS org_node_id text REFERENCES public.org_nodes(id) ON DELETE SET NULL;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS contract_type text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];