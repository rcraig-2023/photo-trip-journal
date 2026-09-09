import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Kind = "photo" | "jot" | "landmark" | "restaurant";

export type Trip = {
  id: string;
  title: string;
  subtitle: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

export type City = {
  id: string;
  trip_id: string;
  name: string;
  country: string | null;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
};

export type Entry = {
  id: string;
  trip_id: string | null;
  city_id: string | null;
  kind: Kind;
  title: string | null;
  body: string | null;
  place_name: string | null;
  occurred_at: string;
  status: string;
  landmark_id: string | null;
  ai_status: string;
  ai_suggestion: string | null;
  ai_place: string | null;
  ai_explanation: string | null;
  ai_confidence: number | null;
  ai_error: string | null;
  entry_photos?: { id: string; storage_path: string; sha256: string | null }[];
};


export const KIND_LABEL: Record<Kind, string> = {
  photo: "Photos",
  jot: "Jot",
  landmark: "Landmark",
  restaurant: "Restaurant",
};

export function fmtRange(start?: string | null, end?: string | null) {
  if (!start) return "";
  const s = new Date(start + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric" };
  if (!end) return s.toLocaleDateString("en-US", opts);
  const e = new Date(end + "T00:00:00");
  if (s.getMonth() === e.getMonth())
    return `${s.toLocaleDateString("en-US", opts)}–${e.getDate()}`;
  return `${s.toLocaleDateString("en-US", opts)} – ${e.toLocaleDateString("en-US", opts)}`;
}

export function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function useTrips() {
  return useQuery({
    queryKey: ["trips"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Trip[];
    },
  });
}

export function useActiveTrip() {
  const trips = useTrips();
  const active = trips.data?.find((t) => t.is_active) ?? trips.data?.[0] ?? null;
  return { ...trips, trip: active };
}

export function useCities(tripId?: string | null) {
  return useQuery({
    queryKey: ["cities", tripId],
    enabled: !!tripId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .eq("trip_id", tripId!)
        .order("sort_order")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as City[];
    },
  });
}

export function useCity(cityId?: string) {
  return useQuery({
    queryKey: ["city", cityId],
    enabled: !!cityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("*, trips(title)")
        .eq("id", cityId!)
        .maybeSingle();
      if (error) throw error;
      return data as (City & { trips: { title: string } | null }) | null;
    },
  });
}

const ENTRY_SELECT = "*, entry_photos(id, storage_path)";

export function useEntries(opts: {
  cityId?: string | null | undefined;
  tripId?: string | null | undefined;
  status?: string | undefined;
  limit?: number | undefined;
}) {
  const { cityId, tripId, status, limit } = opts;
  return useQuery({
    queryKey: ["entries", cityId ?? null, tripId ?? null, status ?? null, limit ?? null],
    enabled: !!cityId || !!tripId || status === "pending",
    queryFn: async () => {
      let q = supabase.from("entries").select(ENTRY_SELECT);
      if (cityId) q = q.eq("city_id", cityId);
      if (tripId) q = q.eq("trip_id", tripId);
      if (status) q = q.eq("status", status);
      q = q.order("occurred_at", { ascending: false });
      if (limit) q = q.limit(limit);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });
}

export function usePendingCount() {
  return useQuery({
    queryKey: ["pending-count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useEntry(id?: string) {
  return useQuery({
    queryKey: ["entry", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(ENTRY_SELECT + ", cities(name, country)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as (Entry & { cities: { name: string; country: string | null } | null }) | null;
    },
  });
}

const urlCache = new Map<string, string>();

export async function signedUrl(path: string) {
  const cached = urlCache.get(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from("memories").createSignedUrl(path, 60 * 60);
  if (error || !data) throw error ?? new Error("no url");
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
}
