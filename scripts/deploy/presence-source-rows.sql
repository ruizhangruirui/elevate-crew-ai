-- Apply explicitly before deploying the Presence correction (both DB modes).
-- One SELECT reads both tables under one PostgreSQL statement snapshot.
-- Aggregating into one row avoids the cloud Data API's 1000-row cap.
-- No authentication or business-table changes; no persistent snapshot data.
BEGIN;
CREATE OR REPLACE VIEW public.presence_source_rows AS
SELECT
  COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM (
    SELECT id, name, org_node_id, supervisor_id, is_leader, archived,
           status, company_email, updated_at FROM public.people
  ) p), '[]'::jsonb) AS people,
  COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM (
    SELECT id, parent_id, name, type, archived, updated_at FROM public.org_nodes
  ) n), '[]'::jsonb) AS nodes;

REVOKE ALL ON public.presence_source_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.presence_source_rows TO service_role;
COMMIT;