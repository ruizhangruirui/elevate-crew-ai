ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS recruiter_person_id uuid;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS supervisor_person_id uuid;
COMMENT ON COLUMN public.roles.recruiter_person_id IS 'Recruiter owning this hiring position (public.people.id)';
COMMENT ON COLUMN public.roles.supervisor_person_id IS 'Hiring supervisor for this position (public.people.id)';