import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { resolveGuestPhotoUrl, useGuestState } from "@/lib/guestStore";

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
  lat: number | null;
  lng: number | null;
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
  cuisine_type: string | null;
  price_tier: number | null;
  personal_rating: number | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  date_unknown?: boolean;
  entry_photos?: { id: string; storage_path: string; sha256: string | null }[];
  cities?: { id: string; name: string; country: string | null } | null;
};

export const PRICE_LABEL: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

export function useRestaurants() {
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["restaurants", user?.id ?? null],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select("*, entry_photos(id, storage_path, sha256), cities(id, name, country)")
        .eq("kind", "restaurant")
        .in("status", ["confirmed"])
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Entry[];
    },
  });

  if (!loading && !user) {
    const guestRestaurants = guest.entries
      .filter((e) => e.kind === "restaurant" && e.status === "confirmed")
      .slice()
      .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    return { ...query, data: guestRestaurants, isLoading: false };
  }

  return query;
}

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
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["trips", user?.id ?? null],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trips")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Trip[];
    },
  });

  if (!loading && !user) {
    return { ...query, data: guest.trips, isLoading: false };
  }
  return query;
}

export function useActiveTrip() {
  const trips = useTrips();
  const active = trips.data?.find((t) => t.is_active) ?? trips.data?.[0] ?? null;
  return { ...trips, trip: active };
}

export function useCities(tripId?: string | null) {
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["cities", tripId, user?.id ?? null],
    enabled: !loading && !!user && !!tripId && !tripId.startsWith("guest-"),
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

  if (!loading && !user) {
    const cities = tripId
      ? guest.cities.filter((c) => c.trip_id === tripId)
      : [];
    return { ...query, data: cities, isLoading: false };
  }
  return query;
}

export function useCity(cityId?: string) {
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["city", cityId, user?.id ?? null],
    enabled: !loading && !!user && !!cityId && !cityId.startsWith("guest-"),
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

  if (!loading && !user) {
    const city = guest.cities.find((c) => c.id === cityId) ?? null;
    const trip = city ? guest.trips.find((t) => t.id === city.trip_id) : null;
    return {
      ...query,
      data: city ? { ...city, trips: trip ? { title: trip.title } : null } : null,
      isLoading: false,
    };
  }
  return query;
}

const ENTRY_SELECT = "*, entry_photos(id, storage_path, sha256)";

export function useEntries(opts: {
  cityId?: string | null | undefined;
  tripId?: string | null | undefined;
  status?: string | undefined;
  limit?: number | undefined;
}) {
  const { cityId, tripId, status, limit } = opts;
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["entries", cityId ?? null, tripId ?? null, status ?? null, limit ?? null, user?.id ?? null],
    enabled:
      !loading &&
      !!user &&
      (!!cityId || !!tripId || status === "pending") &&
      !(cityId?.startsWith("guest-") || tripId?.startsWith("guest-")),
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

  if (!loading && !user) {
    let filtered = guest.entries.slice();
    if (cityId) filtered = filtered.filter((e) => e.city_id === cityId);
    if (tripId) filtered = filtered.filter((e) => e.trip_id === tripId);
    if (status) filtered = filtered.filter((e) => e.status === status);
    filtered.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
    if (limit) filtered = filtered.slice(0, limit);
    return { ...query, data: filtered, isLoading: false };
  }
  return query;
}

export function usePendingCount() {
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["pending-count", user?.id ?? null],
    enabled: !loading && !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  if (!loading && !user) {
    const count = guest.entries.filter((e) => e.status === "pending").length;
    return { ...query, data: count, isLoading: false };
  }
  return query;
}

export function useEntry(id?: string) {
  const { user, loading } = useSession();
  const guest = useGuestState();

  const query = useQuery({
    queryKey: ["entry", id, user?.id ?? null],
    enabled: !loading && !!user && !!id && !id.startsWith("guest-"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("entries")
        .select(ENTRY_SELECT + ", cities(name, country), landmarks(*)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as
        | (Entry & {
            cities: { name: string; country: string | null } | null;
            landmarks: {
              name: string;
              place_name: string | null;
              description: string | null;
              history: string | null;
              culture: string | null;
              fun_fact: string | null;
              caption: string | null;
            } | null;
          })
        | null;
    },
  });

  if (!loading && !user) {
    const entry = guest.entries.find((e) => e.id === id) ?? null;
    return {
      ...query,
      data: entry
        ? {
            ...entry,
            cities: entry.cities ? { name: entry.cities.name, country: entry.cities.country } : null,
            landmarks: null,
          }
        : null,
      isLoading: false,
    };
  }
  return query;
}

const urlCache = new Map<string, string>();

export async function signedUrl(path: string) {
  if (path.startsWith("guest://")) {
    return resolveGuestPhotoUrl(path);
  }
  const cached = urlCache.get(path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from("memories").createSignedUrl(path, 60 * 60);
  if (error || !data) throw error ?? new Error("no url");
  urlCache.set(path, data.signedUrl);
  return data.signedUrl;
}

export function fmtReviewCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
