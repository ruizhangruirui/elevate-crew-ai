ALTER TABLE public.people ADD COLUMN IF NOT EXISTS staff_id text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS hire_date date;
CREATE UNIQUE INDEX IF NOT EXISTS people_staff_id_unique ON public.people (staff_id) WHERE staff_id IS NOT NULL AND archived = false;
COMMENT ON COLUMN public.people.tenure_months IS 'DEPRECATED: tenure is derived from hire_date';