ALTER TABLE public.reference_letters ADD COLUMN IF NOT EXISTS signature_mode text NOT NULL DEFAULT 'hr';
ALTER TABLE public.reference_letters ADD COLUMN IF NOT EXISTS supervisor_signature text NOT NULL DEFAULT '';
ALTER TABLE public.reference_letters ADD CONSTRAINT reference_letters_signature_mode_check CHECK (signature_mode IN ('hr', 'supervisor', 'both'));
COMMENT ON COLUMN public.reference_letters.signature_mode IS 'Supervisor-selected textual signatories: HR, supervisor, or both.';
COMMENT ON COLUMN public.reference_letters.supervisor_signature IS 'Manually entered supervisor textual signature; editable only with supervisor section.';