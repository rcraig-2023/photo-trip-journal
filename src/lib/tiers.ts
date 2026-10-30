import { useCallback, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

