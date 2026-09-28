ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_status_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_status_check CHECK (status IN ('pending','confirmed','discarded','planned'));
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS date_unknown boolean NOT NULL DEFAULT false;