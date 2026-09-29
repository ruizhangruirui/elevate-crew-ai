-- App-owned accounts & sessions (replaces Supabase Auth). Idempotent: matches the live schema.
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'manager',
  scope_node_ids text[] NOT NULL DEFAULT '{}'::text[],
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_users_pkey PRIMARY KEY (id),
  CONSTRAINT app_users_email_key UNIQUE (email),
  CONSTRAINT app_users_role_chk CHECK (role = ANY (ARRAY['owner'::text, 'hr'::text, 'manager'::text])),
  CONSTRAINT app_users_status_chk CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]))
);

CREATE TABLE IF NOT EXISTS public.app_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT app_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT app_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON public.app_sessions USING btree (user_id);

-- Server-only tables: no browser roles.
REVOKE ALL ON public.app_users FROM anon, authenticated;
REVOKE ALL ON public.app_sessions FROM anon, authenticated;
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_sessions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS app_users_touch ON public.app_users;
CREATE TRIGGER app_users_touch BEFORE UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();