import { useSyncExternalStore } from "react";
import type { City, Entry, Kind, Trip } from "@/lib/touri";

const STORAGE_KEY = "touri_guest_state_v1";
const DB_NAME = "touri_guest_blobs_v1";
const STORE_NAME = "blobs";

export type GuestPhotoRecord = {
  id: string;
  entry_id: string;
  storage_path: string; // "guest://<id>"
  sha256: string | null;
  width: number;
  height: number;
  bytes: number;
  mime: string;
  captured_at: string | null;
  lat: number | null;
  lng: number | null;
};

export type GuestState = {
  trips: Trip[];
  cities: City[];
  entries: Entry[];
  photos: GuestPhotoRecord[];
};

const EMPTY_STATE: GuestState = {
  trips: [],
  cities: [],
  entries: [],
  photos: [],
};

let cachedState: GuestState | null = null;
const listeners = new Set<() => void>();
const blobUrlCache = new Map<string, string>();

function notify() {
  listeners.forEach((l) => l());
}

function hydrateEntries(raw: GuestState): GuestState {
  const photosByEntry = new Map<string, GuestPhotoRecord[]>();
  for (const p of raw.photos) {
    const list = photosByEntry.get(p.entry_id) ?? [];
    list.push(p);
    photosByEntry.set(p.entry_id, list);
  }
  const cityById = new Map<string, City>();
  for (const c of raw.cities) cityById.set(c.id, c);

  const entries = raw.entries.map((e) => {
    const city = e.city_id ? cityById.get(e.city_id) : null;
    return {
      ...e,
      entry_photos: (photosByEntry.get(e.id) ?? []).map((p) => ({
        id: p.id,
        storage_path: p.storage_path,
        sha256: p.sha256,
      })),
      cities: city ? { id: city.id, name: city.name, country: city.country } : null,
    };
  });

  return {
    trips: raw.trips,
    cities: raw.cities,
    entries,
    photos: raw.photos,
  };
}

export function getGuestState(): GuestState {
  if (typeof window === "undefined") return EMPTY_STATE;
  if (cachedState) return cachedState;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedState = EMPTY_STATE;
      return cachedState;
    }
    const parsed = JSON.parse(raw) as Partial<GuestState>;
    cachedState = hydrateEntries({
      trips: parsed.trips ?? [],
      cities: parsed.cities ?? [],
      entries: parsed.entries ?? [],
      photos: parsed.photos ?? [],
    });
    return cachedState;
  } catch {
    cachedState = EMPTY_STATE;
    return cachedState;
  }
}

function saveGuestState(next: GuestState) {
  cachedState = hydrateEntries(next);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedState));
    } catch {
      // Ignore storage quota errors
    }
  }
  notify();
}

export function subscribeGuestState(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useGuestState(): GuestState {
  return useSyncExternalStore(
    subscribeGuestState,
    () => getGuestState(),
    () => EMPTY_STATE,
  );
}

// ============================================================================
// IndexedDB Blob Storage for Guest Photos
// ============================================================================

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB error"));
  });
}

export async function putGuestBlob(path: string, blob: Blob): Promise<void> {
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(path, url);
  try {
    const db = await openBlobDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, path);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to in-memory object URL if IndexedDB is blocked in private mode
  }
}

export async function getGuestBlob(path: string): Promise<Blob | null> {
  try {
    const db = await openBlobDb();
    return await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(path);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function resolveGuestPhotoUrl(path: string): Promise<string> {
  const cached = blobUrlCache.get(path);
  if (cached) return cached;
  const blob = await getGuestBlob(path);
  if (!blob) throw new Error("Guest photo no longer in browser cache");
  const url = URL.createObjectURL(blob);
  blobUrlCache.set(path, url);
  return url;
}

// ============================================================================
// Guest Mutations (Trips, Cities, Entries, Photos)
// ============================================================================

export function ensureGuestTripAndCity(): { trip: Trip; city: City | null } {
  const current = getGuestState();
  const existingTrip = current.trips.find((t) => t.is_active) ?? current.trips[0];
  if (existingTrip) {
    const existingCity =
      current.cities.find((c) => c.trip_id === existingTrip.id) ?? null;
    return { trip: existingTrip, city: existingCity };
  }

  const today = new Date().toISOString().slice(0, 10);
  const trip: Trip = {
    id: `guest-trip-${crypto.randomUUID()}`,
    title: "My Trip Journal",
    subtitle: "Guest preview — sign up to save to the cloud",
    start_date: today,
    end_date: null,
    is_active: true,
  };
  saveGuestState({
    ...current,
    trips: [trip],
  });
  return { trip, city: null };
}

export function createGuestTrip(input: {
  title: string;
  start_date: string | null;
  end_date: string | null;
  cities: {
    name: string;
    country: string | null;
    start_date: string | null;
    end_date: string | null;
    lat: number | null;
    lng: number | null;
  }[];
}): Trip {
  const current = getGuestState();
  const tripId = `guest-trip-${crypto.randomUUID()}`;
  const trip: Trip = {
    id: tripId,
    title: input.title,
    subtitle: null,
    start_date: input.start_date,
    end_date: input.end_date,
    is_active: true,
  };
  const nextTrips = [
    trip,
    ...current.trips.map((t) => ({ ...t, is_active: false })),
  ];
  const newCities: City[] = input.cities.map((c, idx) => ({
    id: `guest-city-${crypto.randomUUID()}`,
    trip_id: tripId,
    name: c.name,
    country: c.country,
    start_date: c.start_date,
    end_date: c.end_date,
    sort_order: idx,
    lat: c.lat,
    lng: c.lng,
  }));
  saveGuestState({
    ...current,
    trips: nextTrips,
    cities: [...current.cities, ...newCities],
  });
  return trip;
}

export function addGuestEntry(input: {
  trip_id: string | null;
  city_id: string | null;
  kind: Kind;
  title: string | null;
  body: string | null;
  place_name?: string | null;
  occurred_at: string;
  status?: string;
  cuisine_type?: string | null;
  price_tier?: number | null;
  personal_rating?: number | null;
}): Entry {
  const current = getGuestState();
  const activeTripId =
    input.trip_id ??
    current.trips.find((t) => t.is_active)?.id ??
    ensureGuestTripAndCity().trip.id;

  const entry: Entry = {
    id: `guest-entry-${crypto.randomUUID()}`,
    trip_id: activeTripId,
    city_id: input.city_id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    place_name: input.place_name ?? null,
    occurred_at: input.occurred_at,
    status: input.status ?? "confirmed",
    landmark_id: null,
    ai_status: "none",
    ai_suggestion: null,
    ai_place: null,
    ai_explanation: null,
    ai_confidence: null,
    ai_error: null,
    cuisine_type: input.cuisine_type ?? null,
    price_tier: input.price_tier ?? null,
    personal_rating: input.personal_rating ?? null,
    google_rating: null,
    google_review_count: null,
    date_unknown: false,
    entry_photos: [],
  };

  saveGuestState({
    ...current,
    entries: [entry, ...current.entries],
  });
  return entry;
}

export async function addGuestPhotoEntry(input: {
  tripId: string | null;
  cityId: string | null;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  hash: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
}): Promise<{ entry: Entry; photo: GuestPhotoRecord } | { duplicate: true }> {
  const current = getGuestState();
  if (current.photos.some((p) => p.sha256 === input.hash)) {
    return { duplicate: true };
  }

  const ensured = ensureGuestTripAndCity();
  const tripId = input.tripId ?? ensured.trip.id;
  const cityId = input.cityId ?? ensured.city?.id ?? null;

  const entryId = `guest-entry-${crypto.randomUUID()}`;
  const photoId = `guest-photo-${crypto.randomUUID()}`;
  const storagePath = `guest://${photoId}`;

  await putGuestBlob(storagePath, input.blob);

  const photo: GuestPhotoRecord = {
    id: photoId,
    entry_id: entryId,
    storage_path: storagePath,
    sha256: input.hash,
    width: input.width,
    height: input.height,
    bytes: input.blob.size,
    mime: input.mime,
    captured_at: input.capturedAt,
    lat: input.lat,
    lng: input.lng,
  };

  const entry: Entry = {
    id: entryId,
    trip_id: tripId,
    city_id: cityId,
    kind: "photo",
    title: null,
    body: null,
    place_name: null,
    occurred_at: input.capturedAt,
    status: "pending",
    landmark_id: null,
    ai_status: "none",
    ai_suggestion: null,
    ai_place: null,
    ai_explanation: null,
    ai_confidence: null,
    ai_error: null,
    cuisine_type: null,
    price_tier: null,
    personal_rating: null,
    google_rating: null,
    google_review_count: null,
    date_unknown: false,
  };

  saveGuestState({
    ...current,
    entries: [entry, ...current.entries],
    photos: [...current.photos, photo],
  });

  return { entry, photo };
}

export function updateGuestEntry(entryId: string, patch: Partial<Entry>) {
  const current = getGuestState();
  saveGuestState({
    ...current,
    entries: current.entries.map((e) => (e.id === entryId ? { ...e, ...patch } : e)),
  });
}

export function updateGuestEntriesStatus(entryIds: string[], status: string) {
  const idSet = new Set(entryIds);
  const current = getGuestState();
  saveGuestState({
    ...current,
    entries: current.entries.map((e) => (idSet.has(e.id) ? { ...e, status } : e)),
  });
}

export function deleteGuestEntries(entryIds: string[]) {
  const idSet = new Set(entryIds);
  const current = getGuestState();
  saveGuestState({
    ...current,
    entries: current.entries.filter((e) => !idSet.has(e.id)),
    photos: current.photos.filter((p) => !idSet.has(p.entry_id)),
  });
}

export async function clearGuestState(): Promise<void> {
  cachedState = EMPTY_STATE;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  try {
    const db = await openBlobDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
  notify();
}

