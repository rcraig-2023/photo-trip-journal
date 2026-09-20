ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS cuisine_type text,
  ADD COLUMN IF NOT EXISTS price_tier integer,
  ADD COLUMN IF NOT EXISTS personal_rating numeric;

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_price_tier_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_price_tier_check CHECK (price_tier IS NULL OR (price_tier BETWEEN 1 AND 4));
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_personal_rating_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_personal_rating_check CHECK (personal_rating IS NULL OR (personal_rating >= 1 AND personal_rating <= 10));

CREATE INDEX IF NOT EXISTS entries_kind_rating_idx ON public.entries (user_id, kind, personal_rating DESC);