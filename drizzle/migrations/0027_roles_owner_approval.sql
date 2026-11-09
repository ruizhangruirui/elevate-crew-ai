ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS approval_request jsonb;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS requested_by text;