import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { identifyLandmark } from "@/lib/ai.functions";
import { blobToDataUrl, optimizePhoto } from "@/lib/images";

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
}

/** Re-run recognition for a single already-uploaded photo. */
export async function retryRecognition(entryId: string, storagePath: string, hash: string | null) {
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
    await supabase
      .from("entries")
      .update({
        ai_status: "failed",
        ai_processed_at: new Date().toISOString(),
        ai_error: err instanceof Error ? err.message : "Recognition failed",
      })
      .eq("id", entryId);
  }
  onChanged?.();
}

type BatchContext = { userId: string; tripId: string | null; cityId: string | null };

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

  const aiJobs: { entryId: string; hash: string; dataUrl: string }[] = [];
  const CONCURRENCY = 3;
  let cursor = 0;

  async function worker() {
    while (cursor < files.length) {
      const index = cursor++;
      const file = files[index]!;
      const item = items[index]!;
      try {
        patch(item.id, { status: "optimizing" });
        set({ phase: "optimizing" });
        const opt = await optimizePhoto(file);

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

        const { data: entry, error: entryErr } = await supabase
          .from("entries")
          .insert({
            user_id: ctx.userId,
            trip_id: ctx.tripId,
            city_id: ctx.cityId,
            kind: "photo",
            status: "pending",
            ai_status: "processing",
            occurred_at: opt.meta.capturedAt ?? new Date().toISOString(),
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

        aiJobs.push({ entryId: entry.id, hash: opt.hash, dataUrl: await blobToDataUrl(opt.blob) });
        patch(item.id, { status: "uploaded" });
        set({ uploaded: state.uploaded + 1 });
        onChanged?.();
      } catch (err) {
        patch(item.id, {
          status: "failed",
          ai: "skipped",
          error: err instanceof Error ? err.message : "Upload failed",
        });
        set({ failed: state.failed + 1 });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, files.length) }, worker));
  onChanged?.();

  // Recognition runs after upload, two at a time, and never blocks the photos.
  set({ phase: aiJobs.length ? "thinking" : "done" });
  const uploadedItems = state.items.filter((i) => i.status === "uploaded");
  let aiCursor = 0;

  async function aiWorker() {
    while (aiCursor < aiJobs.length) {
      const index = aiCursor++;
      const job = aiJobs[index]!;
      const item = uploadedItems[index];
      if (item) patch(item.id, { ai: "running" });
      try {
        await runAi(job.entryId, job.hash, ctx.userId, job.dataUrl);
        if (item) patch(item.id, { ai: "done" });
      } catch (err) {
        await supabase
          .from("entries")
          .update({
            ai_status: "failed",
            ai_processed_at: new Date().toISOString(),
            ai_error: err instanceof Error ? err.message : "Recognition failed",
          })
          .eq("id", job.entryId);
        if (item) patch(item.id, { ai: "failed" });
      }
      onChanged?.();
    }
  }

  await Promise.all(Array.from({ length: Math.min(2, aiJobs.length) }, aiWorker));
  set({ running: false, phase: "done" });
  onChanged?.();
}
