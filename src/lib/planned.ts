import { supabase } from "@/integrations/supabase/client";
import { optimizePhoto } from "@/lib/images";

/** Attach a photo to a planned entry and turn it into a confirmed memory. */
export async function confirmPlannedWithPhoto(entryId: string, file: File) {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Please sign in again.");

  const opt = await optimizePhoto(file);
  const path = `${uid}/${crypto.randomUUID()}.${opt.ext}`;
  const { error: upErr } = await supabase.storage
    .from("memories")
    .upload(path, opt.blob, { contentType: opt.mime, upsert: false });
  if (upErr) throw upErr;

  const { error: photoErr } = await supabase.from("entry_photos").insert({
    user_id: uid,
    entry_id: entryId,
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
  if (photoErr) throw photoErr;

  const { error } = await supabase
    .from("entries")
    .update({
      status: "confirmed",
      date_unknown: false,
      ...(opt.meta.capturedAt ? { occurred_at: opt.meta.capturedAt } : {}),
    })
    .eq("id", entryId);
  if (error) throw error;
}
