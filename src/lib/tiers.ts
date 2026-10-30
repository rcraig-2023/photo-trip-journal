import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { useGuestState } from "@/lib/guestStore";

export type AccessTier = "guest" | "free" | "trip_pass" | "pro";

export const CREATOR_EMAILS = ["ri.craigrica@gmail.com"] as const;

export function isCreatorEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return CREATOR_EMAILS.some((c) => c.toLowerCase() === normalized);
}

export const TIER_LIMITS = {
  guest: {
    label: "Guest Preview",
    maxTrips: 1,
    maxCitiesPerTrip: 1,
    maxPhotos: 5,
    maxAiScans: 0,
    maxGoogleLookups: 0,
    allowItineraryImport: false,
    allowAlbumExport: false,
  },
  free: {
    label: "Free Explorer",
    maxTrips: 1,
    maxCitiesPerTrip: 1,
    maxPhotos: 10,
    maxAiScans: 5,
    maxGoogleLookups: 2,
    allowItineraryImport: false,
    allowAlbumExport: false,
  },
  trip_pass: {
    label: "Trip Pass",
    maxTrips: 100,
    maxCitiesPerTrip: 50,
    maxPhotos: 500,
    maxAiScans: 500,
    maxGoogleLookups: 500,
    allowItineraryImport: true,
    allowAlbumExport: true,
  },
  pro: {
    label: "Touri Pro",
    maxTrips: 100,
    maxCitiesPerTrip: 50,
    maxPhotos: 500,
    maxAiScans: 500,
    maxGoogleLookups: 500,
    allowItineraryImport: true,
    allowAlbumExport: true,
  },
} as const;

export function resolveEffectiveTier(opts: {
  isAuthenticated: boolean;
  email?: string | null | undefined;
  profileTier?: string | null | undefined;
  unlockedTripIds?: string[] | null | undefined;
  tripId?: string | null | undefined;
}): AccessTier {
  if (!opts.isAuthenticated) return "guest";
  if (opts.profileTier === "guest") return "guest";
  if (opts.profileTier === "pro") return "pro";
  if (opts.tripId && (opts.unlockedTripIds ?? []).includes(opts.tripId)) {
    return "trip_pass";
  }
  if (opts.profileTier === "free" || opts.profileTier === "trip_pass") {
    return opts.profileTier === "trip_pass" ? "trip_pass" : "free";
  }
  if (isCreatorEmail(opts.email)) return "pro";
  return "free";
}

export async function getUserAccessState(
  supabaseClient: SupabaseClient<Database>,
  userId: string,
  claims?: Record<string, unknown>,
): Promise<{ isPaid: boolean; unlockedTripIds: string[] }> {
  const email = (claims?.["email"] as string | undefined) ?? null;
  const userMeta = (claims?.["user_metadata"] as Record<string, unknown> | undefined) ?? {};
  const metaTier = userMeta["tier"] as string | undefined;
  const metaUnlocked = Array.isArray(userMeta["unlocked_trip_ids"])
    ? (userMeta["unlocked_trip_ids"] as string[])
    : [];

  if (metaTier === "pro" || metaTier === "trip_pass") {
    return { isPaid: true, unlockedTripIds: metaUnlocked };
  }
  if (metaTier === "free" || metaTier === "guest") {
    return { isPaid: false, unlockedTripIds: [] };
  }
  if (isCreatorEmail(email)) {
    return { isPaid: true, unlockedTripIds: metaUnlocked };
  }

  try {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    const row = profile as { tier?: string | null; unlocked_trip_ids?: string[] | null } | null;
    const unlocked = Array.from(new Set([...metaUnlocked, ...(row?.unlocked_trip_ids ?? [])]));
    const isPaid = row?.tier === "pro" || unlocked.length > 0;
    return { isPaid, unlockedTripIds: unlocked };
  } catch {
    return { isPaid: metaUnlocked.length > 0, unlockedTripIds: metaUnlocked };
  }
}

export type ItineraryItem = {
  title: string;
  kind: "landmark" | "restaurant" | "jot";
  place: string;
  city: string;
  note: string;
  occurred_at: string | null;
};

const normTitle = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

const TWO_HOURS = 2 * 60 * 60 * 1000;

/**
 * Drops duplicate parsed items: same (or contained) title on the same day
 * within a 2-hour window, or same title when both lack a time. Keeps the
 * first occurrence.
 */
export function dedupeItinerary(items: ItineraryItem[]): ItineraryItem[] {
  const kept: ItineraryItem[] = [];
  for (const item of items) {
    const title = normTitle(item.title);
    if (!title) continue;
    const dupe = kept.some((k) => {
      const kt = normTitle(k.title);
      if (!(kt === title || kt.includes(title) || title.includes(kt))) return false;
      if (!item.occurred_at || !k.occurred_at) return true;
      if (item.occurred_at.slice(0, 10) !== k.occurred_at.slice(0, 10)) return false;
      return (
        Math.abs(new Date(item.occurred_at).getTime() - new Date(k.occurred_at).getTime()) <=
        TWO_HOURS
      );
    });
    if (!dupe) kept.push(item);
  }
  return kept;
}

export function computeQuotaAllowance(opts: {
  tier: AccessTier;
  photosUsed: number;
  aiScansUsed: number;
  tripsUsed: number;
  citiesInTrip: number;
}) {
  const limits = TIER_LIMITS[opts.tier];
  const photosRemaining = Math.max(0, limits.maxPhotos - opts.photosUsed);
  const aiScansRemaining = Math.max(0, limits.maxAiScans - opts.aiScansUsed);
  const canCreateTrip = opts.tripsUsed < limits.maxTrips;
  const canAddCity = opts.citiesInTrip < limits.maxCitiesPerTrip;

  return {
    tier: opts.tier,
    limits,
    photosUsed: opts.photosUsed,
    photosRemaining,
    aiScansUsed: opts.aiScansUsed,
    aiScansRemaining,
    tripsUsed: opts.tripsUsed,
    citiesInTrip: opts.citiesInTrip,
    canAddPhotos: (count = 1) => photosRemaining >= count,
    canCreateTrip,
    canAddCity,
    canUseItineraryImport: limits.allowItineraryImport,
    canExportAlbum: limits.allowAlbumExport,
    isPaid: opts.tier === "pro" || opts.tier === "trip_pass",
  };
}

export const PRICE_LABEL_MAP: Record<number, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

export function namesMatch(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

export type PlannedMatchCandidate = {
  id: string;
  title: string | null;
  place_name: string | null;
  city_id: string | null;
  kind: "photo" | "landmark" | "restaurant" | "jot";
  occurred_at: string;
  date_unknown?: boolean | null;
};

/**
 * Pure helper that finds the best planned entry match for a newly uploaded photo
 * by (1) AI-recognised place name or (2) EXIF timestamp proximity within 3 hours on the same day.
 */
export function findBestPlannedMatch(opts: {
  plans: PlannedMatchCandidate[];
  name: string;
  detectedKind: "photo" | "landmark" | "restaurant";
  photoOccurredAt: string | null;
  photoCityId: string | null;
}): PlannedMatchCandidate | undefined {
  const { plans, name, detectedKind, photoOccurredAt, photoCityId } = opts;
  if (!plans.length) return undefined;

  if (name) {
    const byName = plans.find(
      (p) => namesMatch(p.title ?? "", name) || namesMatch(p.place_name ?? "", name),
    );
    if (byName) return byName;
  }

  if (photoOccurredAt) {
    const srcDay = photoOccurredAt.slice(0, 10);
    const srcTime = new Date(photoOccurredAt).getTime();
    if (!isNaN(srcTime)) {
      const candidates = plans
        .filter((p) => {
          if (p.date_unknown || !p.occurred_at) return false;
          if (p.occurred_at.slice(0, 10) !== srcDay) return false;
          if (photoCityId && p.city_id && p.city_id !== photoCityId) return false;
          if (
            detectedKind !== "photo" &&
            (p.kind === "restaurant" || p.kind === "landmark") &&
            p.kind !== detectedKind
          ) {
            return false;
          }
          const planTime = new Date(p.occurred_at).getTime();
          return !isNaN(planTime) && Math.abs(planTime - srcTime) <= THREE_HOURS_MS;
        })
        .sort(
          (a, b) =>
            Math.abs(new Date(a.occurred_at).getTime() - srcTime) -
            Math.abs(new Date(b.occurred_at).getTime() - srcTime),
        );
      return candidates[0];
    }
  }

  return undefined;
}

export type SharePreset = "9plus" | "8plus" | "all";

export type ShareablePlace = {
  id: string;
  kind: "photo" | "jot" | "landmark" | "restaurant";
  title: string | null;
  body: string | null;
  place_name: string | null;
  cuisine_type: string | null;
  price_tier: number | null;
  personal_rating: number | null;
};

export function shouldSelectForPreset(entry: ShareablePlace, preset: SharePreset): boolean {
  if (preset === "all") return true;
  const minScore = preset === "9plus" ? 9 : 8;
  if (entry.personal_rating != null) {
    return Number(entry.personal_rating) >= minScore;
  }
  return preset === "8plus" && entry.kind === "landmark";
}

export function formatDestinationShareText(opts: {
  cityName: string;
  country?: string | null;
  entries: ShareablePlace[];
}): string {
  const { cityName, country, entries } = opts;
  const header = `My ${cityName}${country ? `, ${country}` : ""} Recommendations — via Touri`;
  const restaurants = entries
    .filter((e) => e.kind === "restaurant")
    .sort((a, b) => (b.personal_rating ?? -1) - (a.personal_rating ?? -1));
  const landmarks = entries
    .filter((e) => e.kind === "landmark")
    .sort((a, b) => (b.personal_rating ?? -1) - (a.personal_rating ?? -1));

  const sections: string[] = [header];

  if (restaurants.length) {
    const lines = restaurants.map((r, i) => {
      const meta = [
        r.personal_rating != null ? `${Number(r.personal_rating).toFixed(1)}/10` : null,
        r.cuisine_type,
        r.price_tier ? PRICE_LABEL_MAP[r.price_tier] : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const note = r.body ? `\n   “${r.body.trim()}”` : "";
      return `${i + 1}. ${r.title ?? "Untitled"}${meta ? ` (${meta})` : ""}${note}`;
    });
    sections.push(`WHERE TO EAT & DRINK\n${lines.join("\n")}`);
  }

  if (landmarks.length) {
    const lines = landmarks.map((l, i) => {
      const meta = [
        l.personal_rating != null ? `${Number(l.personal_rating).toFixed(1)}/10` : null,
        l.place_name && l.place_name !== l.title ? l.place_name : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const note = l.body ? `\n   “${l.body.trim()}”` : "";
      return `${i + 1}. ${l.title ?? "Untitled"}${meta ? ` (${meta})` : ""}${note}`;
    });
    sections.push(`PLACES & THINGS TO DO\n${lines.join("\n")}`);
  }

  return sections.join("\n\n");
}

// Local override store so upgrades work instantaneously even if DB migration hasn't run yet
const LOCAL_TIER_KEY = "touri_tier_override_v1";
const tierListeners = new Set<() => void>();

type LocalTierOverride = {
  tier?: AccessTier;
  unlockedTripIds?: string[];
};

function getLocalOverride(userId?: string | null): LocalTierOverride {
  if (typeof window === "undefined" || !userId) return {};
  try {
    const raw = window.localStorage.getItem(`${LOCAL_TIER_KEY}:${userId}`);
    return raw ? (JSON.parse(raw) as LocalTierOverride) : {};
  } catch {
    return {};
  }
}

function setLocalOverride(userId: string, next: LocalTierOverride) {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(`${LOCAL_TIER_KEY}:${userId}`, JSON.stringify(next));
  }
  tierListeners.forEach((l) => l());
}

export function useTierAccess(tripId?: string | null) {
  const { user } = useSession();
  const guest = useGuestState();
  const qc = useQueryClient();

  const localOverride = useSyncExternalStore(
    (l) => {
      tierListeners.add(l);
      return () => tierListeners.delete(l);
    },
    () => JSON.stringify(getLocalOverride(user?.id)),
    () => "{}",
  );
  const parsedOverride = JSON.parse(localOverride) as LocalTierOverride;

  const usageQuery = useQuery({
    queryKey: ["tier-usage", user?.id ?? "guest"],
    enabled: !!user?.id,
    queryFn: async () => {
      const uid = user!.id;
      const [photosRes, aiRes, tripsRes, profileRes] = await Promise.all([
        supabase
          .from("entry_photos")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid),
        supabase
          .from("ai_image_results")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid),
        supabase
          .from("trips")
          .select("id", { count: "exact", head: true })
          .eq("user_id", uid),
        supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      ]);

      const profileRow = profileRes.data as
        | { tier?: string | null; unlocked_trip_ids?: string[] | null }
        | null
        | undefined;

      return {
        photosUsed: photosRes.count ?? 0,
        aiScansUsed: aiRes.count ?? 0,
        tripsUsed: tripsRes.count ?? 0,
        dbTier: profileRow?.tier ?? null,
        dbUnlockedTrips: profileRow?.unlocked_trip_ids ?? [],
      };
    },
  });

  const citiesQuery = useQuery({
    queryKey: ["tier-cities-count", user?.id ?? "guest", tripId ?? null],
    enabled: !!user?.id && !!tripId && !tripId.startsWith("guest-"),
    queryFn: async () => {
      const { count } = await supabase
        .from("cities")
        .select("id", { count: "exact", head: true })
        .eq("trip_id", tripId!);
      return count ?? 0;
    },
  });

  const isCreator = isCreatorEmail(user?.email);
  const metaTier = (user?.user_metadata?.["tier"] as string | undefined) ?? null;
  const metaUnlocked =
    (user?.user_metadata?.["unlocked_trip_ids"] as string[] | undefined) ?? [];

  const effectiveProfileTier =
    parsedOverride.tier ??
    (isCreator ? (metaTier ?? "pro") : (usageQuery.data?.dbTier ?? metaTier ?? "free"));
  const effectiveUnlockedTrips =
    parsedOverride.unlockedTripIds ??
    Array.from(
      new Set([
        ...(usageQuery.data?.dbUnlockedTrips ?? []),
        ...metaUnlocked,
      ]),
    );

  const tier = resolveEffectiveTier({
    isAuthenticated: !!user,
    email: user?.email,
    profileTier: effectiveProfileTier,
    unlockedTripIds: effectiveUnlockedTrips,
    tripId,
  });

  const simulatingGuest = tier === "guest";
  const photosUsed =
    user && !simulatingGuest ? (usageQuery.data?.photosUsed ?? 0) : guest.photos.length;
  const aiScansUsed = user && !simulatingGuest ? (usageQuery.data?.aiScansUsed ?? 0) : 0;
  const tripsUsed =
    user && !simulatingGuest ? (usageQuery.data?.tripsUsed ?? 0) : guest.trips.length;
  const citiesInTrip =
    user && !simulatingGuest
      ? (citiesQuery.data ?? 0)
      : guest.cities.filter((c) => !tripId || c.trip_id === tripId).length;

  const allowance = computeQuotaAllowance({
    tier,
    photosUsed,
    aiScansUsed,
    tripsUsed,
    citiesInTrip,
  });

  const updatePlan = useCallback(
    async (plan: AccessTier, targetTripId?: string | null) => {
      if (!user) return;
      const unlockId = targetTripId ?? tripId;
      const nextTier: AccessTier = plan;
      const nextUnlocked =
        plan === "free" || plan === "guest"
          ? []
          : plan === "trip_pass" && unlockId
            ? Array.from(new Set([...effectiveUnlockedTrips, unlockId]))
            : effectiveUnlockedTrips;

      setLocalOverride(user.id, {
        tier: nextTier,
        unlockedTripIds: nextUnlocked,
      });

      const dbTierValue = nextTier === "pro" ? "pro" : "free";

      try {
        await supabase.auth.updateUser({
          data: {
            tier: nextTier,
            unlocked_trip_ids: nextUnlocked,
          },
        });
      } catch {
        // Ignore auth metadata errors
      }

      try {
        await supabase
          .from("profiles")
          .update({
            tier: dbTierValue,
            unlocked_trip_ids: nextUnlocked,
          })
          .eq("id", user.id);
      } catch {
        // Ignore if migration columns are not applied on remote DB yet
      }

      await qc.invalidateQueries({ queryKey: ["tier-usage"] });
    },
    [user, tripId, effectiveUnlockedTrips, qc],
  );

  return {
    ...allowance,
    isAuthenticated: !!user && !simulatingGuest,
    isCreator,
    unlockedTripIds: effectiveUnlockedTrips,
    isLoading: usageQuery.isLoading,
    updatePlan,
  };
}

