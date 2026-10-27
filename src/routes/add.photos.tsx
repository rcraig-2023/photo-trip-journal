import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Require } from "@/components/Require";
import { UpgradeDialog } from "@/components/UpgradeDialog";
import { TIER_LIMITS, useTierAccess } from "@/lib/tiers";
import { useActiveTrip, useCities } from "@/lib/touri";
import { enqueuePhotos, onQueueChange, useUploadQueue } from "@/lib/uploadQueue";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/add/photos")({
  validateSearch: (search: Record<string, unknown>) => ({
    city: typeof search["city"] === "string" ? (search["city"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Add photos — Touri" },
      {
        name: "description",
        content: "Pick a batch of photos straight from your phone and let Touri file them.",
      },
      { property: "og:title", content: "Add photos — Touri" },
      {
        property: "og:description",
        content: "Pick a batch of photos straight from your phone and let Touri file them.",
      },
    ],
  }),
  component: () => (
    <Require>
      <AppShell>
        <AddPhotos />
      </AppShell>
    </Require>
  ),
});

const PHASE_COPY: Record<string, string> = {
  preparing: "Preparing photos…",
  optimizing: "Optimizing photos…",
  uploading: "Uploading photos…",
  thinking: "Looking for places…",
};

function AddPhotos() {
  const { city: cityFromContext } = Route.useSearch();
  const { trip } = useActiveTrip();
  const cities = useCities(trip?.id);
  const access = useTierAccess(trip?.id);
  const [cityId, setCityId] = useState<string | null>(cityFromContext ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const queue = useUploadQueue();

  useEffect(() => {
    onQueueChange(() => qc.invalidateQueries());
  }, [qc]);

  const chosenCity = cityId ?? cityFromContext ?? cities.data?.[0]?.id ?? null;
  const previews = useMemo(() => files.slice(0, 9).map((f) => URL.createObjectURL(f)), [files]);

  function onSelectFiles(selected: File[]) {
    if (!selected.length) return;
    if (access.photosRemaining <= 0) {
      setUpgradeReason(
        !access.isAuthenticated
          ? `Guest preview includes up to ${TIER_LIMITS.guest.maxPhotos} local photos. Create a free account to save them to the cloud and add up to ${TIER_LIMITS.free.maxPhotos} photos.`
          : `You've used all ${access.limits.maxPhotos} photos on Free Explorer. Unlock a Trip Pass ($9) or Touri Pro ($29/yr) to add up to 500 photos per trip.`,
      );
      setUpgradeOpen(true);
      return;
    }

    if (selected.length > access.photosRemaining) {
      const allowed = selected.slice(0, access.photosRemaining);
      setFiles(allowed);
      setUpgradeReason(
        !access.isAuthenticated
          ? `Selected the first ${allowed.length} photo${allowed.length === 1 ? "" : "s"} (${TIER_LIMITS.guest.maxPhotos} max in Guest preview). Create a free account to add more.`
          : `Selected the first ${allowed.length} photo${allowed.length === 1 ? "" : "s"} (${access.photosRemaining} remaining on Free Explorer). Unlock a Trip Pass to upload your full camera roll.`,
      );
      setUpgradeOpen(true);
      return;
    }

    setFiles(selected);
  }

  async function start() {
    if (!files.length) return;
    if (access.photosRemaining <= 0) {
      setUpgradeOpen(true);
      return;
    }

    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id ?? null;
    const batch = files.slice(0, access.photosRemaining);
    setFiles([]);

    toast.success(
      uid
        ? `${batch.length} photo${batch.length > 1 ? "s" : ""} on their way — keep browsing.`
        : `${batch.length} photo${batch.length > 1 ? "s" : ""} added to your browser preview.`,
    );
    navigate({ to: "/memories" });
    await enqueuePhotos(batch, {
      userId: uid,
      tripId: trip?.id ?? null,
      cityId: chosenCity,
      maxAiAllowed: access.aiScansRemaining,
    });
    qc.invalidateQueries();
  }

  return (
    <div className="px-6 pt-12">
      <span className="eyebrow">Add</span>
      <h1 className="display mt-5 text-[2.8rem]">Photos from your phone</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Select as many as you like. Touri shrinks them so they travel light, sorts them by the time
        they were taken, and files them in New memories. You can leave this screen while it works.
      </p>

      {/* Tier Quota Indicator */}
      {!access.isPaid && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border border-rule bg-paper px-4 py-3 text-xs">
          <span className="text-muted-foreground">
            <strong className="font-medium text-foreground">{access.limits.label}:</strong>{" "}
            {access.photosRemaining} of {access.limits.maxPhotos} photo slots left
            {access.isAuthenticated
              ? ` · ${access.aiScansRemaining} of ${access.limits.maxAiScans} AI scans left`
              : " · Stored locally in browser"}
          </span>
          <button
            type="button"
            onClick={() => {
              setUpgradeReason(null);
              setUpgradeOpen(true);
            }}
            className="text-[0.68rem] uppercase tracking-[0.14em] text-accent underline underline-offset-4"
          >
            {access.isAuthenticated ? "Unlock Trip Pass →" : "Save to cloud →"}
          </button>
        </div>
      )}

      <h2 className="eyebrow mt-10">City</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {cities.data?.map((c) => (
          <button
            key={c.id}
            onClick={() => setCityId(c.id)}
            className={cn(
              "border border-rule px-4 py-2 text-sm",
              chosenCity === c.id && "border-accent text-accent",
            )}
          >
            {c.name}
          </button>
        ))}
        {!cities.data?.length && (
          <p className="text-sm text-muted-foreground">
            {access.isAuthenticated
              ? "Add a city to your trip first."
              : "No city yet — photos will be added to your starter journal."}
          </p>
        )}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onSelectFiles(Array.from(e.target.files ?? []))}
      />
      <button
        onClick={() => input.current?.click()}
        className="mt-10 w-full border border-dashed border-rule py-14 text-xs uppercase tracking-[0.18em]"
      >
        {files.length ? `${files.length} photos selected — change` : "Choose photos"}
      </button>

      {!!previews.length && (
        <div className="mt-4 grid grid-cols-3 gap-1">
          {previews.map((src, i) => (
            <img key={i} src={src} alt="" className="aspect-square w-full object-cover" />
          ))}
        </div>
      )}

      {queue.running && (
        <p className="mt-6 text-sm text-muted-foreground">
          {PHASE_COPY[queue.phase] ?? "Working…"} {queue.uploaded}/{queue.total}
        </p>
      )}

      <button
        disabled={!files.length || queue.running}
        onClick={start}
        className="mt-8 w-full bg-primary py-4 text-xs uppercase tracking-[0.18em] text-primary-foreground disabled:opacity-40"
      >
        {queue.running ? "Working…" : access.isAuthenticated ? "Upload" : "Preview in journal"}
      </button>

      <UpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        tripId={trip?.id}
        tripTitle={trip?.title}
        reason={upgradeReason}
      />
    </div>
  );
}
