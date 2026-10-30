import {
  computeQuotaAllowance,
  isCreatorEmail,
  resolveEffectiveTier,
  TIER_LIMITS,
} from "./tiers";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// Self-contained unit verification (no external test runner dependency required)
export function verifyTierCalculations() {
  assert(isCreatorEmail("ri.craigrica@gmail.com") === true, "creator email must be recognized");
  assert(isCreatorEmail("RI.CRAIGRICA@GMAIL.COM ") === true, "creator email is case-insensitive");
  assert(isCreatorEmail("visitor@example.com") === false, "non-creator email is false");

  assert(
    resolveEffectiveTier({
      isAuthenticated: true,
      email: "ri.craigrica@gmail.com",
      profileTier: null,
    }) === "pro",
    "creator email defaults to pro when no override is set",
  );

  assert(
    resolveEffectiveTier({
      isAuthenticated: true,
      email: "ri.craigrica@gmail.com",
      profileTier: "free",
    }) === "free",
    "creator can switch to free to test free limits",
  );

  assert(
    resolveEffectiveTier({
      isAuthenticated: true,
      email: "ri.craigrica@gmail.com",
      profileTier: "guest",
    }) === "guest",
    "creator can switch to guest to test guest limits",
  );
  assert(
    resolveEffectiveTier({ isAuthenticated: false, profileTier: "pro" }) === "guest",
    "unauthenticated users must resolve to guest",
  );

  assert(
    resolveEffectiveTier({
      isAuthenticated: true,
      profileTier: "free",
      unlockedTripIds: ["trip-1"],
      tripId: "trip-2",
    }) === "free",
    "unmatched tripId must stay free",
  );

  assert(
    resolveEffectiveTier({
      isAuthenticated: true,
      profileTier: "free",
      unlockedTripIds: ["trip-1"],
      tripId: "trip-1",
    }) === "trip_pass",
    "matched tripId must resolve to trip_pass",
  );

  assert(
    resolveEffectiveTier({
      isAuthenticated: true,
      profileTier: "pro",
      unlockedTripIds: [],
      tripId: "trip-2",
    }) === "pro",
    "pro profile must resolve to pro",
  );

  const guest = computeQuotaAllowance({
    tier: "guest",
    photosUsed: 3,
    aiScansUsed: 0,
    tripsUsed: 1,
    citiesInTrip: 1,
  });
  assert(guest.photosRemaining === 2, "guest should have 2 photos remaining");
  assert(guest.aiScansRemaining === 0, "guest should have 0 AI scans");
  assert(guest.canAddPhotos(2) === true, "guest can add 2 photos");
  assert(guest.canAddPhotos(3) === false, "guest cannot add 3 photos");
  assert(guest.canCreateTrip === false, "guest capped at 1 trip");
  assert(guest.canAddCity === false, "guest capped at 1 city");
  assert(guest.canExportAlbum === false, "guest cannot export album");

  const free = computeQuotaAllowance({
    tier: "free",
    photosUsed: 8,
    aiScansUsed: 4,
    tripsUsed: 1,
    citiesInTrip: 1,
  });
  assert(free.limits.maxPhotos === TIER_LIMITS.free.maxPhotos, "free max photos is 10");
  assert(free.photosRemaining === 2, "free should have 2 photos remaining");
  assert(free.aiScansRemaining === 1, "free should have 1 AI scan remaining");
  assert(free.canAddCity === false, "free capped at 1 city");
  assert(free.canExportAlbum === false, "free cannot export album");
  assert(free.isPaid === false, "free is not paid");

  const tripPass = computeQuotaAllowance({
    tier: "trip_pass",
    photosUsed: 25,
    aiScansUsed: 20,
    tripsUsed: 1,
    citiesInTrip: 4,
  });
  assert(tripPass.isPaid === true, "trip_pass is paid");
  assert(tripPass.canAddCity === true, "trip_pass can add cities");
  assert(tripPass.canUseItineraryImport === true, "trip_pass can import itinerary");
  assert(tripPass.canExportAlbum === true, "trip_pass can export album");
}

