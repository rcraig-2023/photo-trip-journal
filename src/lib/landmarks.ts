import { supabase } from "@/integrations/supabase/client";
import { enrichLandmark } from "@/lib/ai.functions";

export type Landmark = {
  id: string;
  name: string;
  place_name: string | null;
  description: string | null;
  history: string | null;
  culture: string | null;
  fun_fact: string | null;
  caption: string | null;
  enriched_at: string | null;
};

/**
 * One record per place: reuse an existing landmark with the same name in the
 * same city rather than creating a second one.
 */
export async function findOrCreateLandmark(args: {
  userId: string;
  name: string;
  placeName: string | null;
  tripId: string | null;
  cityId: string | null;
}) {
  const { data: existing } = await supabase
    .from("landmarks")
    .select("*")
    .ilike("name", args.name)
    .eq("city_id", args.cityId ?? "")
    .maybeSingle();
  if (existing) return existing as Landmark;

  const { data: anyCity } = await supabase
    .from("landmarks")
    .select("*")
    .ilike("name", args.name)
    .is("city_id", null)
    .maybeSingle();
  if (anyCity && !args.cityId) return anyCity as Landmark;

  const { data, error } = await supabase
    .from("landmarks")
    .insert({
      user_id: args.userId,
      name: args.name,
      place_name: args.placeName,
      trip_id: args.tripId,
      city_id: args.cityId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Landmark;
}

/** Written once and stored; later views reuse it. */
export async function ensureEnrichment(landmark: Landmark) {
  if (landmark.enriched_at) return landmark;
  try {
    const notes = await enrichLandmark({
      data: { name: landmark.name, ...(landmark.place_name ? { place: landmark.place_name } : {}) },
    });
    const { data } = await supabase
      .from("landmarks")
      .update({ ...notes, enriched_at: new Date().toISOString() })
      .eq("id", landmark.id)
      .select("*")
      .maybeSingle();
    return (data as Landmark | null) ?? landmark;
  } catch {
    return landmark;
  }
}
