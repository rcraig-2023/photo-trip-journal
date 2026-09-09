CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.cities ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS touch_profiles ON public.profiles;
CREATE TRIGGER touch_profiles BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS touch_trips ON public.trips;
CREATE TRIGGER touch_trips BEFORE UPDATE ON public.trips FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS touch_cities ON public.cities;
CREATE TRIGGER touch_cities BEFORE UPDATE ON public.cities FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS touch_entries ON public.entries;
CREATE TRIGGER touch_entries BEFORE UPDATE ON public.entries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS ai_status text NOT NULL DEFAULT 'none';
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS ai_processed_at timestamptz;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS ai_error text;

ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_kind_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_kind_check CHECK (kind IN ('photo','jot','landmark','restaurant'));
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_status_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_status_check CHECK (status IN ('pending','confirmed','discarded'));
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_ai_status_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_ai_status_check CHECK (ai_status IN ('none','processing','done','failed'));
ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_ai_confidence_check;
ALTER TABLE public.entries ADD CONSTRAINT entries_ai_confidence_check CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1));

ALTER TABLE public.trips DROP CONSTRAINT IF EXISTS trips_dates_check;
ALTER TABLE public.trips ADD CONSTRAINT trips_dates_check CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);
ALTER TABLE public.cities DROP CONSTRAINT IF EXISTS cities_dates_check;
ALTER TABLE public.cities ADD CONSTRAINT cities_dates_check CHECK (start_date IS NULL OR end_date IS NULL OR end_date >= start_date);

CREATE INDEX IF NOT EXISTS trips_user_active_idx ON public.trips (user_id, is_active, start_date DESC);
CREATE INDEX IF NOT EXISTS cities_trip_idx ON public.cities (trip_id, sort_order);
CREATE INDEX IF NOT EXISTS cities_user_idx ON public.cities (user_id);
CREATE INDEX IF NOT EXISTS entries_user_status_idx ON public.entries (user_id, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS entries_city_idx ON public.entries (city_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS entries_trip_idx ON public.entries (trip_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS entry_photos_entry_idx ON public.entry_photos (entry_id, created_at);
CREATE INDEX IF NOT EXISTS entry_photos_user_idx ON public.entry_photos (user_id);