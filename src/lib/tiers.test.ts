import { albumDensity } from "./album";
import {
  addGuestCity,
  addGuestEntry,
  addGuestPhotoEntry,
  clearGuestState,
  createGuestTrip,
  deleteGuestEntries,
  deleteGuestTrip,
  getGuestState,
  resolveGuestPhotoUrl,
  updateGuestEntriesStatus,
  updateGuestEntry,
} from "./guestStore";
import {
  computeQuotaAllowance,
  dedupeItinerary,
  findBestPlannedMatch,
  formatDestinationShareText,
  getUserAccessState,
  isCreatorEmail,
  resolveEffectiveTier,
  shouldSelectForPreset,
  TIER_LIMITS,
  type PlannedMatchCandidate,
} from "./tiers";
import type { Entry } from "./touri";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

/**
 * Sets up a temporary in-memory window.localStorage and URL.createObjectURL
 * so browser-only Guest store tests can run in Node/tsx and clean up 100% afterward.
 */
function withTempBrowserEnv<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const prevWindow = g["window"];
  const store = new Map<string, string>();

  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  g["window"] = {
    localStorage: mockStorage,
  };

  const origCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = () => `blob:temp-test-${crypto.randomUUID()}`;

  return fn().finally(async () => {
    await clearGuestState();
    store.clear();
    URL.createObjectURL = origCreateObjectURL;
    if (prevWindow === undefined) {
      delete g["window"];
    } else {
      g["window"] = prevWindow;
    }
  });
}

// ============================================================================
// 1. Tier Resolution & Quotas (Guest, Free, Trip Pass, Touri Pro, Creator)
// ============================================================================
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

  // Stage 0: Guest Preview (1 trip, 1 city, 5 local photos, 0 AI, no itinerary import, no export)
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
  assert(guest.canUseItineraryImport === false, "guest cannot use AI itinerary import");
  assert(guest.canExportAlbum === false, "guest cannot export album");

  // Stage 1: Free Explorer (1 trip, 1 city, 10 cloud photos, 5 AI scans, 2 Google lookups)
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
  assert(free.canUseItineraryImport === false, "free cannot use AI itinerary import");
  assert(free.canExportAlbum === false, "free cannot export album");
  assert(free.isPaid === false, "free is not paid");

  // Stage 2A: Single Trip Pass ($9)
  const tripPass = computeQuotaAllowance({
    tier: "trip_pass",
    photosUsed: 25,
    aiScansUsed: 20,
    tripsUsed: 1,
    citiesInTrip: 4,
  });
  assert(tripPass.isPaid === true, "trip_pass is paid");
  assert(tripPass.canAddCity === true, "trip_pass can add multi-city chapters");
  assert(tripPass.canUseItineraryImport === true, "trip_pass can import itinerary");
  assert(tripPass.canExportAlbum === true, "trip_pass can export PDF album");
  assert(tripPass.canAddPhotos(50) === true, "trip_pass can batch upload 50 photos");

  // Stage 2B: Touri Pro ($29/yr)
  const pro = computeQuotaAllowance({
    tier: "pro",
    photosUsed: 120,
    aiScansUsed: 85,
    tripsUsed: 5,
    citiesInTrip: 8,
  });
  assert(pro.isPaid === true, "pro is paid");
  assert(pro.canCreateTrip === true, "pro can create multiple trips");
  assert(pro.canAddCity === true, "pro can add multiple cities");
  assert(pro.canUseItineraryImport === true, "pro can import itinerary");
  assert(pro.canExportAlbum === true, "pro can export PDF album");
}

// ============================================================================
// 2. Stage 0 Guest Store Lifecycle + Temporary Data Cleanup
// ============================================================================
export async function verifyGuestLifecycleAndCleanup() {
  await withTempBrowserEnv(async () => {
    await clearGuestState();
    assert(getGuestState().trips.length === 0, "guest state starts empty");

    // Create 1 guest trip + 1 city
    const trip = createGuestTrip({
      title: "Weekend in Philadelphia",
      start_date: "2026-05-10",
      end_date: "2026-05-12",
      cities: [
        {
          name: "Philadelphia",
          country: "United States",
          start_date: "2026-05-10",
          end_date: "2026-05-12",
          lat: 39.9526,
          lng: -75.1652,
        },
      ],
    });
    const afterTrip = getGuestState();
    assert(afterTrip.trips.length === 1, "guest trip created");
    assert(afterTrip.cities.length === 1, "guest city created");
    const cityId = afterTrip.cities[0]!.id;

    // Verify adding another city chapter via addGuestCity (used by global '+' Add City dialog)
    const addedCity = addGuestCity({
      trip_id: trip.id,
      name: "New Hope",
      country: "United States",
      start_date: "2026-05-12",
      end_date: "2026-05-12",
      lat: 40.3643,
      lng: -74.9513,
    });
    assert(
      addedCity.sort_order === 1 && getGuestState().cities.length === 2,
      "addGuestCity appends a new city chapter with incremented sort_order",
    );

    // Upload a guest photo blob and verify duplicate hash detection
    const dummyBlob = new Blob(["fake-jpeg-bytes"], { type: "image/jpeg" });
    const photoRes1 = await addGuestPhotoEntry({
      tripId: trip.id,
      cityId,
      blob: dummyBlob,
      mime: "image/jpeg",
      width: 1200,
      height: 1600,
      hash: "sha256-philly-museum-1",
      capturedAt: "2026-05-10T11:15:00.000Z",
      lat: 39.9656,
      lng: -75.181,
    });
    assert(!("duplicate" in photoRes1), "first guest photo should not be duplicate");

    const photoResDupe = await addGuestPhotoEntry({
      tripId: trip.id,
      cityId,
      blob: dummyBlob,
      mime: "image/jpeg",
      width: 1200,
      height: 1600,
      hash: "sha256-philly-museum-1",
      capturedAt: "2026-05-10T11:15:00.000Z",
      lat: 39.9656,
      lng: -75.181,
    });
    assert("duplicate" in photoResDupe && photoResDupe.duplicate === true, "duplicate hash detected");

    // Verify guest:// photo URL resolution works
    if (!("duplicate" in photoRes1)) {
      const resolvedUrl = await resolveGuestPhotoUrl(photoRes1.photo.storage_path);
      assert(resolvedUrl.startsWith("blob:temp-test-"), "guest photo URL resolves from cache");

      // Confirm and rate guest entry (Journey 2: Rate Experience)
      updateGuestEntry(photoRes1.entry.id, {
        title: "Philadelphia Museum of Art",
        kind: "landmark",
        personal_rating: 9.5,
      });
      updateGuestEntriesStatus([photoRes1.entry.id], "confirmed");
    }

    // Add a guest restaurant with rating and price tier
    const restEntry = addGuestEntry({
      trip_id: trip.id,
      city_id: cityId,
      kind: "restaurant",
      title: "Zahav",
      body: "Incredible pomegranate lamb shoulder.",
      occurred_at: "2026-05-10T20:00:00.000Z",
      cuisine_type: "Israeli",
      price_tier: 4,
      personal_rating: 9.5,
    });
    assert(restEntry.personal_rating === 9.5, "guest restaurant rating saved");

    // Delete entry and clean up all temporary guest state
    deleteGuestEntries([restEntry.id]);
    assert(
      getGuestState().entries.every((e) => e.id !== restEntry.id),
      "deleted guest entry removed",
    );

    // Create a second trip (making it active) and verify deleteGuestTrip removes the active trip,
    // its cities, entries, and photos, while promoting the previous trip back to active
    const secondTrip = createGuestTrip({
      title: "Day Trip to New York",
      start_date: "2026-06-01",
      end_date: "2026-06-01",
      cities: [
        {
          name: "New York",
          country: "United States",
          start_date: "2026-06-01",
          end_date: "2026-06-01",
          lat: 40.7128,
          lng: -74.006,
        },
      ],
    });
    assert(getGuestState().trips.length === 2, "two trips exist before trip deletion");
    deleteGuestTrip(secondTrip.id);
    const afterDeleteSecond = getGuestState();
    assert(afterDeleteSecond.trips.length === 1, "second trip deleted");
    assert(
      afterDeleteSecond.trips[0]?.id === trip.id && afterDeleteSecond.trips[0]?.is_active === true,
      "remaining trip automatically promoted back to active",
    );

    // Delete the remaining trip and verify all its cities, entries, and photos are purged
    deleteGuestTrip(trip.id);
    const afterDeleteAllTrips = getGuestState();
    assert(
      afterDeleteAllTrips.trips.length === 0 &&
        afterDeleteAllTrips.cities.length === 0 &&
        afterDeleteAllTrips.entries.length === 0 &&
        afterDeleteAllTrips.photos.length === 0,
      "deleteGuestTrip removes trip, cities, entries, and photos completely",
    );

    await clearGuestState();
    const cleaned = getGuestState();
    assert(
      cleaned.trips.length === 0 &&
        cleaned.cities.length === 0 &&
        cleaned.entries.length === 0 &&
        cleaned.photos.length === 0,
      "temporary guest state completely wiped after test",
    );
  });
}

// ============================================================================
// 3. Server-Side Tier Gate Verification (With Temporary Mock Supabase Client)
// ============================================================================
export async function verifyServerAccessGates() {
  const mockSupabaseForFreeUser = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { tier: "free", unlocked_trip_ids: [] },
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof getUserAccessState>[0];

  const mockSupabaseForTripPassUser = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { tier: "free", unlocked_trip_ids: ["trip-philly-1"] },
          }),
        }),
      }),
    }),
  } as unknown as Parameters<typeof getUserAccessState>[0];

  // Free user
  const freeState = await getUserAccessState(mockSupabaseForFreeUser, "user-free-1", {
    email: "traveler@example.com",
    user_metadata: { tier: "free" },
  });
  assert(freeState.isPaid === false, "free user isPaid must be false on server");

  // Trip Pass user via DB unlocked_trip_ids
  const passState = await getUserAccessState(mockSupabaseForTripPassUser, "user-pass-1", {
    email: "traveler@example.com",
    user_metadata: {},
  });
  assert(passState.isPaid === true, "trip pass user isPaid must be true on server");
  assert(passState.unlockedTripIds.includes("trip-philly-1"), "unlocked trip id preserved");

  // Creator account defaults to paid Pro on server, but respects explicit Free test override
  const creatorDefault = await getUserAccessState(mockSupabaseForFreeUser, "creator-id", {
    email: "ri.craigrica@gmail.com",
    user_metadata: {},
  });
  assert(creatorDefault.isPaid === true, "creator account defaults to paid Pro on server");

  const creatorTestingFree = await getUserAccessState(mockSupabaseForFreeUser, "creator-id", {
    email: "ri.craigrica@gmail.com",
    user_metadata: { tier: "free" },
  });
  assert(
    creatorTestingFree.isPaid === false,
    "creator switching to free in Settings enforces free quota on server too",
  );
}

// ============================================================================
// 4. Journey 1, 2, 3 & Editorial Album Density Verification
// ============================================================================
export function verifyUserJourneys() {
  // Journey 1: Pre-Trip Planner — Deduplicating AI-imported itinerary items & preserving undated ideas
  const rawImported = [
    {
      title: "Reading Terminal Market",
      kind: "restaurant" as const,
      place: "Philadelphia",
      city: "Philadelphia",
      note: "Lunch",
      occurred_at: "2026-05-10T12:30",
    },
    {
      title: "Reading Terminal Market",
      kind: "restaurant" as const,
      place: "Philadelphia",
      city: "Philadelphia",
      note: "Duplicate mention within 2 hours",
      occurred_at: "2026-05-10T13:15",
    },
    {
      title: "Barnes Foundation",
      kind: "landmark" as const,
      place: "Philadelphia",
      city: "Philadelphia",
      note: "Afternoon museum slot",
      occurred_at: "2026-05-10T15:00",
    },
    {
      title: " Angelo's Pizzeria ",
      kind: "restaurant" as const,
      place: "South Philly",
      city: "Philadelphia",
      note: "Unscheduled backlog idea",
      occurred_at: null,
    },
  ];
  const deduped = dedupeItinerary(rawImported);
  assert(deduped.length === 3, "duplicate itinerary item within 2h window consolidated");
  assert(
    deduped.some((i) => i.title.includes("Angelo") && i.occurred_at === null),
    "unscheduled spot preserved with occurred_at=null for Saved Ideas backlog",
  );

  // Journey 2: In-the-Moment Catcher — Smart Match by AI name OR EXIF timestamp
  const plans: PlannedMatchCandidate[] = [
    {
      id: "plan-museum",
      title: "Pergamon Museum",
      place_name: "Berlin, Germany",
      city_id: "city-berlin",
      kind: "landmark",
      occurred_at: "2026-06-01T11:00:00.000Z",
      date_unknown: false,
    },
    {
      id: "plan-dinner",
      title: "Schnitzelhaus Berlin",
      place_name: "Berlin, Germany",
      city_id: "city-berlin",
      kind: "restaurant",
      occurred_at: "2026-06-01T19:30:00.000Z",
      date_unknown: false,
    },
  ];

  // Match 2A: Museum photo matched by EXIF timestamp (11:45 AM is within 3h of 11:00 AM plan) even if AI name is generic
  const matchedByTimestamp = findBestPlannedMatch({
    plans,
    name: "",
    detectedKind: "landmark",
    photoOccurredAt: "2026-06-01T11:45:00.000Z",
    photoCityId: "city-berlin",
  });
  assert(
    matchedByTimestamp?.id === "plan-museum",
    "museum photo automatically matched to planned itinerary slot by EXIF timestamp",
  );

  // Match 2B: Restaurant photo matched by AI name recognition
  const matchedByName = findBestPlannedMatch({
    plans,
    name: "Schnitzelhaus",
    detectedKind: "restaurant",
    photoOccurredAt: "2026-06-01T21:10:00.000Z",
    photoCityId: "city-berlin",
  });
  assert(
    matchedByName?.id === "plan-dinner",
    "restaurant photo matched to planned itinerary slot by name",
  );

  // Journey 3: Recommendation Seeker — Single-destination curated Share List (8+ auto-selection)
  const makeEntry = (partial: Partial<Entry> & { id: string; kind: Entry["kind"] }): Entry => ({
    trip_id: "trip-1",
    city_id: "city-philly",
    title: "Place",
    body: null,
    place_name: null,
    occurred_at: "2026-05-10T12:00:00.000Z",
    status: "confirmed",
    landmark_id: null,
    ai_status: "done",
    ai_suggestion: null,
    ai_place: null,
    ai_explanation: null,
    ai_confidence: null,
    ai_error: null,
    cuisine_type: null,
    price_tier: null,
    personal_rating: null,
    ...partial,
  });

  const lovedRestaurant = makeEntry({
    id: "r-loved",
    kind: "restaurant",
    title: "Vernick Food & Drink",
    cuisine_type: "New American",
    price_tier: 3,
    personal_rating: 9.5,
    body: "Best roast chicken and toast.",
  });
  const dislikedRestaurant = makeEntry({
    id: "r-disliked",
    kind: "restaurant",
    title: "Tourist Trap Cafe",
    cuisine_type: "Diner",
    price_tier: 2,
    personal_rating: 5.5,
    body: "Skip this.",
  });
  const lovedLandmark = makeEntry({
    id: "l-loved",
    kind: "landmark",
    title: "Barnes Foundation",
    place_name: "Benjamin Franklin Pkwy",
    personal_rating: 9.0,
    body: "Unbelievable Impressionist collection.",
  });

  assert(
    shouldSelectForPreset(lovedRestaurant, "8plus") === true,
    "9.5/10 restaurant is auto-selected in 8+ preset",
  );
  assert(
    shouldSelectForPreset(dislikedRestaurant, "8plus") === false,
    "5.5/10 disliked place is excluded by default in 8+ preset",
  );
  assert(
    shouldSelectForPreset(lovedLandmark, "9plus") === true,
    "9.0/10 landmark is auto-selected in 9+ preset",
  );

  const shareText = formatDestinationShareText({
    cityName: "Philadelphia",
    country: "USA",
    entries: [lovedRestaurant, lovedLandmark],
  });
  assert(
    shareText.includes("My Philadelphia, USA Recommendations"),
    "share list header scoped to single destination",
  );
  assert(
    shareText.includes("WHERE TO EAT & DRINK") && shareText.includes("Vernick Food & Drink (9.5/10 · New American · $$$)"),
    "share list formats dining recommendations with score, cuisine, and price",
  );
  assert(
    shareText.includes("PLACES & THINGS TO DO") && shareText.includes("Barnes Foundation (9.0/10 · Benjamin Franklin Pkwy)"),
    "share list formats landmarks & things to do",
  );
  assert(
    !shareText.includes("Tourist Trap Cafe"),
    "unchecked low-rated places are excluded from shared text",
  );

  // Editorial Album Print Density (AGENTS.md rule)
  assert(albumDensity("auto", 4, 4) === "feature", "1-5 memories use feature density");
  assert(albumDensity("auto", 10, 12) === "magazine", "6-16 memories use magazine density");
  assert(albumDensity("auto", 3, 24) === "contact", "multi-photo count >= 17 uses contact density");
  assert(albumDensity("magazine", 30, 30) === "magazine", "manual density mode override respected");
}

export async function runAllVerificationSuites() {
  verifyTierCalculations();
  await verifyGuestLifecycleAndCleanup();
  await verifyServerAccessGates();
  verifyUserJourneys();
}
