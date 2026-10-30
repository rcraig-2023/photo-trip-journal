import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { deleteGuestTrip } from "@/lib/guestStore";
import { useSession } from "@/lib/session";
import type { Trip } from "@/lib/touri";

export async function deleteTripCompletely(tripId: string, userId?: string | null): Promise<void> {
  if (!userId || tripId.startsWith("guest-")) {
    deleteGuestTrip(tripId);
    return;
  }

  // 1. Collect all entries and photo storage paths for this trip
  const { data: entries } = await supabase
    .from("entries")
    .select("id, entry_photos(storage_path)")
    .eq("trip_id", tripId);

  const entryIds = (entries ?? []).map((e) => e.id);
  const storagePaths: string[] = [];
  for (const entry of entries ?? []) {
    for (const p of entry.entry_photos ?? []) {
      if (p.storage_path && !p.storage_path.startsWith("guest://")) {
        storagePaths.push(p.storage_path);
      }
    }
  }

  // 2. Remove photo files from Supabase storage
  if (storagePaths.length > 0) {
    await supabase.storage.from("memories").remove(storagePaths);
  }

  // 3. Delete dependent rows in order so foreign keys never block deletion
  if (entryIds.length > 0) {
    await supabase.from("entry_photos").delete().in("entry_id", entryIds);
  }
  const { error: entriesErr } = await supabase.from("entries").delete().eq("trip_id", tripId);
  if (entriesErr) throw entriesErr;

  await supabase.from("landmarks").delete().eq("trip_id", tripId);

  const { error: citiesErr } = await supabase.from("cities").delete().eq("trip_id", tripId);
  if (citiesErr) throw citiesErr;

  // 4. Delete the trip itself
  const { error: tripErr } = await supabase
    .from("trips")
    .delete()
    .eq("id", tripId)
    .eq("user_id", userId);
  if (tripErr) throw tripErr;

  // 5. If no active trip remains, promote the user's most recent remaining trip to active
  const { data: remainingTrips } = await supabase
    .from("trips")
    .select("id, is_active")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (remainingTrips && remainingTrips.length > 0 && !remainingTrips.some((t) => t.is_active)) {
    const nextTripId = remainingTrips[0]?.id;
    if (nextTripId) {
      await supabase.from("trips").update({ is_active: true }).eq("id", nextTripId);
    }
  }
}

export function DeleteTripDialog({
  open,
  onOpenChange,
  trip,
  onDeleted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trip: Pick<Trip, "id" | "title"> | null | undefined;
  onDeleted?: (() => void) | undefined;
}) {
  const { user } = useSession();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2>(1);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setDeleting(false);
    }
  }, [open, trip?.id]);

  if (!trip) return null;

  async function handleConfirmDelete() {
    if (!trip || deleting) return;
    setDeleting(true);
    try {
      await deleteTripCompletely(trip.id, user?.id);
      await qc.invalidateQueries();
      toast.success(`Deleted "${trip.title}"`);
      onOpenChange(false);
      onDeleted?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete trip.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-rule bg-background p-6">
        <DialogHeader>
          <span className="eyebrow inline-flex items-center gap-1.5 text-destructive">
            <AlertTriangle className="size-3.5" />
            {step === 1 ? "Step 1 of 2 · Confirm Deletion" : "Step 2 of 2 · Final Confirmation"}
          </span>
          <DialogTitle className="display mt-1 text-2xl font-normal">
            {step === 1
              ? `Are you sure you want to delete "${trip.title}"?`
              : `Permanently delete "${trip.title}"?`}
          </DialogTitle>
          <DialogDescription className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {step === 1
              ? "Deleting this trip will remove all of its cities, planned itinerary items, ratings, and uploaded photos from your journal."
              : "This is your final confirmation. Once deleted, this trip and all of its memories and photos cannot be recovered."}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="border border-rule px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              Yes, I'm sure →
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <div className="border border-destructive/40 bg-destructive/5 p-3.5 text-xs leading-relaxed text-foreground">
              You are about to permanently delete <span className="font-medium">"{trip.title}"</span> and every memory logged inside it. Are you absolutely sure?
            </div>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setStep(1)}
                className="border border-rule px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
              >
                ← Go back
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                className="inline-flex items-center gap-1.5 bg-destructive px-4 py-2.5 text-xs uppercase tracking-[0.16em] text-destructive-foreground disabled:opacity-50"
              >
                <Trash2 className="size-3.5" />
                {deleting ? "Deleting…" : "Permanently delete trip"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
