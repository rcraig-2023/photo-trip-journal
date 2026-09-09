ALTER TABLE public.entry_photos ADD COLUMN IF NOT EXISTS sha256 text;
ALTER TABLE public.entry_photos ADD COLUMN IF NOT EXISTS captured_at timestamptz;
ALTER TABLE public.entry_photos ADD COLUMN IF NOT EXISTS lat double precision;
ALTER TABLE public.entry_photos ADD COLUMN IF NOT EXISTS lng double precision;
ALTER TABLE public.entry_photos ADD COLUMN IF NOT EXISTS bytes integer;
ALTER TABLE public.entry_photos ADD COLUMN IF NOT EXISTS mime text;
CREATE INDEX IF NOT EXISTS entry_photos_hash_idx ON public.entry_photos (user_id, sha256);

CREATE TABLE IF NOT EXISTS public.landmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  city_id uuid REFERENCES public.cities(id) ON DELETE SET NULL,
  name text NOT NULL,
  place_name text,
  description text,
  history text,
  culture text,
  fun_fact text,
  caption text,
  enriched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.landmarks TO authenticated;
GRANT ALL ON public.landmarks TO service_role;
ALTER TABLE public.landmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own landmarks" ON public.landmarks;
CREATE POLICY "own landmarks" ON public.landmarks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS landmarks_unique_name_idx
  ON public.landmarks (user_id, lower(name), COALESCE(city_id, '00000000-0000-0000-0000-000000000000'::uuid));
DROP TRIGGER IF EXISTS touch_landmarks ON public.landmarks;
CREATE TRIGGER touch_landmarks BEFORE UPDATE ON public.landmarks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS landmark_id uuid REFERENCES public.landmarks(id) ON DELETE SET NULL;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS ai_place text;
ALTER TABLE public.entries ADD COLUMN IF NOT EXISTS ai_explanation text;
CREATE INDEX IF NOT EXISTS entries_landmark_idx ON public.entries (landmark_id);

CREATE TABLE IF NOT EXISTS public.ai_image_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_hash text NOT NULL,
  name text,
  kind text NOT NULL DEFAULT 'photo',
  place_name text,
  confidence numeric,
  explanation text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_image_results_kind_check CHECK (kind IN ('photo','landmark','restaurant')),
  CONSTRAINT ai_image_results_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_image_results TO authenticated;
GRANT ALL ON public.ai_image_results TO service_role;
ALTER TABLE public.ai_image_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own ai results" ON public.ai_image_results;
CREATE POLICY "own ai results" ON public.ai_image_results FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_image_results_hash_idx ON public.ai_image_results (user_id, image_hash);