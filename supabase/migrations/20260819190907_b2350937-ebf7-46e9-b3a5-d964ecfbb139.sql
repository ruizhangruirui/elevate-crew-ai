CREATE TABLE public.capability_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  taken_on date NOT NULL DEFAULT CURRENT_DATE,
  scope_node_id text REFERENCES public.org_nodes(id) ON DELETE SET NULL,
  total_caps integer NOT NULL DEFAULT 0,
  covered_caps integer NOT NULL DEFAULT 0,
  blank_caps integer NOT NULL DEFAULT 0,
  single_caps integer NOT NULL DEFAULT 0,
  coverage_rate integer NOT NULL DEFAULT 0,
  onboard_people integer NOT NULL DEFAULT 0,
  target_seats integer NOT NULL DEFAULT 0,
  activities_90d integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.capability_snapshots TO authenticated;
GRANT ALL ON public.capability_snapshots TO service_role;

ALTER TABLE public.capability_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "capability_snapshots_all_authenticated"
  ON public.capability_snapshots FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

CREATE UNIQUE INDEX capability_snapshots_day_scope_idx
  ON public.capability_snapshots (taken_on, COALESCE(scope_node_id, '__all__'));