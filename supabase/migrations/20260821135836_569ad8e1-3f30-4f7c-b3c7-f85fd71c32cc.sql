CREATE TABLE public.performance_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  period text not null,
  rating text not null default 'meets',
  summary text,
  highlights text,
  improvements text,
  reviewer text,
  recorded_on date not null default CURRENT_DATE,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_records TO authenticated;
GRANT ALL ON public.performance_records TO service_role;
ALTER TABLE public.performance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "performance_records_all_authenticated" ON public.performance_records FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE TRIGGER performance_records_touch BEFORE UPDATE ON public.performance_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX performance_records_person_idx ON public.performance_records(person_id, recorded_on DESC);
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS audit_log_person_idx ON public.audit_log(person_id, created_at DESC);