CREATE TABLE public.app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'manager',
  scope_node_ids text[] NOT NULL DEFAULT '{}',
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_role_chk CHECK (role IN ('owner','hr','manager')),
  CONSTRAINT app_users_status_chk CHECK (status IN ('active','disabled'))
);
GRANT ALL ON public.app_users TO service_role;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER app_users_touch BEFORE UPDATE ON public.app_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.app_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_sessions TO service_role;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX app_sessions_user_idx ON public.app_sessions(user_id);

COMMENT ON TABLE public.access_users IS 'DEPRECATED: replaced by app_users';

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['access_users','actions','audit_log','capability_snapshots','config_items','directions','org_activities','org_activity_participants','org_nodes','orgs','people','performance_records','person_lifecycle_events','person_milestones','person_role_fit','roles']
  LOOP
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;