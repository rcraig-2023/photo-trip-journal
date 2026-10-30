import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchGoogleRatings, identifyLandmark } from "@/lib/ai.functions";
import { blobToDataUrl, optimizePhoto } from "@/lib/images";
import { ensureEnrichment, findOrCreateLandmark } from "@/lib/landmarks";
import {
  addGuestPhotoEntry,
  clearGuestState,
  getGuestBlob,
  getGuestState,
} from "@/lib/guestStore";
import { TIER_LIMITS } from "@/lib/tiers";

export type ItemStatus = "waiting" | "optimizing" | "uploading" | "uploaded" | "duplicate" | "failed";
export type AiStatus = "waiting" | "running" | "done" | "failed" | "skipped";

export type QueueItem = {
  id: string;
  name: string;
  status: ItemStatus;
  ai: AiStatus;
  error?: string;
};

export type QueueState = {
  running: boolean;
  phase: "idle" | "preparing" | "optimizing" | "uploading" | "thinking" | "done";
  items: QueueItem[];
  total: number;
  uploaded: number;
  failed: number;
};

let state: QueueState = {
  running: false,
  phase: "idle",
  items: [],
  total: 0,
  uploaded: 0,
  failed: 0,
};

const listeners = new Set<() => void>();
let onChanged: (() => void) | null = null;

function set(next: Partial<QueueState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function patch(id: string, next: Partial<QueueItem>) {
  set({ items: state.items.map((i) => (i.id === id ? { ...i, ...next } : i)) });
}

export function onQueueChange(cb: () => void) {
  onChanged = cb;
}

export function useUploadQueue() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export function clearQueue() {
  if (state.running) return;
  set({ items: [], total: 0, uploaded: 0, failed: 0, phase: "idle" });
}

async function runAi(entryId: string, hash: string, userId: string, dataUrl: string) {
  const { data: cached } = await supabase
    .from("ai_image_results")
    .select("*")
    .eq("image_hash", hash)
    .maybeSingle();

  let result = cached
    ? {
        name: cached.name ?? "",
        kind: (cached.kind ?? "photo") as "photo" | "landmark" | "restaurant",
        place: cached.place_name ?? "",
        confidence: Number(cached.confidence ?? 0),
        explanation: cached.explanation ?? "",
      }
    : null;

  if (!result) {
    const fresh = await identifyLandmark({ data: { imageDataUrl: dataUrl } });
    result = fresh;
    await supabase.from("ai_image_results").insert({
      user_id: userId,
      image_hash: hash,
      name: fresh.name || null,
      kind: fresh.kind,
      place_name: fresh.place || null,
      confidence: fresh.confidence,
      explanation: fresh.explanation || null,
    });
  }

  await supabase
    .from("entries")
    .update({
      ai_status: "done",
      ai_processed_at: new Date().toISOString(),
      ai_suggestion: result.name || null,
      ai_place: result.place || null,
      ai_confidence: result.confidence,
      ai_explanation: result.explanation || null,
      ai_error: null,
    })
    .eq("id", entryId);

  // Smart Match: attach to a matching planned entry (restaurant or landmark/museum)
  // by AI-recognised place name or by EXIF timestamp window on the same day.
  const matchedPlan = await attachToPlannedMatch(entryId, result.name, result.kind);
  if (matchedPlan) {
    if (matchedPlan.kind === "restaurant") {
      try {
        await fetchGoogleRatings({ data: { entryIds: [matchedPlan.id] } });
      } catch (e) {
        console.error("Google rating lookup failed", e);
      }
    } else if (matchedPlan.kind === "landmark" && (result.name || matchedPlan.title)) {
      try {
        const lm = await findOrCreateLandmark({
          userId,
          name: result.name || matchedPlan.title!,
          placeName: result.place || null,
          tripId: matchedPlan.trip_id,
          cityId: matchedPlan.city_id,
        });
        await supabase
          .from("entries")
          .update({ landmark_id: lm.id })
          .eq("id", matchedPlan.id);
        void ensureEnrichment(lm).catch(() => {});
      } catch {
        // Ignore enrichment errors
      }
    }
    return;
  }

  // Unmatched photo recognised as a restaurant: name this entry and fetch Google rating.
  if (result.kind === "restaurant" && result.name) {
    await supabase
      .from("entries")
      .update({ kind: "restaurant", title: result.name, place_name: result.place || null })
      .eq("id", entryId);
    try {
      await fetchGoogleRatings({ data: { entryIds: [entryId] } });
    } catch (e) {
      console.error("Google rating lookup failed", e);
    }
  }
}

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

function namesMatch(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

const THREE_HOURS_MS = 3 * 60 * 60 * 1000;

/**
 * Moves the photo onto a planned entry in the same trip whose name matches OR
 * whose scheduled timestamp falls within 3 hours on the same day, confirms it,
 * and removes the temporary photo entry.
 */
async function attachToPlannedMatch(
  photoEntryId: string,
  name: string,
  detectedKind: "photo" | "landmark" | "restaurant",
): Promise<{
  id: string;
  kind: "photo" | "landmark" | "restaurant" | "jot";
  title: string | null;
  trip_id: string | null;
  city_id: string | null;
} | null> {
  const { data: src } = await supabase
    .from("entries")
    .select("id, trip_id, city_id, occurred_at")
    .eq("id", photoEntryId)
    .maybeSingle();
  if (!src?.trip_id) return null;

  const { data: plans } = await supabase
    .from("entries")
    .select("id, title, place_name, city_id, kind, occurred_at, date_unknown")
    .eq("trip_id", src.trip_id)
    .eq("status", "planned");
  if (!plans?.length) return null;

  // 1. Primary match: AI-recognised place name matches a planned entry's title or place_name
  let match = name
    ? plans.find(
        (p) => namesMatch(p.title ?? "", name) || namesMatch(p.place_name ?? "", name),
      )
    : undefined;

  // 2. Secondary match: EXIF timestamp falls within 3 hours of a scheduled plan on the same day
  if (!match && src.occurred_at) {
    const srcDay = src.occurred_at.slice(0, 10);
    const srcTime = new Date(src.occurred_at).getTime();
    if (!isNaN(srcTime)) {
      const candidates = plans
        .filter((p) => {
          if (p.date_unknown || !p.occurred_at) return false;
          if (p.occurred_at.slice(0, 10) !== srcDay) return false;
          if (src.city_id && p.city_id && p.city_id !== src.city_id) return false;
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
      match = candidates[0];
    }
  }

  if (!match) return null;

  const { error: moveErr } = await supabase
    .from("entry_photos")
    .update({ entry_id: match.id })
    .eq("entry_id", photoEntryId);
  if (moveErr) return null;

  const resolvedKind = (
    match.kind === "restaurant" || match.kind === "landmark"
      ? match.kind
      : detectedKind !== "photo"
        ? detectedKind
        : match.kind
  ) as "photo" | "landmark" | "restaurant" | "jot";
  const resolvedCityId = match.city_id ?? src.city_id;

  await supabase
    .from("entries")
    .update({
      status: "confirmed",
      date_unknown: false,
      kind: resolvedKind,
      trip_id: src.trip_id,
      city_id: resolvedCityId,
    })
    .eq("id", match.id);
  await supabase.from("entries").delete().eq("id", photoEntryId);
  return {
    id: match.id,
    kind: resolvedKind,
    title: match.title,
    trip_id: src.trip_id,
    city_id: resolvedCityId,
  };
}

/** Re-run recognition for a single already-uploaded photo. */
export async function retryRecognition(entryId: string, storagePath: string, hash: string | null) {
  if (storagePath.startsWith("guest://")) {
    toast.info("Create a free account to run AI place recognition on your photos.");
    return;
  }
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  await supabase.from("entries").update({ ai_status: "processing", ai_error: null }).eq("id", entryId);
  try {
    const { data: file, error } = await supabase.storage.from("memories").download(storagePath);
    if (error || !file) throw error ?? new Error("Photo unavailable");
    const dataUrl = await blobToDataUrl(file);
    await runAi(entryId, hash ?? storagePath, uid, dataUrl);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Recognition failed";
    await supabase
      .from("entries")
      .update({
        ai_status: "failed",
        ai_processed_at: new Date().toISOString(),
        ai_error: msg,
      })
      .eq("id", entryId);
    toast.error(msg);
  }
  onChanged?.();
}

type BatchContext = {
  userId: string | null; // null = Guest mode (saved locally in IndexedDB)
  tripId: string | null;
  cityId: string | null;
  maxAiAllowed?: number;
};

/**
 * Optimize -> dedupe -> upload -> (async) recognise. Keeps running after the
 * user navigates away; a failed AI call never fails the upload.
 */
export async function enqueuePhotos(files: File[], ctx: BatchContext) {
  if (!files.length || state.running) return;

  const items: QueueItem[] = files.map((f, i) => ({
    id: `${Date.now()}-${i}`,
    name: f.name,
    status: "waiting",
    ai: "waiting",
  }));
  set({ running: true, phase: "preparing", items, total: files.length, uploaded: 0, failed: 0 });

  const aiJobs: { entryId: string; hash: string; dataUrl: string; itemId: string }[] = [];
  const CONCURRENCY = 3;
  let cursor = 0;
  let aiBudgetRemaining = ctx.userId ? (ctx.maxAiAllowed ?? TIER_LIMITS.free.maxAiScans) : 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index]!;
      const item = items[index]!;
      try {
        patch(item.id, { status: "optimizing" });
        set({ phase: "optimizing" });
        const opt = await optimizePhoto(file);
        const capturedAt = opt.meta.capturedAt ?? new Date().toISOString();

        // Stage 0: Guest Mode -> Save locally in browser IndexedDB ($0 server storage)
        if (!ctx.userId) {
          patch(item.id, { status: "uploading" });
          set({ phase: "uploading" });
          const res = await addGuestPhotoEntry({
            tripId: ctx.tripId,
            cityId: ctx.cityId,
            blob: opt.blob,
            mime: opt.mime,
            width: opt.width,
            height: opt.height,
            hash: opt.hash,
            capturedAt,
            lat: opt.meta.lat,
            lng: opt.meta.lng,
          });
          if ("duplicate" in res) {
            patch(item.id, { status: "duplicate", ai: "skipped" });
            continue;
          }
          patch(item.id, { status: "uploaded", ai: "skipped" });
          set({ uploaded: state.uploaded + 1 });
          onChanged?.();
          continue;
        }

        const { data: dupe } = await supabase
          .from("entry_photos")
          .select("id")
          .eq("sha256", opt.hash)
          .limit(1)
          .maybeSingle();
        if (dupe) {
          patch(item.id, { status: "duplicate", ai: "skipped" });
          continue;
        }

        patch(item.id, { status: "uploading" });
        set({ phase: "uploading" });
        const path = `${ctx.userId}/${crypto.randomUUID()}.${opt.ext}`;
        const { error: upErr } = await supabase.storage
          .from("memories")
          .upload(path, opt.blob, { contentType: opt.mime, upsert: false });
        if (upErr) throw upErr;

        const shouldRunAi = aiBudgetRemaining > 0;
        if (shouldRunAi) aiBudgetRemaining--;

        const { data: entry, error: entryErr } = await supabase
          .from("entries")
          .insert({
            user_id: ctx.userId,
            trip_id: ctx.tripId,
            city_id: ctx.cityId,
            kind: "photo",
            status: "pending",
            ai_status: shouldRunAi ? "processing" : "none",
            occurred_at: capturedAt,
          })
          .select("id")
          .single();
        if (entryErr || !entry) throw entryErr ?? new Error("Could not save memory");

        await supabase.from("entry_photos").insert({
          user_id: ctx.userId,
          entry_id: entry.id,
          storage_path: path,
          sha256: opt.hash,
          width: opt.width,
          height: opt.height,
          bytes: opt.blob.size,
          mime: opt.mime,
          captured_at: opt.meta.capturedAt,
          lat: opt.meta.lat,
          lng: opt.meta.lng,
        });

        if (shouldRunAi) {
          aiJobs.push({
            entryId: entry.id,
            hash: opt.hash,
            dataUrl: await blobToDataUrl(opt.blob),
            itemId: item.id,
          });
        } else {
          patch(item.id, { ai: "skipped" });
        }

        patch(item.id, { status: "uploaded" });
        set({ uploaded: state.uploaded + 1 });
        onChanged?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        patch(item.id, { status: "failed", ai: "skipped", error: message });
        set({ failed: state.failed + 1 });
        toast.error(`Couldn't add “${file.name}”`, { description: message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  onChanged?.();

  // Recognition runs after upload, two at a time, and never blocks the photos.
  set({ phase: aiJobs.length ? "thinking" : "done" });
  let aiCursor = 0;

  async function aiWorker() {
    while (aiCursor < aiJobs.length) {
      const index = aiCursor++;
      const job = aiJobs[index]!;
      patch(job.itemId, { ai: "running" });
      try {
        await runAi(job.entryId, job.hash, ctx.userId!, job.dataUrl);
        patch(job.itemId, { ai: "done" });
      } catch (err) {
        await supabase
          .from("entries")
          .update({
            ai_status: "failed",
            ai_processed_at: new Date().toISOString(),
            ai_error: err instanceof Error ? err.message : "Recognition failed",
          })
          .eq("id", job.entryId);
        patch(job.itemId, { ai: "failed" });
      }
      onChanged?.();
    }
  }

  if (ctx.userId && aiJobs.length) {
    await Promise.all(Array.from({ length: Math.min(2, aiJobs.length) }, aiWorker));
  }
  set({ running: false, phase: "done" });
  onChanged?.();
}

/**
 * Automatically flushes any Guest local trip, city, entries, and IndexedDB photo blobs
 * into the user's permanent Supabase account right after they sign up or sign in.
 */
export async function syncGuestToSupabase(userId: string): Promise<number> {
  const guest = getGuestState();
  if (!guest.trips.length && !guest.entries.length && !guest.photos.length) {
    return 0;
  }

  let syncedEntries = 0;
  try {
    const tripIdMap = new Map<string, string>();
    const cityIdMap = new Map<string, string>();

    for (const gTrip of guest.trips) {
      const { data: createdTrip } = await supabase
        .from("trips")
        .insert({
          user_id: userId,
          title: gTrip.title,
          subtitle: gTrip.subtitle?.includes("Guest preview") ? null : gTrip.subtitle,
          start_date: gTrip.start_date,
          end_date: gTrip.end_date,
          is_active: gTrip.is_active,
        })
        .select("id")
        .single();
      if (createdTrip) {
        tripIdMap.set(gTrip.id, createdTrip.id);
      }
    }

    for (const gCity of guest.cities) {
      const mappedTripId = tripIdMap.get(gCity.trip_id);
      if (!mappedTripId) continue;
      const { data: createdCity } = await supabase
        .from("cities")
        .insert({
          user_id: userId,
          trip_id: mappedTripId,
          name: gCity.name,
          country: gCity.country,
          start_date: gCity.start_date,
          end_date: gCity.end_date,
          sort_order: gCity.sort_order,
          lat: gCity.lat,
          lng: gCity.lng,
        })
        .select("id")
        .single();
      if (createdCity) {
        cityIdMap.set(gCity.id, createdCity.id);
      }
    }

    let aiRemaining: number = TIER_LIMITS.free.maxAiScans;

    for (const gEntry of guest.entries) {
      const mappedTripId = gEntry.trip_id ? (tripIdMap.get(gEntry.trip_id) ?? null) : null;
      const mappedCityId = gEntry.city_id ? (cityIdMap.get(gEntry.city_id) ?? null) : null;
      const attachedPhotos = guest.photos.filter((p) => p.entry_id === gEntry.id);
      const shouldAi = attachedPhotos.length > 0 && aiRemaining > 0;
      if (shouldAi) aiRemaining--;

      const { data: createdEntry } = await supabase
        .from("entries")
        .insert({
          user_id: userId,
          trip_id: mappedTripId,
          city_id: mappedCityId,
          kind: gEntry.kind,
          title: gEntry.title,
          body: gEntry.body,
          place_name: gEntry.place_name,
          occurred_at: gEntry.occurred_at,
          status: gEntry.status,
          ai_status: shouldAi ? "processing" : "none",
          cuisine_type: gEntry.cuisine_type,
          price_tier: gEntry.price_tier,
          personal_rating: gEntry.personal_rating,
          date_unknown: gEntry.date_unknown ?? false,
        })
        .select("id")
        .single();

      if (!createdEntry) continue;
      syncedEntries++;

      for (const gPhoto of attachedPhotos) {
        const blob = await getGuestBlob(gPhoto.storage_path);
        if (!blob) continue;
        const ext = gPhoto.mime === "image/webp" ? "webp" : "jpg";
        const cloudPath = `${userId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("memories")
          .upload(cloudPath, blob, { contentType: gPhoto.mime, upsert: false });
        if (upErr) continue;

        await supabase.from("entry_photos").insert({
          user_id: userId,
          entry_id: createdEntry.id,
          storage_path: cloudPath,
          sha256: gPhoto.sha256,
          width: gPhoto.width,
          height: gPhoto.height,
          bytes: gPhoto.bytes,
          mime: gPhoto.mime,
          captured_at: gPhoto.captured_at,
          lat: gPhoto.lat,
          lng: gPhoto.lng,
        });

        if (shouldAi) {
          const dataUrl = await blobToDataUrl(blob);
          void runAi(
            createdEntry.id,
            gPhoto.sha256 ?? cloudPath,
            userId,
            dataUrl,
          ).catch(() => {});
        }
      }
    }

    await clearGuestState();
    onChanged?.();
  } catch (e) {
    console.error("Failed to sync guest state to Supabase:", e);
  }
  return syncedEntries;
}
