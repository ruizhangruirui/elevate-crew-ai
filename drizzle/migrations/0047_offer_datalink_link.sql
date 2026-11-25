ALTER TABLE public.offer_requests
  ADD COLUMN IF NOT EXISTS datalink_id text,
  ADD COLUMN IF NOT EXISTS datalink_status text,
  ADD COLUMN IF NOT EXISTS datalink_approver text,
  ADD COLUMN IF NOT EXISTS datalink_error text,
  ADD COLUMN IF NOT EXISTS datalink_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS datalink_synced_at timestamptz;