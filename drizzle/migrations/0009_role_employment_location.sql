ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS employment_mode text;
ALTER TABLE public.roles ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS location text;
INSERT INTO public.config_items (category, name, active, sort_order)
SELECT 'locations', v.name, true, v.ord FROM (VALUES ('Zurich', 1), ('Lausanne', 2)) AS v(name, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.config_items c WHERE c.category = 'locations' AND c.name = v.name);